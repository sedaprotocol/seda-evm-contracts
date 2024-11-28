// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";
import {ResultHandlerBase} from "../abstract/ResultHandlerBase.sol";

/// @title ResultHandler
/// @notice Implements the ResultHandlerBase for managing Seda protocol results
contract ResultHandler is ResultHandlerBase {
    // Mapping of request IDs to Result structs
    mapping(bytes32 => SedaDataTypes.Result) public results;

    /// @notice Initializes the ResultHandler contract
    /// @dev Sets up the contract with the provided Seda prover address
    /// @param sedaProverAddress The address of the Seda prover contract
    constructor(
        address sedaProverAddress
    ) ResultHandlerBase(sedaProverAddress) {}

    /// @inheritdoc ResultHandlerBase
    function postResult(
        SedaDataTypes.Result calldata result,
        uint64 batchHeight,
        bytes32[] calldata proof
    ) public virtual override(ResultHandlerBase) returns (bytes32) {
        bytes32 resultId = SedaDataTypes.deriveResultId(result);
        if (results[result.drId].drId != bytes32(0)) {
            revert ResultAlreadyExists(resultId);
        }
        if (!sedaProver.verifyResultProof(resultId, batchHeight, proof)) {
            revert InvalidResultProof(resultId);
        }

        results[result.drId] = result;

        emit ResultPosted(resultId);
        return resultId;
    }

    /// @inheritdoc ResultHandlerBase
    function getResult(
        bytes32 requestId
    )
        public
        view
        override(ResultHandlerBase)
        returns (SedaDataTypes.Result memory)
    {
        SedaDataTypes.Result memory result = results[requestId];
        if (bytes(result.version).length == 0) {
            revert ResultNotFound(requestId);
        }

        return results[requestId];
    }

    /// @notice Verifies the result without storing it
    /// @param result The result to verify
    /// @param batchHeight The height of the batch the result belongs to
    /// @param proof The proof associated with the result
    /// @return A boolean indicating whether the result is valid
    function verifyResult(
        SedaDataTypes.Result calldata result,
        uint64 batchHeight,
        bytes32[] calldata proof
    ) public view returns (bytes32) {
        bytes32 resultId = SedaDataTypes.deriveResultId(result);
        if (!sedaProver.verifyResultProof(resultId, batchHeight, proof)) {
            revert InvalidResultProof(resultId);
        }

        return resultId;
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
