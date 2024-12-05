// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {RequestHandlerBase} from "./abstract/RequestHandlerBase.sol";
import {ResultHandlerBase} from "./abstract/ResultHandlerBase.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title SedaCoreV1
/// @notice Core contract for the Seda protocol, managing requests and results
/// @dev Implements ResultHandler and RequestHandler functionalities, and manages active requests
contract SedaCoreV1 is RequestHandlerBase, ResultHandlerBase, UUPSUpgradeable, OwnableUpgradeable {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // Enumerable Set to store the request IDs that are pending
    // `pendingRequests` keeps track of all active data requests that have been posted but not yet fulfilled.
    // This set is used to manage the lifecycle of requests, allowing easy retrieval and status tracking.
    // When a request is posted, it is added to `pendingRequests`.
    // When a result is posted and the request is fulfilled, it is removed from `pendingRequests`
    EnumerableSet.Bytes32Set private pendingRequests;

    /// @notice Initializes the SedaCoreV1 contract
    /// @param sedaProverAddress The address of the Seda prover contract
    /// @dev This function replaces the constructor for proxy compatibility and can only be called once
    function initialize(address sedaProverAddress) public initializer {
        __ResultHandler_init(sedaProverAddress);
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
    }

    /// @notice Retrieves a list of active requests
    /// @dev This function is gas-intensive due to iteration over the pendingRequests array.
    /// Users should be cautious when using high `limit` values in production environments, as it can result in high gas consumption.
    /// @param offset The starting index in the pendingRequests array
    /// @param limit The maximum number of requests to return
    /// @return An array of SedaDataTypes.Request structs
    function getPendingRequests(uint256 offset, uint256 limit) public view returns (SedaDataTypes.Request[] memory) {
        uint256 totalRequests = pendingRequests.length();
        if (offset >= totalRequests) {
            return new SedaDataTypes.Request[](0);
        }

        uint256 actualLimit = (offset + limit > totalRequests) ? totalRequests - offset : limit;
        SedaDataTypes.Request[] memory queriedPendingRequests = new SedaDataTypes.Request[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            bytes32 requestId = pendingRequests.at(offset + i);
            queriedPendingRequests[i] = requests[requestId];
        }

        return queriedPendingRequests;
    }

    /// @inheritdoc RequestHandlerBase
    /// @dev Overrides the base implementation to also add the request ID to the pendingRequests array
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs
    ) public override(RequestHandlerBase) returns (bytes32) {
        bytes32 requestId = super.postRequest(inputs);
        _addRequest(requestId);

        return requestId;
    }

    /// @inheritdoc ResultHandlerBase
    /// @dev Overrides the base implementation to also remove the request ID from the pendingRequests array if it exists
    function postResult(
        SedaDataTypes.Result calldata result,
        uint64 batchHeight,
        bytes32[] calldata proof
    ) public override(ResultHandlerBase) returns (bytes32) {
        bytes32 resultId = super.postResult(result, batchHeight, proof);
        _removeRequest(result.drId);

        return resultId;
    }

    /// @notice Adds a request ID to the pendingRequests set
    /// @dev This function is internal to ensure that only the contract's internal logic can add requests,
    /// preventing unauthorized additions and maintaining proper state management.
    /// @param requestId The ID of the request to add
    function _addRequest(bytes32 requestId) internal {
        pendingRequests.add(requestId);
    }

    /// @notice Removes a request ID from the pendingRequests set if it exists
    /// @dev This function is internal to ensure that only the contract's internal logic can remove requests,
    /// maintaining proper state transitions and preventing unauthorized removals.
    /// @param requestId The ID of the request to remove
    function _removeRequest(bytes32 requestId) internal {
        pendingRequests.remove(requestId);
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
