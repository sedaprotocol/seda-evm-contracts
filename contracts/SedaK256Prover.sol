// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./SedaDataTypes.sol";

contract SedaK256Prover {
    // Default consensus percentage (~2/3)
    uint32 public constant CONSENSUS_PERCENTAGE = 66_000_000;

    SedaDataTypes.Batch public currentBatch;

    event BatchUpdated(uint256 indexed batchHeight, bytes32 batchHash);

    constructor(SedaDataTypes.Batch memory initialBatch) {
        currentBatch = initialBatch;
        emit BatchUpdated(
            initialBatch.batchHeight,
            SedaDataTypes.computeBatchId(initialBatch)
        );
    }

    function updateBatch(
        SedaDataTypes.Batch memory newBatch,
        bytes[] memory signatures,
        SedaDataTypes.ValidatorProof[] memory validatorProofs
    ) public {
        require(
            newBatch.batchHeight > currentBatch.batchHeight,
            "Invalid batch height"
        );
        require(
            signatures.length == validatorProofs.length,
            "Mismatched signatures and proofs"
        );

        bytes32 batchId = SedaDataTypes.computeBatchId(newBatch);
        uint64 validVotingPower = 0;

        for (uint256 i = 0; i < validatorProofs.length; i++) {
            require(
                _verifyValidatorProof(validatorProofs[i]),
                "Invalid validator proof"
            );
            require(
                _verifySignature(
                    batchId,
                    signatures[i],
                    validatorProofs[i].publicKey
                ),
                "Invalid signature"
            );
            validVotingPower += validatorProofs[i].votingPower;
        }

        require(validVotingPower >= CONSENSUS_PERCENTAGE, "Consensus not reached");

        currentBatch = newBatch;
        emit BatchUpdated(newBatch.batchHeight, batchId);
    }

    function _verifyValidatorProof(
        SedaDataTypes.ValidatorProof memory proof
    ) internal view returns (bool) {
        bytes32 leaf = keccak256(
            abi.encodePacked(proof.publicKey, proof.votingPower)
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
        address signer
    ) internal pure returns (bool) {
        return ECDSA.recover(messageHash, signature) == signer;
    }
}
