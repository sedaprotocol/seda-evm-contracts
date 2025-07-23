// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {ProverBase} from "../provers/abstract/ProverBase.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title MockProver
/// @notice A mock implementation of ProverBase for testing purposes
/// @dev Allows any batch to be posted without signature verification
contract MockProver is ProverBase {
    // ============ Storage ============
    struct BatchData {
        bytes32 resultsRoot;
        address sender;
    }

    uint64 private _lastBatchHeight;
    mapping(uint64 => BatchData) private _batches;

    // ============ Constructor ============

    /// @notice Constructor that sets the initial batch
    /// @param initialBatch The initial batch data
    constructor(SedaDataTypes.Batch memory initialBatch) {
        _lastBatchHeight = initialBatch.batchHeight;
        _batches[initialBatch.batchHeight] = BatchData({resultsRoot: initialBatch.resultsRoot, sender: address(0)});
    }

    // ============ External Functions ============

    /// @notice Posts a new batch without any verification
    /// @dev Ignores signatures and validator proofs, only checks batch height
    function postBatch(
        SedaDataTypes.Batch calldata newBatch,
        bytes[] calldata, // signatures (ignored)
        SedaDataTypes.ValidatorProof[] calldata // validatorProofs (ignored)
    ) external override {
        if (newBatch.batchHeight <= _lastBatchHeight) {
            revert BatchHeightTooOld(newBatch.batchHeight, _lastBatchHeight, 0);
        }

        _lastBatchHeight = newBatch.batchHeight;
        _batches[newBatch.batchHeight] = BatchData({resultsRoot: newBatch.resultsRoot, sender: msg.sender});

        emit BatchPosted(newBatch.batchHeight, SedaDataTypes.deriveBatchId(newBatch), msg.sender);
    }

    /// @notice Verifies a result proof against a batch's results root
    /// @dev For testing purposes, returns true only for existing batches with stored roots
    function verifyResultProof(
        bytes32 resultId,
        uint64 batchHeight,
        bytes32[] calldata merkleProof
    ) external view override returns (bool, address) {
        // Only return true if we have a stored batch at this height
        BatchData memory batch = _batches[batchHeight];
        bytes32 leaf = keccak256(abi.encodePacked(RESULT_DOMAIN_SEPARATOR, resultId));
        return MerkleProof.verify(merkleProof, batch.resultsRoot, leaf) ? (true, batch.sender) : (false, address(0));
    }

    /// @notice Returns the last batch height
    function getLastBatchHeight() external view override returns (uint64) {
        return _lastBatchHeight;
    }

    function getFeeManager() external pure override returns (address) {
        return address(0);
    }
}
