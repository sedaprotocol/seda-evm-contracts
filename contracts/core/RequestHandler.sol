// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";
import {RequestHandlerBase} from "../abstract/RequestHandlerBase.sol";

contract RequestHandler is RequestHandlerBase {
    mapping(bytes32 => SedaDataTypes.Request) public requests;

    function postRequest(
        SedaDataTypes.RequestInputs calldata _inputs
    ) public override virtual returns (bytes32) {
        // Generate a unique Request ID using SedaDataTypes library
        bytes32 requestId = SedaDataTypes.deriveRequestId(_inputs);

        // Ensure the request does not already exist
        require(
            requests[requestId].execProgramId == bytes32(0),
            "RequestHandler: Request already exists"
        );

        // Create a new Request struct and store it in the mapping
        requests[requestId] = SedaDataTypes.Request({
            version: SedaDataTypes.VERSION,
            execProgramId: _inputs.execProgramId,
            execInputs: _inputs.execInputs,
            tallyProgramId: _inputs.tallyProgramId,
            tallyInputs: _inputs.tallyInputs,
            replicationFactor: _inputs.replicationFactor,
            consensusFilter: _inputs.consensusFilter,
            gasPrice: _inputs.gasPrice,
            gasLimit: _inputs.gasLimit,
            memo: _inputs.memo
        });

        emit RequestPosted(requestId, requests[requestId]);
        return requestId;
    }

    function getRequest(
        bytes32 requestId
    ) external view override returns (SedaDataTypes.Request memory) {
        return requests[requestId];
    }

        // Function to expose the deriveRequestId from the SedaDataTypes library
    function deriveRequestId(SedaDataTypes.RequestInputs calldata _inputs) public pure returns (bytes32) {
        return SedaDataTypes.deriveRequestId(_inputs);
    }
}