// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title IProver Interface
/// @notice Interface for the Prover contract in the Seda protocol
interface IProver {
    event BatchPosted(uint256 indexed batchHeight, bytes32 batchHash);

    /// @notice Posts a new batch with new data and validator proofs
    /// @param newBatch The new batch data to be posted
    /// @param signatures Array of signatures validating the new batch
    /// @param validatorProofs Array of validator proofs, each containing validator data and a Merkle proof
    function postBatch(
        SedaDataTypes.Batch calldata newBatch,
        bytes[] calldata signatures,
        SedaDataTypes.ValidatorProof[] calldata validatorProofs
    ) external;

    /// @notice Verifies a result Merkle proof
    /// @param resultId The ID of the result to verify
    /// @param batchHeight The height of the batch to verify the result proof for
    /// @param merkleProof The Merkle proof to be verified
    /// @return bool Returns true if the Merkle proof is valid, false otherwise
    function verifyResultProof(
        bytes32 resultId,
        uint64 batchHeight,
        bytes32[] calldata merkleProof
    ) external view returns (bool);
}
