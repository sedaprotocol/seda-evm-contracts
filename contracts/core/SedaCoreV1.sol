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
        address requestor;
        uint256 timestamp;
        uint256 requestFee;
        uint256 resultFee;
        uint256 batchFee;
        uint256 gasLimit;
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
    }

    // ============ Errors ============

    // Error thrown when a result is posted with a timestamp before the corresponding request
    error InvalidResultTimestamp(bytes32 drId, uint256 resultTimestamp, uint256 requestTimestamp);

    // ============ Constructor & Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the SedaCoreV1 contract
    /// @param sedaProverAddress The address of the Seda prover contract
    /// @dev This function replaces the constructor for proxy compatibility and can only be called once
    function initialize(address sedaProverAddress, uint256 initialTimeoutPeriod) external initializer {
        // Initialize inherited contracts
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender);
        __Pausable_init();

        // Initialize derived contracts
        __ResultHandler_init(sedaProverAddress);
        _storageV1().timeoutPeriod = initialTimeoutPeriod;
    }

    // ============ Public Functions ============

    /// @inheritdoc RequestHandlerBase
    /// @dev Overrides the base implementation to also add the request ID and timestamp to storage
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs
    ) public payable override(RequestHandlerBase, IRequestHandler) whenNotPaused returns (bytes32) {
        return postRequest(inputs, 0, 0, 0);
    }

    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs,
        uint256 requestFee,
        uint256 resultFee,
        uint256 batchFee
    ) public payable whenNotPaused returns (bytes32) {
        // Validate that the sent ETH matches exactly the sum of all specified fees
        // This prevents users from accidentally overpaying or underpaying fees
        if (msg.value != requestFee + resultFee + batchFee) {
            revert InvalidFeeAmount();
        }

        // Call parent contract's postRequest base implementation
        bytes32 requestId = RequestHandlerBase.postRequest(inputs);

        // Store pending request and request details
        _addRequest(requestId);
        _storageV1().requestDetails[requestId] = RequestDetails({
            requestor: msg.sender,
            timestamp: block.timestamp,
            requestFee: requestFee,
            resultFee: resultFee,
            batchFee: batchFee,
            gasLimit: inputs.execGasLimit + inputs.tallyGasLimit
        });

        return requestId;
    }

    /// @inheritdoc ResultHandlerBase
    /// @dev Overrides the base implementation to validate result timestamp and clean up storage
    function postResult(
        SedaDataTypes.Result calldata result,
        uint64 batchHeight,
        bytes32[] calldata proof
    ) public payable override(ResultHandlerBase, IResultHandler) whenNotPaused returns (bytes32) {
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

        // Fee distribution: handles three types of fees (request, result, batch)
        // and manages refunds back to the requestor when applicable

        // Amount to refund to requestor
        uint256 refundAmount;

        // Request fee distribution:
        // - if invalid payback address, send all request fee to requestor
        // - if valid payback address, split request fee proportionally based on gas used vs gas limit
        if (requestDetails.requestFee > 0) {
            address payableAddress = result.paybackAddress.length == 20
                ? address(bytes20(result.paybackAddress))
                : address(0);

            if (payableAddress == address(0)) {
                refundAmount += requestDetails.requestFee;
            } else {
                // Split request fee proportionally based on gas used vs gas limit
                uint256 submitterFee = (result.gasUsed * requestDetails.requestFee) / requestDetails.gasLimit;
                if (submitterFee > 0) {
                    _transferFee(payableAddress, submitterFee);
                    emit FeeDistributed(result.drId, payableAddress, submitterFee, ISedaCore.FeeType.REQUEST);
                }
                refundAmount += requestDetails.requestFee - submitterFee;
            }
        }

        // Result fee distribution:
        // - send all result fee to `msg.sender` (result sender/solver)
        if (requestDetails.resultFee > 0) {
            _transferFee(msg.sender, requestDetails.resultFee);
            emit FeeDistributed(result.drId, msg.sender, requestDetails.resultFee, ISedaCore.FeeType.RESULT);
        }

        // Batch fee distribution logic:
        // - If batch sender is valid (non-zero) AND fee manager is configured:
        //   Add the batch fee to the sender's pending balance via fee manager
        // - Otherwise: Include batch fee in refund amount to the requestor
        if (requestDetails.batchFee > 0) {
            if (batchSender != address(0) && IProver(this.getSedaProver()).getFeeManager() != address(0)) {
                // Forward the batch fee to the fee manager, which will add it to the batch sender's account
                IFeeManager(IProver(this.getSedaProver()).getFeeManager()).addPendingFees{
                    value: requestDetails.batchFee
                }(batchSender);
                emit FeeDistributed(result.drId, batchSender, requestDetails.batchFee, ISedaCore.FeeType.BATCH);
            } else {
                // If either batch sender or fee manager is not set, include batch fee in refund to requestor
                refundAmount += requestDetails.batchFee;
            }
        }

        // Aggregate refund to requestor containing:
        // - unused request fees (when gas used < gas limit)
        // - full request fee (when invalid payback address)
        // - batch fee (when no batch sender)
        if (refundAmount > 0) {
            _transferFee(requestDetails.requestor, refundAmount);
            emit FeeDistributed(result.drId, requestDetails.requestor, refundAmount, ISedaCore.FeeType.REFUND);
        }

        return resultId;
    }

    /// @inheritdoc ISedaCore
    /// @dev Allows the owner to increase fees for a pending request
    function increaseFees(
        bytes32 requestId,
        uint256 additionalRequestFee,
        uint256 additionalResultFee,
        uint256 additionalBatchFee
    ) external payable override(ISedaCore) whenNotPaused {
        // Validate ETH payment matches fee sum to prevent over/underpayment
        if (msg.value != additionalRequestFee + additionalResultFee + additionalBatchFee) {
            revert InvalidFeeAmount();
        }

        RequestDetails storage details = _storageV1().requestDetails[requestId];
        if (details.timestamp == 0) {
            revert RequestNotFound(requestId);
        }

        details.requestFee += additionalRequestFee;
        details.resultFee += additionalResultFee;
        details.batchFee += additionalBatchFee;

        emit FeesIncreased(requestId, additionalRequestFee, additionalResultFee, additionalBatchFee);
    }

    /// @notice Allows anyone to withdraw fees for a timed out request to the requestor address
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

        // Transfer total fees to data request creator
        if (totalRefund > 0) {
            _transferFee(details.requestor, totalRefund);
            emit FeeDistributed(requestId, details.requestor, totalRefund, FeeType.WITHDRAW);
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
                requestor: details.requestor,
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

    /// @dev Helper function to safely transfer fees
    /// @param recipient Address to receive the fee
    /// @param amount Amount to transfer
    function _transferFee(address recipient, uint256 amount) internal {
        // Using low-level call instead of transfer()
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) revert FeeTransferFailed();
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
}
