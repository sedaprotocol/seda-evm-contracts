// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Secp256k1ProverV1} from "../../provers/Secp256k1ProverV1.sol";
import {SedaDataTypes} from "../../libraries/SedaDataTypes.sol";

/// @title MockSecp256k1ProverV2Resettable
/// @notice Mock version of Secp256k1ProverV2 with state reset capability for testing purposes
/// @dev This contract is a mock and should not be used in production
contract Secp256k1ProverV2Resettable is Secp256k1ProverV1 {
    /// @notice Resets the prover's state to a given batch state
    /// @dev This function is only available in mock contracts for testing purposes.
    ///      WARNING: This function only updates the latest state but does not clear historical
    ///      batch results from storage (batchToResultsRoot mapping). This could lead to 
    ///      inconsistent state and should NEVER be used in production.
    /// @param batch The batch data to reset the state to, containing height, validators root, and results root
    function resetProverState(SedaDataTypes.Batch memory batch) external onlyOwner {
        // Reset storage to zero values
        Secp256k1ProverStorage storage s = _storageV1();
        s.batchToResultsRoot[batch.batchHeight] = batch.resultsRoot;
        s.lastBatchHeight = batch.batchHeight;
        s.lastValidatorsRoot = batch.validatorsRoot;
        emit BatchPosted(batch.batchHeight, SedaDataTypes.deriveBatchId(batch));
    }
} 