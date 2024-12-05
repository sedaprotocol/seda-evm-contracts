// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {SedaDataTypes} from "../../libraries/SedaDataTypes.sol";
import {IProver} from "../../interfaces/IProver.sol";
import {IResultHandler} from "../../interfaces/IResultHandler.sol";

/// @title ResultHandler
/// @notice Implements the ResultHandlerBase for managing Seda protocol results
abstract contract ResultHandlerBase is IResultHandler, Initializable {
    IProver public sedaProver;

    // Mapping of request IDs to Result structs
    mapping(bytes32 => SedaDataTypes.Result) public results;

    // Remove constructor and add initialization function
    /// @notice Initializes the ResultHandler contract
    /// @dev Sets up the contract with the provided Seda prover address
    /// @param sedaProverAddress The address of the Seda prover contract
    // solhint-disable-next-line func-name-mixedcase
    function __ResultHandler_init(address sedaProverAddress) internal onlyInitializing {
        sedaProver = IProver(sedaProverAddress);
    }

    /// @inheritdoc IResultHandler
    function postResult(
        SedaDataTypes.Result calldata result,
        uint64 batchHeight,
        bytes32[] calldata proof
    ) public virtual override(IResultHandler) returns (bytes32) {
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

    /// @inheritdoc IResultHandler
    function getResult(bytes32 requestId) public view override(IResultHandler) returns (SedaDataTypes.Result memory) {
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
    function deriveResultId(SedaDataTypes.Result calldata result) public pure returns (bytes32) {
        return SedaDataTypes.deriveResultId(result);
    }
}
