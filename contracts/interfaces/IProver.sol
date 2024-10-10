// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title IProver Interface
/// @notice Interface for the Prover contract in the Seda protocol
interface IProver {
    /// @notice Updates a batch with new data and validator proofs
    /// @param newBatch The new batch data to be updated
    /// @param signatures Array of signatures validating the new batch
    /// @param validatorProofs Array of validator proofs, each containing validator data and a Merkle proof
    function updateBatch(
        SedaDataTypes.Batch calldata newBatch,
        bytes[] calldata signatures,
        SedaDataTypes.ValidatorProof[] calldata validatorProofs
    ) external;

    /// @notice Verifies a result Merkle proof
    /// @param resultId The ID of the result to verify
    /// @param merkleProof The Merkle proof to be verified
    /// @return bool Returns true if the Merkle proof is valid, false otherwise
    function verifyResultProof(
        bytes32 resultId,
        bytes32[] calldata merkleProof
    ) external view returns (bool);
}
