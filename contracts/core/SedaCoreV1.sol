// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";
import {ResultHandler} from "./ResultHandler.sol";
import {RequestHandler} from "./RequestHandler.sol";

/// @title SedaCoreV1
/// @notice Core contract for the Seda protocol, managing requests and results
/// @dev Implements ResultHandler and RequestHandler functionalities, and manages active requests
contract SedaCoreV1 is RequestHandler, ResultHandler {
    // Array to store request IDs for iteration
    bytes32[] public pendingRequests;

    // Mapping to store the position of each request ID in the pendingRequests array
    mapping(bytes32 => uint256) public requestIndex;

    /// @notice Initializes the SedaCoreV1 contract
    /// @param sedaProverAddress The address of the Seda prover contract
    constructor(address sedaProverAddress) ResultHandler(sedaProverAddress) {}

    /// @notice Retrieves a list of active request IDs
    /// @param offset The starting index in the requestIds array
    /// @param limit The maximum number of request IDs to return
    /// @return An array of request IDs
    function getPendingRequests(
        uint256 offset,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        uint256 totalRequests = pendingRequests.length;

        if (offset >= totalRequests) {
            return new bytes32[](0);
        }

        uint256 actualLimit = (offset + limit > totalRequests)
            ? totalRequests - offset
            : limit;
        bytes32[] memory requests = new bytes32[](actualLimit);

        for (uint256 i = 0; i < actualLimit; i++) {
            requests[i] = pendingRequests[offset + i];
        }

        return requests;
    }

    /// @inheritdoc RequestHandler
    /// @dev Overrides the base implementation to also add the request ID to the pendingRequests array
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs
    ) public override(RequestHandler) returns (bytes32) {
        bytes32 requestId = super.postRequest(inputs);
        _addRequest(requestId);
        return requestId;
    }

    /// @inheritdoc ResultHandler
    /// @dev Overrides the base implementation to also remove the request ID from the pendingRequests array if it exists
    function postResult(
        SedaDataTypes.Result calldata result,
        bytes32[] calldata proof
    ) public override(ResultHandler) {
        super.postResult(result, proof);
        _removeRequest(result.drId);
    }

    /// @notice Adds a request ID to the pendingRequests array
    /// @param requestId The ID of the request to add
    function _addRequest(bytes32 requestId) internal {
        pendingRequests.push(requestId);
        requestIndex[requestId] = pendingRequests.length; // Store the new length of the array
    }

    /// @notice Removes a request ID from the pendingRequests array if it exists
    /// @param requestId The ID of the request to remove
    function _removeRequest(bytes32 requestId) internal {
        uint256 index = requestIndex[requestId];
        if (index == 0) {
            return; // Request ID doesn't exist, do nothing
        }

        uint256 lastIndex = pendingRequests.length;
        bytes32 lastRequestId = pendingRequests[lastIndex - 1];

        // Swap the request to remove with the last request in the array
        pendingRequests[index - 1] = lastRequestId;
        requestIndex[lastRequestId] = index; // Update the mapping for the swapped request

        // Remove the last element
        pendingRequests.pop();
        delete requestIndex[requestId];
    }
}
