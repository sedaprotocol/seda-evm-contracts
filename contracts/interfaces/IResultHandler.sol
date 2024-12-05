// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title IResultHandler
/// @notice Interface for handling result posting and retrieval
interface IResultHandler {
    error InvalidResultProof(bytes32);
    error ResultAlreadyExists(bytes32);
    error ResultNotFound(bytes32);

    event ResultPosted(bytes32 indexed resultId);

    /// @notice Posts a new result with a proof
    /// @param inputs The result data to be posted
    /// @param batchHeight The height of the batch the result belongs to
    /// @param proof The proof associated with the result
    function postResult(
        SedaDataTypes.Result calldata inputs,
        uint64 batchHeight,
        bytes32[] memory proof
    ) external returns (bytes32);

    /// @notice Retrieves a result by its ID
    /// @param requestId The unique identifier of the request
    /// @return The result data associated with the given ID
    function getResult(bytes32 requestId) external view returns (SedaDataTypes.Result memory);
}
