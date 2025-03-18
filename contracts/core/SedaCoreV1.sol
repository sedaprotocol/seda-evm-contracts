// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {IFeeManager} from "../interfaces/IFeeManager.sol";
import {IProver} from "../interfaces/IProver.sol";
import {IRequestHandler} from "../interfaces/IRequestHandler.sol";
import {IResultHandler} from "../interfaces/IResultHandler.sol";
import {ISedaCore} from "../interfaces/ISedaCore.sol";
import {RequestHandlerBase} from "./abstract/RequestHandlerBase.sol";
import {ResultHandlerBase} from "./abstract/ResultHandlerBase.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title SedaCoreV1
/// @notice Core contract for the Seda protocol, managing requests and results
/// @dev Implements ResultHandler and RequestHandler functionalities, and manages active requests
contract SedaCoreV1 is
    ISedaCore,
    RequestHandlerBase,
    ResultHandlerBase,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable
{
    // ============ Types & State ============
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // Constant storage slot for the state following the ERC-7201 standard
    bytes32 private constant CORE_V1_STORAGE_SLOT =
        keccak256(abi.encode(uint256(keccak256("sedacore.storage.v1")) - 1)) & ~bytes32(uint256(0xff));

    struct RequestDetails {
        uint256 timestamp;
        uint256 requestFee;
        uint256 resultFee;
        uint256 batchFee;
        uint256 gasLimit;
        address requestFeeAddr;
        address resultFeeAddr;
        address batchFeeAddr;
    }

    /// @custom:storage-location erc7201:sedacore.storage.v1
    struct SedaCoreStorage {
        // Period in seconds after which a request can be withdrawn
        uint256 timeoutPeriod;
        // Tracks active data requests to ensure proper lifecycle management and prevent
        // duplicate fulfillments. Requests are removed only after successful fulfillment
        EnumerableSet.Bytes32Set pendingRequests;
        // Associates request IDs with their metadata to enable fee distribution and
        // timestamp validation during result submission
        mapping(bytes32 => RequestDetails) requestDetails;
        // Fee manager contract for handling fee distributions
        IFeeManager feeManager;
    }

    // ============ Errors ============

    // Error thrown when a fee manager is required but not set
    error FeeManagerRequired();

    // Error thrown when a result is posted with a timestamp before the corresponding request
    error InvalidResultTimestamp(bytes32 drId, uint256 resultTimestamp, uint256 requestTimestamp);

    // ============ Constructor & Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the SedaCoreV1 contract
    /// @param sedaProverAddress The address of the Seda prover contract
    /// @param initialTimeoutPeriod The initial timeout period for requests
    /// @dev This function replaces the constructor for proxy compatibility and can only be called once
    function initialize(address sedaProverAddress, uint256 initialTimeoutPeriod) external initializer {
        // Initialize inherited contracts
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender);
        __Pausable_init();

        // Initialize derived contracts
        __ResultHandler_init(sedaProverAddress);
        _storageV1().timeoutPeriod = initialTimeoutPeriod;

        // Get the fee manager from the prover
        _storageV1().feeManager = IFeeManager(IProver(sedaProverAddress).getFeeManager());
    }

    // ============ Public Functions ============

    /// @inheritdoc RequestHandlerBase
    /// @dev Overrides the base implementation to also add the request ID and timestamp to storage
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs
    ) public payable override(RequestHandlerBase, IRequestHandler) whenNotPaused returns (bytes32) {
        return postRequest(inputs, 0, 0, 0);
    }

    /// @notice Posts a new request with custom fee allocations
    /// @param inputs The request inputs data
    /// @param requestFee Fee amount for request processing
    /// @param resultFee Fee amount for result submission
    /// @param batchFee Fee amount for batch processing
    /// @return The unique ID of the created request
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs,
        uint256 requestFee,
        uint256 resultFee,
        uint256 batchFee
    ) public payable whenNotPaused returns (bytes32) {
        uint256 totalFees = requestFee + resultFee + batchFee;
        _validateFees(totalFees);

        bytes32 requestId = RequestHandlerBase.postRequest(inputs);

        // Check if the request was already resolved
        if (hasResult(requestId)) {
            revert RequestAlreadyResolved(requestId);
        }

        // Request was not posted before, create new request and store details
        if (_storageV1().requestDetails[requestId].timestamp == 0) {
            // Create new request and store details
            _addRequest(requestId);
            _storageV1().requestDetails[requestId] = RequestDetails({
                timestamp: block.timestamp,
                requestFee: requestFee,
                resultFee: resultFee,
                batchFee: batchFee,
                gasLimit: inputs.execGasLimit + inputs.tallyGasLimit,
                requestFeeAddr: msg.sender,
                resultFeeAddr: msg.sender,
                batchFeeAddr: msg.sender
            });
        } else if (totalFees != 0) {
            // Request was already posted before, increase fees
            increaseFees(requestId, requestFee, resultFee, batchFee);
        }

        return requestId;
    }

    /// @inheritdoc ResultHandlerBase
    /// @dev Overrides the base implementation to validate result timestamp and clean up storage
    function postResult(
        SedaDataTypes.Result calldata result,
        uint64 batchHeight,
        bytes32[] calldata proof
    ) public override(ResultHandlerBase, IResultHandler) whenNotPaused returns (bytes32) {
        RequestDetails memory requestDetails = _storageV1().requestDetails[result.drId];

        // Ensures results can't be submitted with timestamps from before the request was made,
        // preventing potential replay or front-running attacks
        // Note: Validation always passes for non-tracked requests (where requestDetails.timestamp is 0)
        if (result.blockTimestamp <= requestDetails.timestamp) {
            revert InvalidResultTimestamp(result.drId, result.blockTimestamp, requestDetails.timestamp);
        }

        // Call parent contract's postResult implementation and retrieve both the result ID
        // and the batch sender address for subsequent fee distribution logic
        (bytes32 resultId, address batchSender) = super.postResultAndGetBatchSender(result, batchHeight, proof);

        // Clean up state
        _removePendingRequest(result.drId);
        delete _storageV1().requestDetails[result.drId];

        // If fee manager is not set, skip fee distribution
        if (_storageV1().feeManager == IFeeManager(address(0))) {
            return resultId;
        }

        // Handle fee distribution using a separate function
        _handleFeeDistribution(result, requestDetails, batchSender);

        return resultId;
    }

    /// @inheritdoc ISedaCore
    /// @notice Updates fees for a pending request, requiring payment of the difference between new and current fees
    /// @param requestId The ID of the request to update fees for
    /// @param newRequestFee New total amount for request fee (not an increment)
    /// @param newResultFee New total amount for result fee (not an increment)
    /// @param newBatchFee New total amount for batch fee (not an increment)
    function increaseFees(
        bytes32 requestId,
        uint256 newRequestFee,
        uint256 newResultFee,
        uint256 newBatchFee
    ) public payable override(ISedaCore) whenNotPaused {
        // Validate ETH payment matches fee sum to prevent over/underpayment
        _validateFees(newRequestFee + newResultFee + newBatchFee);

        RequestDetails storage details = _storageV1().requestDetails[requestId];
        if (details.timestamp == 0) {
            revert RequestNotFound(requestId);
        }

        // Create a dynamic array for refunds that will be sized exactly as needed
        address[] memory recipients = new address[](3);
        uint256[] memory amounts = new uint256[](3);
        uint256 recipientCount = 0;
        uint256 totalRefund = 0;
        bool anyUpdates = false;

        // Process each fee type
        if (newRequestFee > 0) {
            (bool updated, uint256 refundAmount, address refundAddr) = _processFee(
                requestId,
                FeeType.REQUEST,
                newRequestFee,
                details.requestFee,
                details.requestFeeAddr
            );

            if (updated) {
                details.requestFee = newRequestFee;
                details.requestFeeAddr = msg.sender;
                anyUpdates = true;
            }

            if (refundAmount > 0) {
                recipients[recipientCount] = refundAddr;
                amounts[recipientCount] = refundAmount;
                totalRefund += refundAmount;
                recipientCount++;
            }
        }

        if (newResultFee > 0) {
            (bool updated, uint256 refundAmount, address refundAddr) = _processFee(
                requestId,
                FeeType.RESULT,
                newResultFee,
                details.resultFee,
                details.resultFeeAddr
            );

            if (updated) {
                details.resultFee = newResultFee;
                details.resultFeeAddr = msg.sender;
                anyUpdates = true;
            }

            if (refundAmount > 0) {
                recipients[recipientCount] = refundAddr;
                amounts[recipientCount] = refundAmount;
                totalRefund += refundAmount;
                recipientCount++;
            }
        }

        if (newBatchFee > 0) {
            (bool updated, uint256 refundAmount, address refundAddr) = _processFee(
                requestId,
                FeeType.BATCH,
                newBatchFee,
                details.batchFee,
                details.batchFeeAddr
            );

            if (updated) {
                details.batchFee = newBatchFee;
                details.batchFeeAddr = msg.sender;
                anyUpdates = true;
            }

            if (refundAmount > 0) {
                recipients[recipientCount] = refundAddr;
                amounts[recipientCount] = refundAmount;
                totalRefund += refundAmount;
                recipientCount++;
            }
        }

        // Revert if no fees were updated
        if (!anyUpdates) {
            revert NoFeesUpdated(requestId);
        }

        // Process refunds if any
        if (recipientCount > 0) {
            // Resize arrays to exactly the needed size
            // solhint-disable-next-line no-inline-assembly
            assembly {
                mstore(recipients, recipientCount)
                mstore(amounts, recipientCount)
            }

            // Distribute refunds
            _storageV1().feeManager.addPendingFeesMultiple{value: totalRefund}(recipients, amounts);
        }
    }

    /// @dev Simplified helper to process a single fee type
    /// @param requestId The ID of the request being updated
    /// @param feeType The type of fee being processed
    /// @param newFee The new proposed fee amount
    /// @param currentFee The current fee amount
    /// @param currentFeeAddr The current fee address
    /// @return updated Whether the fee was updated
    /// @return refundAmount Amount to refund (if any)
    /// @return refundAddr Address to refund to (if any)
    function _processFee(
        bytes32 requestId,
        FeeType feeType,
        uint256 newFee,
        uint256 currentFee,
        address currentFeeAddr
    ) internal returns (bool updated, uint256 refundAmount, address refundAddr) {
        // If new fee is not larger than current fee, refund to caller and don't update
        if (newFee <= currentFee) {
            return (false, newFee, msg.sender);
        }

        // Fee is increasing - handle refund for original payer if sender changed
        if (currentFee > 0) {
            refundAmount = currentFee;
            refundAddr = currentFeeAddr;
            emit FeeDistributed(requestId, currentFeeAddr, currentFee, FeeType.REFUND);
        }

        // Emit the update event
        emit FeeUpdated(requestId, newFee, feeType);
        return (true, refundAmount, refundAddr);
    }

    /// @notice Allows anyone to withdraw fees for a timed out request to the respective fee addresses
    /// @param requestId The ID of the request to withdraw
    function withdrawTimedOutRequest(bytes32 requestId) external {
        RequestDetails memory details = _storageV1().requestDetails[requestId];

        // Verify request exists
        if (details.timestamp == 0) {
            revert RequestNotFound(requestId);
        }

        // Check if request has timed out using current timeout period
        if (block.timestamp < details.timestamp + _storageV1().timeoutPeriod) {
            revert RequestNotTimedOut(requestId, block.timestamp, details.timestamp + _storageV1().timeoutPeriod);
        }

        // Calculate total refund
        uint256 totalRefund = details.requestFee + details.resultFee + details.batchFee;

        // Clean up state before transfer to prevent reentrancy
        _removePendingRequest(requestId);
        delete _storageV1().requestDetails[requestId];

        // Handle fee distribution if there are fees to distribute
        if (totalRefund > 0) {
            // Check if fee manager is set
            if (address(_storageV1().feeManager) == address(0)) {
                revert FeeManagerRequired();
            }

            // Maximum 3 possible recipients (requestFeeAddr, resultFeeAddr, batchFeeAddr)
            address[] memory recipients = new address[](3);
            uint256[] memory amounts = new uint256[](3);
            uint256 recipientCount = 0;

            // Add requestFee
            if (details.requestFee > 0) {
                recipients[recipientCount] = details.requestFeeAddr;
                amounts[recipientCount] = details.requestFee;
                recipientCount++;
                emit FeeDistributed(requestId, details.requestFeeAddr, details.requestFee, FeeType.WITHDRAW);
            }

            // Add resultFee
            if (details.resultFee > 0) {
                recipients[recipientCount] = details.resultFeeAddr;
                amounts[recipientCount] = details.resultFee;
                recipientCount++;
                emit FeeDistributed(requestId, details.resultFeeAddr, details.resultFee, FeeType.WITHDRAW);
            }

            // Add batchFee
            if (details.batchFee > 0) {
                recipients[recipientCount] = details.batchFeeAddr;
                amounts[recipientCount] = details.batchFee;
                recipientCount++;
                emit FeeDistributed(requestId, details.batchFeeAddr, details.batchFee, FeeType.WITHDRAW);
            }

            // Resize the arrays to match the actual number of recipients
            if (recipientCount < recipients.length) {
                // solhint-disable-next-line no-inline-assembly
                assembly {
                    mstore(recipients, recipientCount)
                    mstore(amounts, recipientCount)
                }
            }

            // Distribute all fees in a single call
            _storageV1().feeManager.addPendingFeesMultiple{value: totalRefund}(recipients, amounts);
        }
    }

    /// @notice Pauses all contract operations
    /// @dev Can only be called by the contract owner
    /// @dev When paused, all state-modifying functions will revert
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses contract operations
    /// @dev Can only be called by the contract owner
    /// @dev Restores normal contract functionality after being paused
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Allows the owner to update the timeout period
    /// @dev Affects all requests, including existing ones
    /// @param newTimeoutPeriod New timeout period in seconds
    function setTimeoutPeriod(uint256 newTimeoutPeriod) external onlyOwner {
        if (newTimeoutPeriod == 0) revert InvalidTimeoutPeriod();
        _storageV1().timeoutPeriod = newTimeoutPeriod;
        emit TimeoutPeriodUpdated(newTimeoutPeriod);
    }

    // ============ Public View Functions ============

    /// @notice Returns the address of the fee manager contract
    /// @return The address of the fee manager
    function getFeeManager() external view override returns (address) {
        return address(_storageV1().feeManager);
    }

    /// @notice Retrieves a list of active requests
    /// @dev This function is gas-intensive due to iteration over the pendingRequests array.
    /// Users should be cautious when using high `limit` values in production environments, as it can result in high gas consumption.
    /// @dev This function will revert when the contract is paused
    /// @param offset The starting index in the pendingRequests array
    /// @param limit The maximum number of requests to return
    /// @return An array of SedaDataTypes.Request structs
    function getPendingRequests(
        uint256 offset,
        uint256 limit
    ) external view whenNotPaused returns (PendingRequest[] memory) {
        uint256 totalRequests = _storageV1().pendingRequests.length();
        if (offset >= totalRequests) {
            return new PendingRequest[](0);
        }

        uint256 actualLimit = (offset + limit > totalRequests) ? totalRequests - offset : limit;
        PendingRequest[] memory queriedPendingRequests = new PendingRequest[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            bytes32 requestId = _storageV1().pendingRequests.at(offset + i);
            RequestDetails memory details = _storageV1().requestDetails[requestId];

            queriedPendingRequests[i] = PendingRequest({
                id: requestId,
                request: getRequest(requestId),
                requestor: details.requestFeeAddr,
                timestamp: details.timestamp,
                requestFee: details.requestFee,
                resultFee: details.resultFee,
                batchFee: details.batchFee
            });
        }

        return queriedPendingRequests;
    }

    /// @notice Returns the current timeout period
    function getTimeoutPeriod() external view returns (uint256) {
        return _storageV1().timeoutPeriod;
    }

    // ============ Internal Functions ============

    /// @notice Returns the storage struct for the contract
    /// @dev Uses ERC-7201 storage pattern to access the storage struct at a specific slot
    /// @return s The storage struct containing the contract's state variables
    function _storageV1() internal pure returns (SedaCoreStorage storage s) {
        bytes32 slot = CORE_V1_STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := slot
        }
    }

    /// @notice Adds a request ID to the pendingRequests set
    /// @dev This function is internal to ensure that only the contract's internal logic can add requests,
    /// preventing unauthorized additions and maintaining proper state management.
    /// @param requestId The ID of the request to add
    function _addRequest(bytes32 requestId) internal {
        _storageV1().pendingRequests.add(requestId);
    }

    /// @notice Removes a request ID from the pendingRequests set if it exists
    /// @dev This function is internal to ensure that only the contract's internal logic can remove requests,
    /// maintaining proper state transitions and preventing unauthorized removals.
    /// @param requestId The ID of the request to remove
    function _removePendingRequest(bytes32 requestId) internal {
        _storageV1().pendingRequests.remove(requestId);
    }

    /// @dev Required override for UUPSUpgradeable. Ensures only the owner can upgrade the implementation.
    /// @inheritdoc UUPSUpgradeable
    /// @param newImplementation Address of the new implementation contract
    function _authorizeUpgrade(
        address newImplementation
    )
        internal
        virtual
        override
        onlyOwner // solhint-disable-next-line no-empty-blocks
    {}

    /// @dev Ensures transaction value matches expected fees and reverts if fees are provided but no fee manager is set
    /// @param totalFees The total amount of fees expected for this transaction
    function _validateFees(uint256 totalFees) internal view {
        if (msg.value != totalFees) {
            revert InvalidFeeAmount();
        }

        if (msg.value > 0 && address(_storageV1().feeManager) == address(0)) {
            revert FeeManagerRequired();
        }
    }

    /// @dev Handles the distribution of fees to various participants
    /// @param result The submitted result data
    /// @param requestDetails The details of the original request
    /// @param batchSender The address that submitted the batch containing this result
    function _handleFeeDistribution(
        SedaDataTypes.Result calldata result,
        RequestDetails memory requestDetails,
        address batchSender
    ) private {
        // Maximum 4 possible recipients (requestor, result submitter, batch sender, and payback address)
        // We use 4 to account for the case where all are different addresses
        address[] memory recipients = new address[](4);
        uint256[] memory amounts = new uint256[](4);
        uint256 recipientCount = 0;
        uint256 totalFeeAmount = 0;

        // Track requestor payments for consolidated refund
        uint256 requestorRefund = 0;

        // Process request fees
        if (requestDetails.requestFee > 0) {
            address payableAddress = result.paybackAddress.length == 20
                ? address(bytes20(result.paybackAddress))
                : address(0);

            if (payableAddress == address(0)) {
                requestorRefund += requestDetails.requestFee;
            } else {
                // Split request fee proportionally based on gas used vs gas limit
                uint256 submitterFee = (result.gasUsed * requestDetails.requestFee) / requestDetails.gasLimit;
                if (submitterFee > 0) {
                    recipients[recipientCount] = payableAddress;
                    amounts[recipientCount] = submitterFee;
                    recipientCount++;
                    totalFeeAmount += submitterFee;
                    emit FeeDistributed(result.drId, payableAddress, submitterFee, FeeType.REQUEST);
                }
                requestorRefund += requestDetails.requestFee - submitterFee;
            }
        }

        // Process result fees
        if (requestDetails.resultFee > 0) {
            recipients[recipientCount] = msg.sender;
            amounts[recipientCount] = requestDetails.resultFee;
            recipientCount++;
            totalFeeAmount += requestDetails.resultFee;
            emit FeeDistributed(result.drId, msg.sender, requestDetails.resultFee, FeeType.RESULT);
        }

        // Process batch fees
        if (requestDetails.batchFee > 0) {
            if (batchSender != address(0)) {
                recipients[recipientCount] = batchSender;
                amounts[recipientCount] = requestDetails.batchFee;
                recipientCount++;
                totalFeeAmount += requestDetails.batchFee;
                emit FeeDistributed(result.drId, batchSender, requestDetails.batchFee, FeeType.BATCH);
            } else {
                requestorRefund += requestDetails.batchFee;
            }
        }

        // Add requestor as final recipient if they have any refund
        if (requestorRefund > 0) {
            recipients[recipientCount] = requestDetails.requestFeeAddr;
            amounts[recipientCount] = requestorRefund;
            recipientCount++;
            totalFeeAmount += requestorRefund;
            emit FeeDistributed(result.drId, requestDetails.requestFeeAddr, requestorRefund, FeeType.REFUND);
        }

        // If we have recipients, distribute fees
        if (recipientCount > 0) {
            if (recipientCount < recipients.length) {
                // Resize the arrays to match the actual number of recipients
                // solhint-disable-next-line no-inline-assembly
                assembly {
                    mstore(recipients, recipientCount)
                    mstore(amounts, recipientCount)
                }
            }

            // Distribute all fees in a single call
            _storageV1().feeManager.addPendingFeesMultiple{value: totalFeeAmount}(recipients, amounts);
        }
    }
}
