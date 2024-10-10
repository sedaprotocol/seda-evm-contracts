// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";
import {IProver} from "../interfaces/IProver.sol";
import {IResultHandler} from "../interfaces/IResultHandler.sol";

abstract contract ResultHandlerBase is IResultHandler {
    IProver public sedaProver;

    // Event emitted when a Result is posted
    event ResultPosted(bytes32 indexed resultId, SedaDataTypes.Result result);

    constructor(address _sedaProverAddress) {
        sedaProver = IProver(_sedaProverAddress);
    }

    function postResult(
        SedaDataTypes.Result calldata _result,
        bytes32[] memory _proof
    ) public virtual override;

    function getResult(
        bytes32 _resultId
    ) public view virtual override returns (SedaDataTypes.Result memory);
}
