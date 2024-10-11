// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";
import {RequestHandlerBase} from "../abstract/RequestHandlerBase.sol";

/// @title RequestHandler
/// @notice Implements the RequestHandlerBase for managing Seda protocol requests
contract RequestHandler is RequestHandlerBase {
    mapping(bytes32 => SedaDataTypes.Request) public requests;

    /// @inheritdoc RequestHandlerBase
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs
    ) public virtual override(RequestHandlerBase) returns (bytes32) {
        bytes32 requestId = SedaDataTypes.deriveRequestId(inputs);

        if (bytes(requests[requestId].version).length != 0) {
            revert RequestAlreadyExists(requestId);
        }

        requests[requestId] = SedaDataTypes.Request({
            version: SedaDataTypes.VERSION,
            execProgramId: inputs.execProgramId,
            execInputs: inputs.execInputs,
            tallyProgramId: inputs.tallyProgramId,
            tallyInputs: inputs.tallyInputs,
            replicationFactor: inputs.replicationFactor,
            consensusFilter: inputs.consensusFilter,
            gasPrice: inputs.gasPrice,
            gasLimit: inputs.gasLimit,
            memo: inputs.memo
        });

        emit RequestPosted(requestId);
        return requestId;
    }

    /// @inheritdoc RequestHandlerBase
    function getRequest(
        bytes32 requestId
    ) external view override(RequestHandlerBase) returns (SedaDataTypes.Request memory) {
        return requests[requestId];
    }

    /// @notice Derives a request ID from the given inputs
    /// @param inputs The request inputs
    /// @return The derived request ID
    function deriveRequestId(SedaDataTypes.RequestInputs calldata inputs) public pure returns (bytes32) {
        return SedaDataTypes.deriveRequestId(inputs);
    }
}