// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IProver} from "../interfaces/IProver.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

abstract contract ProverBase is IProver {
    event BatchUpdated(uint256 indexed batchHeight, bytes32 batchHash);

    /// @inheritdoc IProver
    function updateBatch(
        SedaDataTypes.Batch calldata newBatch,
        bytes[] calldata signatures,
        SedaDataTypes.ValidatorProof[] calldata validatorProofs
    ) public virtual override;

    /// @inheritdoc IProver
    function verifyResultProof(
        bytes32 resultId,
        bytes32[] calldata merkleProof
    ) public view virtual override returns (bool);
}
