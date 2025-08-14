// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IFeeManager} from "../interfaces/IFeeManager.sol";

/// @title SedaCoreStorage
/// @author Open Oracle Association
/// @notice Storage library for SedaCoreV1 contract following ERC-7201 standard
/// @dev This library contains the storage layout, configuration structs, and accessor
///      functions for the SedaCoreV1 contract. It uses ERC-7201 storage pattern
///      to prevent storage collisions during upgrades and provides a clean interface
///      for accessing contract state variables.
/// @custom:storage-location sedacore.storage.v1
library SedaCoreStorage {
    // ============ Constants ============

    /// @notice ERC-7201 storage slot for SedaCoreV1 contract (version 1)
    /// @dev Namespace: "sedacore.storage.v1"
    bytes32 internal constant STORAGE_SLOT_V1 =
        keccak256(abi.encode(uint256(keccak256("sedacore.storage.v1")) - 1)) & ~bytes32(uint256(0xff));

    // ============ Structs ============

    /// @notice Details of a request including fees and metadata
    /// @dev Used to store request information for fee distribution and validation
    struct RequestDetails {
        /// @notice Timestamp when the request was created
        uint256 timestamp;
        /// @notice Fee amount for request processing
        uint256 requestFee;
        /// @notice Fee amount for result submission
        uint256 resultFee;
        /// @notice Fee amount for batch processing
        uint256 batchFee;
        /// @notice Total gas limit for the request (exec + tally)
        uint256 gasLimit;
        /// @notice Address that paid the request fee
        address requestFeeAddr;
        /// @notice Address that paid the result fee
        address resultFeeAddr;
        /// @notice Address that paid the batch fee
        address batchFeeAddr;
    }

    /// @notice Complete storage layout for SedaCoreV1 contract (v1)
    /// @dev Keep this layout stable. For new fields, create a new versioned slot and layout.
    struct Layout {
        /// @notice Period in seconds after which a request can be withdrawn
        uint256 timeoutPeriod;
        /// @notice Tracks active data requests to ensure proper lifecycle management and prevent
        ///         duplicate fulfillments. Requests are removed only after successful fulfillment
        EnumerableSet.Bytes32Set pendingRequests;
        /// @notice Associates request IDs with their metadata to enable fee distribution and
        ///         timestamp validation during result submission
        mapping(bytes32 => RequestDetails) requestDetails;
        /// @notice Fee manager contract for handling fee distributions
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
