// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {IRequestHandler} from "../interfaces/IRequestHandler.sol";
import {IResultHandler} from "../interfaces/IResultHandler.sol";
import {ISedaCore} from "../interfaces/ISedaCore.sol";
import {RequestHandlerBase} from "./abstract/RequestHandlerBase.sol";
import {ResultHandlerBase} from "./abstract/ResultHandlerBase.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title SedaCoreV1
/// @notice Core contract for the Seda protocol, managing requests and results
/// @dev Implements ResultHandler and RequestHandler functionalities, and manages active requests
contract SedaCoreV1 is ISedaCore, RequestHandlerBase, ResultHandlerBase, UUPSUpgradeable, OwnableUpgradeable {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // ============ Constants ============

    // Constant storage slot for the state following the ERC-7201 standard
    bytes32 private constant CORE_V1_STORAGE_SLOT =
        keccak256(abi.encode(uint256(keccak256("sedacore.storage.v1")) - 1)) & ~bytes32(uint256(0xff));

    // ============ Errors ============

    // Error thrown when a result is posted with a timestamp before the corresponding request
    error InvalidResultTimestamp(bytes32 drId, uint256 resultTimestamp, uint256 requestTimestamp);

    // ============ Storage ============

    // Request details struct
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
        // Enumerable Set to store the request IDs that are pending
        // `pendingRequests` keeps track of all active data requests that have been posted but not yet fulfilled.
        // This set is used to manage the lifecycle of requests, allowing easy retrieval and status tracking.
        // When a request is posted, it is added to `pendingRequests`.
        // When a result is posted and the request is fulfilled, it is removed from `pendingRequests`
        EnumerableSet.Bytes32Set pendingRequests;
        // Mapping to store request details for pending requests:
        // - timestamps
        // - request fee
        mapping(bytes32 => RequestDetails) requestDetails;
    }

    // ============ Constructor & Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the SedaCoreV1 contract
    /// @param sedaProverAddress The address of the Seda prover contract
    /// @dev This function replaces the constructor for proxy compatibility and can only be called once
    function initialize(address sedaProverAddress) external initializer {
        __ResultHandler_init(sedaProverAddress);
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
    }

    // ============ Public Functions ============

    /// @inheritdoc RequestHandlerBase
    /// @dev Overrides the base implementation to also add the request ID and timestamp to storage
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs
    ) public payable override(RequestHandlerBase, IRequestHandler) returns (bytes32) {
        return postRequest(inputs, 0, 0, 0);
    }

    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs,
        uint256 requestFee,
        uint256 resultFee,
        uint256 batchFee
    ) public payable override returns (bytes32) {
        // Check that amount is equal to sum of fees
        if (msg.value != requestFee + resultFee + batchFee) {
            revert InvalidFeeAmount();
        }

        bytes32 requestId = super.postRequest(inputs);
        _addRequest(requestId);
        // Store the request details
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
    ) public payable override(ResultHandlerBase, IResultHandler) returns (bytes32) {
        // Get request details from storage
        RequestDetails memory requestDetails = _storageV1().requestDetails[result.drId];

        // Check: Validate result timestamp comes after request timestamp
        // Note: requestTimestamp = 0 for requests not tracked by this contract (always passes validation)
        if (result.blockTimestamp <= requestDetails.timestamp) {
            revert InvalidResultTimestamp(result.drId, result.blockTimestamp, requestDetails.timestamp);
        }

        // Call parent postResult but return the batch sender for fee distribution
        (bytes32 resultId, address batchSender) = postResultAndGetBatchSender(result, batchHeight, proof);

        // Clean up state
        _removeRequest(result.drId);
        delete _storageV1().requestDetails[result.drId];

        // Handle fee distribution
        uint256 refundAmount;

        if (requestDetails.requestFee > 0) {
            address payableAddress = result.paybackAddress.length == 20
                ? address(bytes20(result.paybackAddress))
                : address(0);

            if (payableAddress == address(0)) {
                // If no payback address, send all request fee to requestor
                refundAmount += requestDetails.requestFee;
            } else {
                // Calculate request fee split and send to payback address
                uint256 submitterFee = (result.gasUsed * requestDetails.requestFee) / requestDetails.gasLimit;
                _sendFee(payableAddress, submitterFee);
                emit FeeDistributed(result.drId, payableAddress, submitterFee, ISedaCore.FeeType.REQUEST);
                // Update requestor amount with refund (executed at the end of the function)
                refundAmount += requestDetails.requestFee - submitterFee;
            }
        }

        // Send result fee to msg.sender
        if (requestDetails.resultFee > 0) {
            _sendFee(msg.sender, requestDetails.resultFee);
            emit FeeDistributed(result.drId, msg.sender, requestDetails.resultFee, ISedaCore.FeeType.RESULT);
        }

        // Add batch fee to requestor amount if no valid batch sender
        if (requestDetails.batchFee > 0) {
            if (batchSender == address(0)) {
                // If no batch sender, send all batch fee to requestor
                refundAmount += requestDetails.batchFee;
            } else {
                // Send batch fee to batch sender
                _sendFee(batchSender, requestDetails.batchFee);
                emit FeeDistributed(result.drId, batchSender, requestDetails.batchFee, ISedaCore.FeeType.BATCH);
            }
        }

        // Send combined amount to requestor if any (refunds)
        if (refundAmount > 0) {
            _sendFee(requestDetails.requestor, refundAmount);
            emit FeeDistributed(result.drId, requestDetails.requestor, refundAmount, ISedaCore.FeeType.REFUND);
        }

        return resultId;
    }

    /// @dev Helper function to safely transfer fees
    /// @param recipient Address to receive the fee
    /// @param amount Amount to transfer
    function _sendFee(address recipient, uint256 amount) private {
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) revert FeeTransferFailed();
    }

    // ============ Public View Functions ============

    /// @notice Retrieves a list of active requests
    /// @dev This function is gas-intensive due to iteration over the pendingRequests array.
    /// Users should be cautious when using high `limit` values in production environments, as it can result in high gas consumption.
    /// @param offset The starting index in the pendingRequests array
    /// @param limit The maximum number of requests to return
    /// @return An array of SedaDataTypes.Request structs
    function getPendingRequests(uint256 offset, uint256 limit) public view returns (SedaDataTypes.Request[] memory) {
        uint256 totalRequests = _storageV1().pendingRequests.length();
        if (offset >= totalRequests) {
            return new SedaDataTypes.Request[](0);
        }

        uint256 actualLimit = (offset + limit > totalRequests) ? totalRequests - offset : limit;
        SedaDataTypes.Request[] memory queriedPendingRequests = new SedaDataTypes.Request[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            bytes32 requestId = _storageV1().pendingRequests.at(offset + i);
            queriedPendingRequests[i] = getRequest(requestId);
        }

        return queriedPendingRequests;
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
    function _removeRequest(bytes32 requestId) internal {
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
}
