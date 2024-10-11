// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ProverBase} from "../abstract/ProverBase.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title Secp256k1Prover
/// @notice Implements the ProverBase for Secp256k1 signature verification in the Seda protocol
/// @dev This contract manages batch updates and result proof verification using Secp256k1 signatures.
///      Batch validity is determined by consensus among validators, requiring:
///      - Increasing batch and block heights
///      - Valid validator proofs and signatures
///      - Sufficient voting power to meet the consensus threshold
contract Secp256k1Prover is ProverBase {
    error ConsensusNotReached();
    error InvalidBlockHeight();

    SedaDataTypes.Batch public currentBatch;

    uint32 public constant CONSENSUS_PERCENTAGE = 66_666_666;
    bytes1 internal constant SECP256K1_DOMAIN_SEPARATOR = 0x01;

    constructor(SedaDataTypes.Batch memory initialBatch) {
        currentBatch = initialBatch;
        emit BatchUpdated(
            initialBatch.batchHeight,
            SedaDataTypes.deriveBatchId(initialBatch)
        );
    }

    /// @inheritdoc ProverBase
    /// @notice Updates the current batch with new data, ensuring validity through consensus
    /// @dev Validates a new batch by checking:
    ///   1. Higher batch and block heights than the current batch
    ///   2. Matching number of signatures and validator proofs
    ///   3. Valid validator proofs (verified against the batch's validator root)
    ///   4. Valid signatures (signed by the corresponding validators)
    ///   5. Sufficient voting power to meet or exceed the consensus threshold
    /// @param newBatch The new batch data to be validated and set as current
    /// @param signatures Array of signatures from validators approving the new batch
    /// @param validatorProofs Array of validator proofs corresponding to the signatures
    function updateBatch(
        SedaDataTypes.Batch calldata newBatch,
        bytes[] calldata signatures,
        SedaDataTypes.ValidatorProof[] calldata validatorProofs
    ) public override {
        // Check that new batch invariants hold
        if (newBatch.batchHeight <= currentBatch.batchHeight) {
            revert InvalidBatchHeight();
        }
        if (newBatch.blockHeight <= currentBatch.blockHeight) {
            revert InvalidBlockHeight();
        }
        if (signatures.length != validatorProofs.length) {
            revert MismatchedSignaturesAndProofs();
        }

        // Derive Batch Id
        bytes32 batchId = SedaDataTypes.deriveBatchId(newBatch);

        // Check that all validator proofs are valid and accumulate voting power
        uint64 votingPower = 0;
        for (uint256 i = 0; i < validatorProofs.length; i++) {
            if (!_verifyValidatorProof(validatorProofs[i])) {
                revert InvalidValidatorProof();
            }
            if (
                !_verifySignature(
                    batchId,
                    signatures[i],
                    validatorProofs[i].publicKey
                )
            ) {
                revert InvalidSignature();
            }
            votingPower += validatorProofs[i].votingPower;
        }

        // Check voting power consensus
        if (votingPower < CONSENSUS_PERCENTAGE) {
            revert ConsensusNotReached();
        }

        // Update current batch
        currentBatch = newBatch;
        emit BatchUpdated(newBatch.batchHeight, batchId);
    }

    /// @inheritdoc ProverBase
    function verifyResultProof(
        bytes32 resultId,
        bytes32[] calldata merkleProof
    ) public view override returns (bool) {
        bytes32 leaf = keccak256(
            abi.encodePacked(RESULT_DOMAIN_SEPARATOR, resultId)
        );
        return MerkleProof.verify(merkleProof, currentBatch.resultsRoot, leaf);
    }

    /// @notice Verifies a validator proof
    /// @param proof The validator proof to verify
    /// @return bool Returns true if the proof is valid, false otherwise
    function _verifyValidatorProof(
        SedaDataTypes.ValidatorProof memory proof
    ) internal view returns (bool) {
        bytes32 leaf = keccak256(
            abi.encodePacked(
                SECP256K1_DOMAIN_SEPARATOR,
                proof.publicKey,
                proof.votingPower
            )
        );
        return
            MerkleProof.verify(
                proof.merkleProof,
                currentBatch.validatorRoot,
                leaf
            );
    }

    /// @notice Verifies a signature against a message hash and public key
    /// @param messageHash The hash of the message that was signed
    /// @param signature The signature to verify
    /// @param publicKey The public key of the signer
    /// @return bool Returns true if the signature is valid, false otherwise
    function _verifySignature(
        bytes32 messageHash,
        bytes calldata signature,
        bytes calldata publicKey
    ) internal pure returns (bool) {
        if (publicKey.length == 20) {
            // If the public key is already an address (20 bytes)
            address signer = address(bytes20(publicKey));
            return ECDSA.recover(messageHash, signature) == signer;
        } else if (publicKey.length == 64 || publicKey.length == 65) {
            // If the public key is a full public key (64 or 65 bytes)
            address signer = address(uint160(uint256(keccak256(publicKey))));
            return ECDSA.recover(messageHash, signature) == signer;
        } else {
            revert InvalidPublicKeyFormat();
        }
    }
}
