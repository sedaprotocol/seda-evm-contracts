// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ProverBase} from "../abstract/ProverBase.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

contract Secp256k1Prover is ProverBase {
    // Default consensus percentage (2/3)
    uint32 public constant CONSENSUS_PERCENTAGE = 66_666_666;
    // Current Batch
    SedaDataTypes.Batch public currentBatch;

    constructor(SedaDataTypes.Batch memory initialBatch) {
        currentBatch = initialBatch;
        emit BatchUpdated(
            initialBatch.batchHeight,
            SedaDataTypes.deriveBatchId(initialBatch)
        );
    }

    function updateBatch(
        SedaDataTypes.Batch memory _batch,
        bytes[] memory _signatures,
        SedaDataTypes.ValidatorProof[] memory _proofs
    ) public override {
        // Check that new batch invariants hold
        require(
            _batch.batchHeight > currentBatch.batchHeight,
            "Invalid batch height"
        );
        require(
            _batch.blockHeight > currentBatch.blockHeight,
            "Invalid block height"
        );
        require(
            _signatures.length == _proofs.length,
            "Mismatched signatures and proofs"
        );

        // Derive Batch Id
        bytes32 batchId = SedaDataTypes.deriveBatchId(_batch);

        // Check that all validator proofs are valid and accumulate voting power
        uint64 votingPower = 0;
        for (uint256 i = 0; i < _proofs.length; i++) {
            require(
                _verifyValidatorProof(_proofs[i]),
                "Invalid validator proof"
            );
            require(
                _verifySignature(batchId, _signatures[i], _proofs[i].publicKey),
                "Invalid signature"
            );
            votingPower += _proofs[i].votingPower;
        }

        // Check voting power consensus
        require(votingPower >= CONSENSUS_PERCENTAGE, "Consensus not reached");

        // Update current batch
        currentBatch = _batch;
        emit BatchUpdated(_batch.batchHeight, batchId);
    }

    function verifyDataResultProof(
        bytes32 dataResultId,
        bytes32[] memory merkleProof
    ) public view override returns (bool) {
        return
            MerkleProof.verify(
                merkleProof,
                currentBatch.resultsRoot,
                dataResultId
            );
    }

    function _verifyValidatorProof(
        SedaDataTypes.ValidatorProof memory proof
    ) internal view returns (bool) {
        bytes32 leaf = keccak256(
            abi.encodePacked("SECP256K1", proof.publicKey, proof.votingPower)
        );
        return
            MerkleProof.verify(
                proof.merkleProof,
                currentBatch.validatorRoot,
                leaf
            );
    }

    function _verifySignature(
        bytes32 messageHash,
        bytes memory signature,
        bytes memory publicKey
    ) internal pure returns (bool) {
        // return ECDSA.recover(messageHash, signature) == signer;
        if (publicKey.length == 20) {
            // If the public key is already an address (20 bytes)
            address signer = address(bytes20(publicKey));
            return ECDSA.recover(messageHash, signature) == signer;
        } else if (publicKey.length == 64 || publicKey.length == 65) {
            // If the public key is a full public key (64 or 65 bytes)
            address signer = address(uint160(uint256(keccak256(publicKey))));
            return ECDSA.recover(messageHash, signature) == signer;
        } else {
            revert("Invalid public key format");
        }
    }
}