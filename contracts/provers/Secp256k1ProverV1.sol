// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
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
contract Secp256k1ProverV1 is ProverBase, Initializable, UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable {
    // ============ Types & State ============

    // The percentage of voting power required for consensus (66.666666%, represented as parts per 100,000,000)
    uint32 public constant CONSENSUS_PERCENTAGE = 66_666_666;

    // Domain separator for Secp256k1 Merkle Tree leaves
    bytes1 internal constant SECP256K1_DOMAIN_SEPARATOR = 0x01;

    // Constant storage slot for the state following the ERC-7201 standard
    bytes32 private constant PROVER_V1_STORAGE_SLOT =
        keccak256(abi.encode(uint256(keccak256("secp256k1prover.storage.v1")) - 1)) & ~bytes32(uint256(0xff));

    struct BatchData {
        bytes32 resultsRoot;
        address sender;
    }

    /// @custom:storage-location secp256k1prover.storage.v1
    struct Secp256k1ProverStorage {
        // Hight of the most recently processed batch to ensure strictly increasing batch order
        uint64 lastBatchHeight;
        // Merkle root of the current validator set, used to verify validator proofs in subsequent batches
        bytes32 lastValidatorsRoot;
        // Mapping of batch heights to batch data, including results root and sender address
        mapping(uint64 => BatchData) batches;
    }

    // ============ Errors ============

    /// @notice Thrown when the total voting power of valid signatures is below the required consensus threshold
    error ConsensusNotReached();

    // ============ Constructor & Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract with initial batch data
    /// @dev Sets up the contract's initial state and initializes inherited contracts
    /// @param initialBatch The initial batch data containing height, validators root, and results root
    function initialize(SedaDataTypes.Batch memory initialBatch) external initializer {
        // Initialize inherited contracts
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __Pausable_init();
        // Existing initialization code
        Secp256k1ProverStorage storage s = _storageV1();
        s.batches[initialBatch.batchHeight] = BatchData({resultsRoot: initialBatch.resultsRoot, sender: address(0)});
        s.lastBatchHeight = initialBatch.batchHeight;
        s.lastValidatorsRoot = initialBatch.validatorsRoot;
        emit BatchPosted(initialBatch.batchHeight, SedaDataTypes.deriveBatchId(initialBatch), address(0));
    }

    // ============ External Functions ============

    /// @inheritdoc ProverBase
    /// @notice Posts a new batch with new data, ensuring validity through consensus
    /// @dev Validates a new batch by checking:
    ///   1. Higher batch height than the current batch
    ///   2. Matching number of signatures and validator proofs
    ///   3. Validator signers must be provided in strictly increasing order
    ///   4. Valid validator proofs (verified against the batch's validator root)
    ///   5. Valid signatures (signed by the corresponding validators)
    ///   6. Sufficient voting power to meet or exceed the consensus threshold
    /// @param newBatch The new batch data to be validated and set as current
    /// @param signatures Array of signatures from validators approving the new batch
    /// @param validatorProofs Array of validator proofs corresponding to the signatures, must be sorted by signer address in ascending order
    function postBatch(
        SedaDataTypes.Batch calldata newBatch,
        bytes[] calldata signatures,
        SedaDataTypes.ValidatorProof[] calldata validatorProofs
    ) external override(ProverBase) whenNotPaused {
        Secp256k1ProverStorage storage s = _storageV1();
        // Prevents replay attacks via strictly ordered batches
        if (newBatch.batchHeight <= s.lastBatchHeight) {
            revert InvalidBatchHeight();
        }
        // Each signature needs a validator Merkle Proof
        if (signatures.length != validatorProofs.length) {
            revert MismatchedSignaturesAndProofs();
        }

        bytes32 batchId = SedaDataTypes.deriveBatchId(newBatch);

        // Accumulate voting power from valid validators to ensure sufficient consensus
        // Each validator must prove membership and provide a valid signature
        uint64 votingPower = 0;
        // Check for duplicate validators
        address previousSigner = address(0);
        for (uint256 i = 0; i < validatorProofs.length; i++) {
            address signer = validatorProofs[i].signer;

            // Enforce strictly increasing addresses (sorted input requirement)
            if (signer <= previousSigner) revert InvalidValidatorOrder();
            // Verify validator is part of the current validator set using Merkle proof
            if (!_verifyValidatorProof(validatorProofs[i], s.lastValidatorsRoot)) revert InvalidValidatorProof();
            // Verify signature is valid and signed by the validator
            if (!_verifySignature(batchId, signatures[i], signer)) revert InvalidSignature();

            previousSigner = signer;
            votingPower += validatorProofs[i].votingPower;
        }

        // Check that voting power meets or exceeds the consensus threshold (2/3)
        if (votingPower < CONSENSUS_PERCENTAGE) {
            revert ConsensusNotReached();
        }

        // After consensus is reached, commit the new batch and update validator set
        // This establishes the new state for future batch validations
        s.lastBatchHeight = newBatch.batchHeight;
        s.lastValidatorsRoot = newBatch.validatorsRoot;
        s.batches[newBatch.batchHeight] = BatchData({resultsRoot: newBatch.resultsRoot, sender: msg.sender});
        emit BatchPosted(newBatch.batchHeight, batchId, msg.sender);
    }

    /// @notice Pauses all contract operations
    /// @dev Can only be called by the contract owner
    /// @dev When paused, all state-modifying functions will revert
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses contract operations
    /// @dev Can only be called by the contract owner
    /// @dev Restores normal contract functionality after being paused
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ External View Functions ============

    /// @notice Verifies a result proof against a batch's results root
    /// @param resultId The ID of the result to verify
    /// @param batchHeight The height of the batch containing the result
    /// @param merkleProof The Merkle proof for the result
    /// @return bool Returns true if the proof is valid, false otherwise
    function verifyResultProof(
        bytes32 resultId,
        uint64 batchHeight,
        bytes32[] calldata merkleProof
    ) external view override(ProverBase) returns (bool, address) {
        BatchData memory batch = _storageV1().batches[batchHeight];
        bytes32 leaf = keccak256(abi.encodePacked(RESULT_DOMAIN_SEPARATOR, resultId));
        return MerkleProof.verify(merkleProof, batch.resultsRoot, leaf) ? (true, batch.sender) : (false, address(0));
    }

    /// @notice Returns the last processed batch height
    /// @return The height of the last batch
    function getLastBatchHeight() external view override returns (uint64) {
        return _storageV1().lastBatchHeight;
    }

    /// @notice Returns the last validators root hash
    /// @return The Merkle root of the last validator set
    function getLastValidatorsRoot() external view returns (bytes32) {
        return _storageV1().lastValidatorsRoot;
    }

    // ============ Internal Functions ============

    /// @notice Returns the storage struct for the contract
    /// @dev Uses ERC-7201 storage pattern to access the storage struct at a specific slot
    /// @return s The storage struct containing the contract's state variables
    function _storageV1() internal pure returns (Secp256k1ProverStorage storage s) {
        bytes32 slot = PROVER_V1_STORAGE_SLOT;
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
        bytes32 leaf = keccak256(abi.encodePacked(SECP256K1_DOMAIN_SEPARATOR, proof.signer, proof.votingPower));

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
        onlyOwner // solhint-disable-next-line no-empty-blocks
    {}
}
