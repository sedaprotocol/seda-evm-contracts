// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IRequestHandler} from "../interfaces/IRequestHandler.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

abstract contract RequestHandlerBase is IRequestHandler {
    // Event emitted when a Request is posted
    event RequestPosted(
        bytes32 indexed requestId,
        SedaDataTypes.Request request
    );

    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs
    ) external virtual override returns (bytes32);

    function getRequest(
        bytes32 requestId
    ) external view virtual returns (SedaDataTypes.Request memory);
}
