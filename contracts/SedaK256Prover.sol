// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./SedaDataTypes.sol";

contract SedaK256Prover {
    // Default consensus percentage (2/3)
    uint32 public constant CONSENSUS_PERCENTAGE = 66_666_666;

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

        require(
            validVotingPower >= CONSENSUS_PERCENTAGE,
            "Consensus not reached"
        );

        currentBatch = newBatch;
        emit BatchUpdated(newBatch.batchHeight, batchId);
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

    function _verifyDataResultProof(
        bytes32 dataResultId,
        bytes32[] memory merkleProof
    ) external view returns (bool) {
        return
            MerkleProof.verify(
                merkleProof,
                currentBatch.resultsRoot,
                dataResultId
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
