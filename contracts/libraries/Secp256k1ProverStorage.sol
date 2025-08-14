// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IFeeManager} from "../interfaces/IFeeManager.sol";

/// @title Secp256k1ProverStorage
/// @author Open Oracle Association
/// @notice Storage library for Secp256k1ProverV1 contract following ERC-7201 standard
/// @dev This library contains the storage layout, configuration structs, and accessor
///      functions for the Secp256k1ProverV1 contract. It uses ERC-7201 storage pattern
///      to prevent storage collisions during upgrades and provides a clean interface
///      for accessing contract state variables.
/// @custom:storage-location secp256k1prover.storage.v1
library Secp256k1ProverStorage {
    // ============ Constants ============

    /// @notice ERC-7201 storage slot for Secp256k1ProverV1 contract (version 1)
    /// @dev Namespace: "secp256k1prover.storage.v1"
    bytes32 internal constant STORAGE_SLOT_V1 =
        keccak256(abi.encode(uint256(keccak256("secp256k1prover.storage.v1")) - 1)) & ~bytes32(uint256(0xff));

    // ============ Structs ============

    /// @notice Batch data containing results root and sender information
    /// @dev Used to store batch information for verification purposes
    struct BatchData {
        /// @notice Merkle root of the results in this batch
        bytes32 resultsRoot;
        /// @notice Address that posted this batch
        address sender;
    }

    /// @notice Complete storage layout for Secp256k1ProverV1 contract (v1)
    /// @dev Keep this layout stable. For new fields, create a new versioned slot and layout.
    struct Layout {
        /// @notice Mapping of batch heights to batch data, including results root and sender address
        mapping(uint64 => BatchData) batches;
        /// @notice Merkle root of the current validator set, used to verify validator proofs in subsequent batches
        bytes32 lastValidatorsRoot;
        /// @notice Height of the latest batch that updates the validator set
        uint64 lastBatchHeight;
        /// @notice Maximum allowed age difference between batches. If zero, only strictly increasing batches are accepted
        uint64 maxBatchAge;
        /// @notice Interface for managing and processing verification fees
        IFeeManager feeManager;
    }

    // ============ Functions ============

    /// @notice Returns the storage struct at the ERC-7201 storage slot
    /// @return s The storage struct containing the contract's state variables
    /// @dev Accesses the contract's storage layout using assembly based on the ERC-7201 slot.
    function layout() internal pure returns (Layout storage s) {
        bytes32 slot = STORAGE_SLOT_V1;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := slot
        }
    }
}
