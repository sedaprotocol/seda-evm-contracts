// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IProver} from "../interfaces/IProver.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

abstract contract ProverBase is IProver {
    event BatchUpdated(uint256 indexed batchHeight, bytes32 batchHash);

    function updateBatch(
        SedaDataTypes.Batch memory _batch,
        bytes[] memory _signatures,
        SedaDataTypes.ValidatorProof[] memory _proofs
    ) public virtual override;

    function verifyDataResultProof(
        bytes32 _resultId,
        bytes32[] memory _proof
    ) public view virtual override returns (bool);
}
