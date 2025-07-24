// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SedaCoreV1} from "../../core/SedaCoreV1.sol";

/// @title MockSedaCoreV2
/// @notice Mock version of SedaCore for testing purposes
/// @dev This contract is a mock and should not be used in production
/// @custom:oz-upgrades-unsafe-allow missing-initializer-call
contract MockSedaCoreV2 is SedaCoreV1 {
    // ============ Types & State ============
    bytes32 private constant CORE_V2_STORAGE_SLOT =
        keccak256(abi.encode(uint256(keccak256("sedacore.storage.v2")) - 1)) & ~bytes32(uint256(0xff));

    /// @custom:storage-location sedacore.storage.v2
    struct V2Storage {
        string version;
    }

    // ============ Errors ============
    error ContractNotUpgradeable();

    // ============ Constructor & Initializer ============
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @custom:oz-upgrades-validate-as-initializer
    function initialize() external reinitializer(2) onlyOwner {
        V2Storage storage s = _storageV2();
        s.version = "2.0.0";
    }

    // ============ External Functions ============
    /// @notice Returns the version string from V2 storage
    /// @return version The version string
    function getVersion() external view returns (string memory) {
        return _storageV2().version;
    }

    // ============ Internal Functions ============
    function _storageV2() internal pure returns (V2Storage storage s) {
        bytes32 slot = CORE_V2_STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := slot
        }
    }

    // /// @dev Override the _authorizeUpgrade function
    // function _authorizeUpgrade(address) internal virtual override onlyOwner {
    //     revert ContractNotUpgradeable();
    // }
}
