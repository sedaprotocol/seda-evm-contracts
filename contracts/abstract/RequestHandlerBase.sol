// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IRequestHandler} from "../interfaces/IRequestHandler.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

abstract contract RequestHandlerBase is IRequestHandler {
    error RequestAlreadyExists(bytes32);

    event RequestPosted(bytes32 indexed requestId);

    /// @inheritdoc IRequestHandler
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs
    ) external virtual override(IRequestHandler) returns (bytes32);

    /// @inheritdoc IRequestHandler
    function getRequest(
        bytes32 requestId
    )
        external
        view
        virtual
        override(IRequestHandler)
        returns (SedaDataTypes.Request memory);
}
