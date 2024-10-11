// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";
import {ResultHandlerBase} from "../abstract/ResultHandlerBase.sol";

/// @title ResultHandler
/// @notice Implements the ResultHandlerBase for managing Seda protocol results
contract ResultHandler is ResultHandlerBase {
    mapping(bytes32 => SedaDataTypes.Result) public results;

    constructor(
        address sedaProverAddress
    ) ResultHandlerBase(sedaProverAddress) {}

    /// @inheritdoc ResultHandlerBase
    function postResult(
        SedaDataTypes.Result calldata result,
        bytes32[] calldata proof
    ) public virtual override(ResultHandlerBase) {
        bytes32 resultId = SedaDataTypes.deriveResultId(result);
        if (results[result.drId].drId != bytes32(0)) {
            revert ResultAlreadyPosted(resultId);
        }
        if (!sedaProver.verifyResultProof(resultId, proof)) {
            revert InvalidResultProof(resultId);
        }

        results[result.drId] = result;

        emit ResultPosted(resultId);
    }

    /// @inheritdoc ResultHandlerBase
    function getResult(
        bytes32 resultId
    )
        public
        view
        override(ResultHandlerBase)
        returns (SedaDataTypes.Result memory)
    {
        return results[resultId];
    }

    /// @notice Derives a result ID from the given result
    /// @param result The result data
    /// @return The derived result ID
    function deriveResultId(
        SedaDataTypes.Result calldata result
    ) public pure returns (bytes32) {
        return SedaDataTypes.deriveResultId(result);
    }
}
