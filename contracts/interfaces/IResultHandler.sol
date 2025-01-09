// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title IResultHandler
/// @notice Interface for handling result posting and retrieval
interface IResultHandler {
    error InvalidResultProof(bytes32);
    error ResultAlreadyExists(bytes32);
    error ResultNotFound(bytes32);

    event ResultPosted(bytes32 indexed resultId);

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
    ) external payable returns (bytes32);

    /// @notice Returns the address of the Seda prover contract
    /// @return The address of the Seda prover contract
    function getSedaProver() external view returns (address);
}
