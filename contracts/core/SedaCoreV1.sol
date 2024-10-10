// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IProver} from "../interfaces/IProver.sol";
import "./Secp256k1Prover.sol";
import "./ResultHandler.sol";
import "./RequestHandler.sol";

/// @title SedaCoreV1
/// @notice Core contract for the Seda protocol, managing requests and results
/// @dev Implements ResultHandler and RequestHandler functionalities, and manages active requests
contract SedaCoreV1 is ResultHandler, RequestHandler {
    // Array to store request IDs for iteration
    bytes32[] public requestIds;

    /// @notice Initializes the SedaCoreV1 contract
    /// @param sedaProverAddress The address of the Seda prover contract
    constructor(address sedaProverAddress) ResultHandler(sedaProverAddress) {}

    /// @notice Retrieves a list of active request IDs
    /// @param offset The starting index in the requestIds array
    /// @param limit The maximum number of request IDs to return
    /// @return An array of request IDs
    function getRequests(
        uint256 offset,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        uint256 totalRequests = requestIds.length;
        
        if (offset >= totalRequests) {
            return new bytes32[](0);
        }

        uint256 actualLimit = (offset + limit > totalRequests)
            ? totalRequests - offset
            : limit;
        bytes32[] memory requests = new bytes32[](actualLimit);

        for (uint256 i = 0; i < actualLimit; i++) {
            requests[i] = requestIds[offset + i];
        }

        return requests;
    }

    /// @inheritdoc RequestHandler
    /// @dev Overrides the base implementation to also add the request ID to the tracking array
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs
    ) public override returns (bytes32) {
        bytes32 requestId = super.postRequest(inputs);
        _addRequest(requestId);
        return requestId;
    }

    /// @inheritdoc ResultHandler
    /// @dev Overrides the base implementation to also remove the request ID from the tracking array
    function postResult(
        SedaDataTypes.Result calldata result,
        bytes32[] calldata proof
    ) public override {
        super.postResult(result, proof);
        _removeRequest(result.drId);
    }

    /// @notice Adds a request ID to the tracking array
    /// @param requestId The ID of the request to add
    function _addRequest(bytes32 requestId) internal {
        requestIds.push(requestId);
    }

    /// @notice Removes a request ID from the tracking array
    /// @param requestId The ID of the request to remove
    function _removeRequest(bytes32 requestId) internal {
        for (uint256 i = 0; i < requestIds.length; i++) {
            if (requestIds[i] == requestId) {
                requestIds[i] = requestIds[requestIds.length - 1];
                requestIds.pop();
                break;
            }
        }
    }
}
