// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";
import {ResultHandlerBase} from "../abstract/ResultHandlerBase.sol";

contract ResultHandler is ResultHandlerBase {
    mapping(bytes32 => SedaDataTypes.Result) public results;

    constructor(
        address _sedaProverAddress
    ) ResultHandlerBase(_sedaProverAddress) {}

    function postResult(
        SedaDataTypes.Result calldata _result,
        bytes32[] memory _proof
    ) public virtual override {
        // Check if the data result has already been posted
        require(
            results[_result.drId].drId == bytes32(0),
            "Data result already posted"
        );

        // Verify the data result proof
        bytes32 resultId = SedaDataTypes.deriveResultId(_result);
        require(
            sedaProver.verifyDataResultProof(resultId, _proof),
            "Invalid data result proof"
        );

        // Store the data result
        results[_result.drId] = _result;

        emit ResultPosted(resultId, _result);
    }

    function getResult(
        bytes32 _resultId
    ) public view override returns (SedaDataTypes.Result memory) {
        return results[_resultId];
    }

    // Function to expose the deriveResultId from the SedaDataTypes library
    function deriveResultId(
        SedaDataTypes.Result calldata _result
    ) public pure returns (bytes32) {
        return SedaDataTypes.deriveResultId(_result);
    }
}
