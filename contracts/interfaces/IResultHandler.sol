// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title IResultHandler
/// @author Open Oracle Association
/// @notice Interface for handling result posting and retrieval
interface IResultHandler {
    /// @notice Emitted when a new result is successfully posted
    /// @param requestId The unique identifier of the request that the result belongs to
    /// @param resultId The unique identifier of the posted result
    event ResultPosted(bytes32 indexed requestId, bytes32 indexed resultId);

    /// @notice Error thrown when the provided result proof fails verification
    /// @param resultId The ID of the result with invalid proof
    error InvalidResultProof(bytes32 resultId);

    /// @notice Error thrown when attempting to post a result that already exists
    /// @param requestId The ID of the request that already has a result
    error ResultAlreadyExists(bytes32 requestId);

    /// @notice Error thrown when trying to access a result that doesn't exist
    /// @param requestId The ID of the request with no associated result
    error ResultNotFound(bytes32 requestId);

    /// @notice Retrieves a result by its ID
    /// @param requestId The unique identifier of the request
    /// @return The result data associated with the given ID
    function getResult(bytes32 requestId) external view returns (SedaDataTypes.Result memory);

    /// @notice Posts a new result with a proof
    /// @param result The result data to be posted
    /// @param batchHeight The height of the batch the result belongs to
    /// @param proof The proof associated with the result
    /// @return resultId The unique identifier of the posted result
    function postResult(
        SedaDataTypes.Result calldata result,
        uint64 batchHeight,
        bytes32[] memory proof
    ) external returns (bytes32);

    /// @notice Returns the address of the Seda prover contract
    /// @return The address of the Seda prover contract
    function getSedaProver() external view returns (address);
}
