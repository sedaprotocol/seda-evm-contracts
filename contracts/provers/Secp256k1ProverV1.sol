// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {IFeeManager} from "../interfaces/IFeeManager.sol";
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

    // Maximum allowed batch age
    uint64 public constant MAX_BATCH_AGE = 100;

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
        // Height of the last batch that was successfully posted (strictly increasing batch order)
        uint64 lastBatchHeight;
        // Merkle root of the current validator set, used to verify validator proofs in subsequent batches
        bytes32 lastValidatorsRoot;
        // Mapping of batch heights to batch data, including results root and sender address
        mapping(uint64 => BatchData) batches;
        // Interface for managing and processing verification fees
        IFeeManager feeManager;
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
    function initialize(SedaDataTypes.Batch memory initialBatch, address feeManager) external initializer {
        // Initialize inherited contracts
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __Pausable_init();

        // Initialize storage
        Secp256k1ProverStorage storage s = _storageV1();
        s.batches[initialBatch.batchHeight] = BatchData({resultsRoot: initialBatch.resultsRoot, sender: address(0)});
        s.lastBatchHeight = initialBatch.batchHeight;
        s.lastValidatorsRoot = initialBatch.validatorsRoot;
        s.feeManager = IFeeManager(feeManager);

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

        // Input validation: signatures and proofs must be of the same length
        if (signatures.length != validatorProofs.length) {
            revert MismatchedSignaturesAndProofs();
        }

        // Batch height validation
        bool shouldUpdateChainState = newBatch.batchHeight > s.lastBatchHeight;
        if (!shouldUpdateChainState) {
            // Check for duplicate batch
            if (s.batches[newBatch.batchHeight].resultsRoot != bytes32(0)) {
                revert BatchAlreadyExists(newBatch.batchHeight);
            }
            // Check if the batch is too old compared to the latest batch height
            if (s.lastBatchHeight >= newBatch.batchHeight + MAX_BATCH_AGE) {
                revert BatchHeightTooOld(newBatch.batchHeight, s.lastBatchHeight);
            }
        }

        // Consensus validation
        bytes32 batchId = SedaDataTypes.deriveBatchId(newBatch);
        _validateConsensus(batchId, signatures, validatorProofs, s.lastValidatorsRoot);

        // State updates
        s.batches[newBatch.batchHeight] = BatchData({resultsRoot: newBatch.resultsRoot, sender: msg.sender});
        if (shouldUpdateChainState) {
            s.lastBatchHeight = newBatch.batchHeight;
            s.lastValidatorsRoot = newBatch.validatorsRoot;
        }
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

    /// @notice Returns the address of the fee manager contract
    /// @return The address of the fee manager
    function getFeeManager() external view override returns (address) {
        return address(_storageV1().feeManager);
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

    /// @notice Validates consensus by checking validator proofs and signatures
    /// @dev Verifies each validator proof and signature, then checks if sufficient voting power is reached
    /// @dev Reverts if consensus is not reached or if proofs/signatures are invalid
    /// @param batchId The hash of the batch data to validate
    /// @param signatures Array of signatures from validators
    /// @param validatorProofs Array of validator proofs containing validator data and Merkle proofs
    /// @param validatorsRoot The Merkle root of the validator set to verify against
    function _validateConsensus(
        bytes32 batchId,
        bytes[] calldata signatures,
        SedaDataTypes.ValidatorProof[] calldata validatorProofs,
        bytes32 validatorsRoot
    ) internal pure {
        uint64 votingPower = 0;
        address previousSigner = address(0);

        for (uint256 i = 0; i < validatorProofs.length; i++) {
            address signer = validatorProofs[i].signer;

            if (signer <= previousSigner) revert InvalidValidatorOrder();
            if (!_verifyValidatorProof(validatorProofs[i], validatorsRoot)) revert InvalidValidatorProof();
            if (!_verifySignature(batchId, signatures[i], signer)) revert InvalidSignature();

            previousSigner = signer;
            votingPower += validatorProofs[i].votingPower;
        }

        if (votingPower < CONSENSUS_PERCENTAGE) {
            revert ConsensusNotReached();
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
