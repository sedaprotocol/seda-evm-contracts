// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";
import {RequestHandlerBase} from "../abstract/RequestHandlerBase.sol";
import {IResultHandler} from "../interfaces/IResultHandler.sol";

/// @title SedaCorePermissioned
/// @notice Core contract for the Seda protocol with permissioned access, managing requests and results
/// @dev Implements RequestHandlerBase, IResultHandler, AccessControl, Pausable, and ReentrancyGuard functionalities
contract SedaCorePermissioned is
    RequestHandlerBase,
    IResultHandler,
    AccessControl,
    Pausable
{
    // Constants
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // State variables
    uint16 public maxReplicationFactor;
    mapping(bytes32 => SedaDataTypes.Request) public requests;
    mapping(bytes32 => SedaDataTypes.Result) public results;
    bytes32[] public pendingRequests;
    mapping(bytes32 => uint256) public requestIndex;

    /// @notice Contract constructor
    /// @param relayers The initial list of relayer addresses to be granted the RELAYER_ROLE
    /// @param initialMaxReplicationFactor The initial maximum replication factor
    constructor(address[] memory relayers, uint16 initialMaxReplicationFactor) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(RELAYER_ROLE, ADMIN_ROLE);

        // Grant RELAYER_ROLE to each address in the _relayers array
        for (uint256 i = 0; i < relayers.length; i++) {
            _grantRole(RELAYER_ROLE, relayers[i]);
        }

        maxReplicationFactor = initialMaxReplicationFactor;
    }

    /// @notice Sets the maximum replication factor that can be used for requests
    /// @param newMaxReplicationFactor The new maximum replication factor
    function setMaxReplicationFactor(
        uint16 newMaxReplicationFactor
    ) external onlyRole(ADMIN_ROLE) {
        maxReplicationFactor = newMaxReplicationFactor;
    }

    /// @notice Posts a new request
    /// @param inputs The request inputs
    /// @return requestId The ID of the posted request
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs
    ) external override whenNotPaused returns (bytes32) {
        uint16 replicationFactor = inputs.replicationFactor;
        if (
            replicationFactor > maxReplicationFactor || replicationFactor == 0
        ) {
            revert InvalidReplicationFactor();
        }

        bytes32 requestId = SedaDataTypes.deriveRequestId(inputs);
        if (bytes(requests[requestId].version).length != 0) {
            revert RequestAlreadyExists(requestId);
        }

        requests[requestId] = SedaDataTypes.Request({
            version: SedaDataTypes.VERSION,
            execProgramId: inputs.execProgramId,
            execInputs: inputs.execInputs,
            tallyProgramId: inputs.tallyProgramId,
            tallyInputs: inputs.tallyInputs,
            replicationFactor: inputs.replicationFactor,
            consensusFilter: inputs.consensusFilter,
            gasPrice: inputs.gasPrice,
            gasLimit: inputs.gasLimit,
            memo: inputs.memo
        });

        _addPendingRequest(requestId);

        emit RequestPosted(requestId);
        return requestId;
    }

    /// @notice Posts a result for a request
    /// @param result The result data
    function postResult(
        SedaDataTypes.Result calldata result,
        bytes32[] calldata
    ) external override onlyRole(RELAYER_ROLE) whenNotPaused returns (bytes32) {
        bytes32 resultId = SedaDataTypes.deriveResultId(result);
        if (results[result.drId].drId != bytes32(0)) {
            revert ResultAlreadyExists(resultId);
        }
        results[result.drId] = result;
        _removePendingRequest(result.drId);
        emit ResultPosted(resultId);
        return resultId;
    }

    /// @notice Retrieves a stored request
    /// @param requestId The ID of the request to retrieve
    /// @return The requested data
    function getRequest(
        bytes32 requestId
    ) external view override returns (SedaDataTypes.Request memory) {
        SedaDataTypes.Request memory request = requests[requestId];
        if (bytes(request.version).length == 0) {
            revert RequestNotFound(requestId);
        }

        return requests[requestId];
    }

    /// @notice Retrieves a result by its ID
    /// @param requestId The unique identifier of the result
    /// @return The result data associated with the given ID
    function getResult(
        bytes32 requestId
    ) external view override returns (SedaDataTypes.Result memory) {
        if (results[requestId].drId == bytes32(0)) {
            revert ResultNotFound(requestId);
        }

        return results[requestId];
    }

    /// @notice Retrieves a list of pending request IDs
    /// @param offset The starting index in the pendingRequests array
    /// @param limit The maximum number of request IDs to return
    /// @return An array of pending request IDs
    function getPendingRequests(
        uint256 offset,
        uint256 limit
    ) external view returns (bytes32[] memory) {
        uint256 totalRequests = pendingRequests.length;
        if (offset >= totalRequests) {
            return new bytes32[](0);
        }

        uint256 actualLimit = (offset + limit > totalRequests)
            ? totalRequests - offset
            : limit;
        bytes32[] memory requestIds = new bytes32[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            requestIds[i] = pendingRequests[offset + i];
        }

        return requestIds;
    }

    /// @notice Adds a relayer
    /// @param account The address of the relayer to add
    function addRelayer(address account) external onlyRole(ADMIN_ROLE) {
        grantRole(RELAYER_ROLE, account);
    }

    /// @notice Removes a relayer
    /// @param account The address of the relayer to remove
    function removeRelayer(address account) external onlyRole(ADMIN_ROLE) {
        revokeRole(RELAYER_ROLE, account);
    }

    /// @notice Pauses the contract
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpauses the contract
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Adds a request ID to the pendingRequests array
    /// @param requestId The ID of the request to add
    function _addPendingRequest(bytes32 requestId) internal {
        pendingRequests.push(requestId);
        requestIndex[requestId] = pendingRequests.length;
    }

    /// @notice Removes a request ID from the pendingRequests array if it exists
    /// @param requestId The ID of the request to remove
    function _removePendingRequest(bytes32 requestId) internal {
        uint256 index = requestIndex[requestId];
        if (index == 0) {
            return; // Request ID doesn't exist, do nothing
        }

        uint256 lastIndex = pendingRequests.length - 1;
        bytes32 lastRequestId = pendingRequests[lastIndex];

        // Swap the request to remove with the last request in the array
        pendingRequests[index - 1] = lastRequestId;
        requestIndex[lastRequestId] = index; // Update the mapping for the swapped request

        // Remove the last element
        pendingRequests.pop();
        delete requestIndex[requestId];
    }
}
