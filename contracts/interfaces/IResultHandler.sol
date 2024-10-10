// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { SedaDataTypes } from "../libraries/SedaDataTypes.sol";

interface IResultHandler {
    function postResult(
        SedaDataTypes.Result calldata inputs,
        bytes32[] memory proof
    ) external;

    function getResult(bytes32 resultId)
        external
        view
        returns (SedaDataTypes.Result memory);
}