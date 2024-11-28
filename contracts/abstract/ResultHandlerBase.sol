// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";
import {IProver} from "../interfaces/IProver.sol";
import {IResultHandler} from "../interfaces/IResultHandler.sol";

abstract contract ResultHandlerBase is IResultHandler {
    IProver public sedaProver;

    /// @notice Initializes the ResultHandlerBase contract
    /// @dev Sets the address of the SEDA Prover contract
    /// @param sedaProverAddress The address of the SEDA Prover contract
    constructor(address sedaProverAddress) {
        sedaProver = IProver(sedaProverAddress);
    }

    /// @inheritdoc IResultHandler
    function postResult(
        SedaDataTypes.Result calldata result,
        uint64 batchHeight,
        bytes32[] calldata proof
    ) external virtual override(IResultHandler) returns (bytes32);

    /// @inheritdoc IResultHandler
    function getResult(
        bytes32 requestId
    ) external view virtual override(IResultHandler) returns (SedaDataTypes.Result memory);
}
