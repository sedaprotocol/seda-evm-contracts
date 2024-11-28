// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IProver} from "../interfaces/IProver.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

abstract contract ProverBase is IProver {
    error InvalidBatchHeight();
    error InvalidSignature();
    error InvalidValidatorProof();
    error MismatchedSignaturesAndProofs();

    bytes1 internal constant RESULT_DOMAIN_SEPARATOR = 0x00;

    /// @inheritdoc IProver
    function postBatch(
        SedaDataTypes.Batch calldata newBatch,
        bytes[] calldata signatures,
        SedaDataTypes.ValidatorProof[] calldata validatorProofs
    ) public virtual override(IProver);

    /// @inheritdoc IProver
    function verifyResultProof(
        bytes32 resultId,
        uint64 batchHeight,
        bytes32[] calldata merkleProof
    ) public view virtual override(IProver) returns (bool);
}
