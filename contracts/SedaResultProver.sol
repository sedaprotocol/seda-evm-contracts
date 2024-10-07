// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./SedaK256Prover.sol";

contract SedaResultProver {
    SedaK256Prover public sedaProver;

    // DR ID => DataResult
    mapping(bytes32 => SedaDataTypes.DataResult) public dataResults;

    constructor(address _sedaProverAddress) {
        sedaProver = SedaK256Prover(_sedaProverAddress);
    }

    // @notice Post a result for a data request
    function postDataResult(
        SedaDataTypes.DataResult calldata inputs,
        bytes32[] memory merkleProof
    ) public {
        // Check if the data result has already been posted
        require(
            dataResults[inputs.drId].drId == bytes32(0),
            "Data result already posted"
        );

        // set the data result
        SedaDataTypes.DataResult memory dataResult = SedaDataTypes.DataResult(
            inputs.version,
            inputs.drId,
            inputs.consensus,
            inputs.exitCode,
            inputs.result,
            inputs.blockHeight,
            inputs.gasUsed,
            inputs.paybackAddress,
            inputs.sedaPayload
        );

        // verify the data result proof
        bytes32 dataResultId = SedaDataTypes.computeResultId(dataResult);
        require(
            sedaProver._verifyDataResultProof(dataResultId, merkleProof),
            "Invalid data result proof"
        );

        // store the data result
        dataResults[inputs.drId] = dataResult;
    }

    function getDataResult(
        bytes32 drId
    ) public view returns (SedaDataTypes.DataResult memory) {
        return dataResults[drId];
    }
}
