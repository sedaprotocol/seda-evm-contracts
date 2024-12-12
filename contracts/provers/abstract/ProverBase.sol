// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IProver} from "../../interfaces/IProver.sol";
import {SedaDataTypes} from "../../libraries/SedaDataTypes.sol";

/// @title ProverBase
/// @notice Base contract for implementing proof verification logic
/// @dev This abstract contract defines the basic structure and error handling for proof verification
abstract contract ProverBase is IProver {
    // ============ Constants ============

    /// @notice Domain separator used to prevent cross-domain replay attacks when hashing result IDs
    bytes1 internal constant RESULT_DOMAIN_SEPARATOR = 0x00;

    // ============ Errors ============

    error InvalidBatchHeight();
    error InvalidSignature();
    error InvalidValidatorProof();
    error MismatchedSignaturesAndProofs();

    // ============ External Functions ============

    /// @inheritdoc IProver
    function postBatch(
        SedaDataTypes.Batch calldata newBatch,
        bytes[] calldata signatures,
        SedaDataTypes.ValidatorProof[] calldata validatorProofs
    ) external virtual override(IProver);

    /// @inheritdoc IProver
    function verifyResultProof(
        bytes32 resultId,
        uint64 batchHeight,
        bytes32[] calldata merkleProof
    ) external view virtual override(IProver) returns (bool);

    /// @inheritdoc IProver
    function getLastBatchHeight() external view virtual override(IProver) returns (uint64);
}
