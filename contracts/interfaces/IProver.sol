// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

interface IProver {
    function updateBatch(
        SedaDataTypes.Batch memory newBatch,
        bytes[] memory signatures,
        SedaDataTypes.ValidatorProof[] memory validatorProofs
    ) external;

    function verifyDataResultProof(
        bytes32 dataResultId,
        bytes32[] memory merkleProof
    ) external view returns (bool);
}