// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Secp256k1ProverV1} from "../provers/Secp256k1ProverV1.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title Secp256k1ProverResettable
/// @notice A modified version of Secp256k1ProverV1 that allows resetting state for testing
/// @dev This contract extends Secp256k1ProverV1 to add state reset functionality
///      It should only be used for testing purposes and never in production
///      as it can create inconsistent state by allowing arbitrary state changes
contract Secp256k1ProverResettable is Secp256k1ProverV1 {
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
