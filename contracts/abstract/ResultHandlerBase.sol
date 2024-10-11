// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";
import {IProver} from "../interfaces/IProver.sol";
import {IResultHandler} from "../interfaces/IResultHandler.sol";

abstract contract ResultHandlerBase is IResultHandler {
    IProver public sedaProver;

    // Event emitted when a Result is posted
    event ResultPosted(bytes32 indexed resultId);

    constructor(address sedaProverAddress) {
        sedaProver = IProver(sedaProverAddress);
    }

    /// @inheritdoc IResultHandler
    function postResult(
        SedaDataTypes.Result calldata result,
        bytes32[] calldata proof
    ) external virtual override(IResultHandler);

    /// @inheritdoc IResultHandler
    function getResult(
        bytes32 resultId
    ) external view virtual override(IResultHandler) returns (SedaDataTypes.Result memory);
}
