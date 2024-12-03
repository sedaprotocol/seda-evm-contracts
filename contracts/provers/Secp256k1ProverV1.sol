// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {ProverBase} from "./abstract/ProverBase.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title Secp256k1ProverV1
/// @notice Implements the ProverBase for Secp256k1 signature verification in the Seda protocol
/// @dev This contract manages batch updates and result proof verification using Secp256k1 signatures.
///      Batch validity is determined by consensus among validators, requiring:
///      - Increasing batch and block heights
///      - Valid validator proofs and signatures
///      - Sufficient voting power to meet the consensus threshold
contract Secp256k1ProverV1 is
    ProverBase,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    // ============ Errors ============
    // Error thrown when consensus is not reached
    error ConsensusNotReached();

    // ============ Constants ============

    // The percentage of voting power required for consensus (66.666666%, represented as parts per 100,000,000)
    uint32 public constant CONSENSUS_PERCENTAGE = 66_666_666;
    // Domain separator for Secp256k1 Merkle Tree leaves
    bytes1 internal constant SECP256K1_DOMAIN_SEPARATOR = 0x01;
    // Constant storage slot for the state following the ERC-7201 standard
    bytes32 private constant STORAGE_SLOT =
        keccak256(
            abi.encode(uint256(keccak256("secp256k1prover.v1.storage")) - 1)
        ) & ~bytes32(uint256(0xff));

    // ============ Storage ============

    /// @custom:storage-location secp256k1prover.v1.storage
    struct Secp256k1ProverStorage {
        uint64 lastBatchHeight;
        bytes32 lastValidatorsRoot;
        mapping(uint64 => bytes32) batchToResultsRoot;
    }

    // ============ Constructor & Initializer ============

    /// @notice Initializes the contract with initial batch data
    /// @dev Sets up the contract's initial state and initializes inherited contracts
    /// @param initialBatch The initial batch data containing height, validators root, and results root
    function initialize(
        SedaDataTypes.Batch memory initialBatch
    ) public initializer {
        // Initialize inherited contracts
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();

        // Existing initialization code
        Secp256k1ProverStorage storage s = _storage();
        s.batchToResultsRoot[initialBatch.batchHeight] = initialBatch
            .resultsRoot;
        s.lastBatchHeight = initialBatch.batchHeight;
        s.lastValidatorsRoot = initialBatch.validatorsRoot;
        emit BatchPosted(
            initialBatch.batchHeight,
            SedaDataTypes.deriveBatchId(initialBatch)
        );
    }

    // ============ External Functions ============

    /// @inheritdoc ProverBase
    /// @notice Posts a new batch with new data, ensuring validity through consensus
    /// @dev Validates a new batch by checking:
    ///   1. Higher batch height than the current batch
    ///   2. Matching number of signatures and validator proofs
    ///   3. Valid validator proofs (verified against the batch's validator root)
    ///   4. Valid signatures (signed by the corresponding validators)
    ///   5. Sufficient voting power to meet or exceed the consensus threshold
    /// @param newBatch The new batch data to be validated and set as current
    /// @param signatures Array of signatures from validators approving the new batch
    /// @param validatorProofs Array of validator proofs corresponding to the signatures
    function postBatch(
        SedaDataTypes.Batch calldata newBatch,
        bytes[] calldata signatures,
        SedaDataTypes.ValidatorProof[] calldata validatorProofs
    ) public override {
        Secp256k1ProverStorage storage s = _storage();
        // Check that new batch invariants hold
        if (newBatch.batchHeight <= s.lastBatchHeight) {
            revert InvalidBatchHeight();
        }
        if (signatures.length != validatorProofs.length) {
            revert MismatchedSignaturesAndProofs();
        }

        // Derive Batch Id
        bytes32 batchId = SedaDataTypes.deriveBatchId(newBatch);

        // Check that all validator proofs are valid and accumulate voting power
        uint64 votingPower = 0;
        for (uint256 i = 0; i < validatorProofs.length; i++) {
            if (
                !_verifyValidatorProof(validatorProofs[i], s.lastValidatorsRoot)
            ) {
                revert InvalidValidatorProof();
            }
            if (
                !_verifySignature(
                    batchId,
                    signatures[i],
                    validatorProofs[i].signer
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
        s.lastBatchHeight = newBatch.batchHeight;
        s.lastValidatorsRoot = newBatch.validatorsRoot;
        s.batchToResultsRoot[newBatch.batchHeight] = newBatch.resultsRoot;
        emit BatchPosted(newBatch.batchHeight, batchId);
    }

    // ============ Public View Functions ============

    /// @notice Verifies a result proof against a batch's results root
    /// @param resultId The ID of the result to verify
    /// @param batchHeight The height of the batch containing the result
    /// @param merkleProof The Merkle proof for the result
    /// @return bool Returns true if the proof is valid, false otherwise
    function verifyResultProof(
        bytes32 resultId,
        uint64 batchHeight,
        bytes32[] calldata merkleProof
    ) public view override returns (bool) {
        Secp256k1ProverStorage storage s = _storage();
        bytes32 leaf = keccak256(
            abi.encodePacked(RESULT_DOMAIN_SEPARATOR, resultId)
        );
        return
            MerkleProof.verify(
                merkleProof,
                s.batchToResultsRoot[batchHeight],
                leaf
            );
    }

    /// @notice Returns the last processed batch height
    /// @return The height of the last batch
    function getLastBatchHeight() public view returns (uint64) {
        return _storage().lastBatchHeight;
    }

    /// @notice Returns the last validators root hash
    /// @return The Merkle root of the last validator set
    function getLastValidatorsRoot() public view returns (bytes32) {
        return _storage().lastValidatorsRoot;
    }

    /// @notice Returns the results root for a specific batch height
    /// @param batchHeight The batch height to query
    /// @return The results root for the specified batch
    function getBatchResultsRoot(
        uint64 batchHeight
    ) public view returns (bytes32) {
        return _storage().batchToResultsRoot[batchHeight];
    }

    // ============ Internal Functions ============

    /// @notice Returns the storage struct for the contract
    /// @dev Uses ERC-7201 storage pattern to access the storage struct at a specific slot
    /// @return s The storage struct containing the contract's state variables
    function _storage()
        internal
        pure
        returns (Secp256k1ProverStorage storage s)
    {
        bytes32 slot = STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := slot
        }
    }

    /// @notice Verifies a validator proof against the validators root
    /// @dev Constructs a leaf using SECP256K1_DOMAIN_SEPARATOR and verifies it against the validators root
    /// @param proof The validator proof containing signer, voting power, and Merkle proof
    /// @param validatorsRoot The root hash to verify against
    /// @return bool Returns true if the proof is valid, false otherwise
    function _verifyValidatorProof(
        SedaDataTypes.ValidatorProof memory proof,
        bytes32 validatorsRoot
    ) internal pure returns (bool) {
        bytes32 leaf = keccak256(
            abi.encodePacked(
                SECP256K1_DOMAIN_SEPARATOR,
                proof.signer,
                proof.votingPower
            )
        );

        return MerkleProof.verify(proof.merkleProof, validatorsRoot, leaf);
    }

    /// @notice Verifies a signature against a message hash and its address
    /// @param messageHash The hash of the message that was signed
    /// @param signature The signature to verify
    /// @param signer The validator Secp256k1 address signer
    /// @return bool Returns true if the signature is valid, false otherwise
    function _verifySignature(
        bytes32 messageHash,
        bytes calldata signature,
        address signer
    ) internal pure returns (bool) {
        return ECDSA.recover(messageHash, signature) == signer;
    }

    /// @dev Required override for UUPSUpgradeable. Ensures only the owner can upgrade the implementation.
    /// @inheritdoc UUPSUpgradeable
    /// @param newImplementation Address of the new implementation contract
    function _authorizeUpgrade(
        address newImplementation
    )
        internal
        virtual
        override
        onlyOwner
    // solhint-disable-next-line no-empty-blocks
    {}
}
