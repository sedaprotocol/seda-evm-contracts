// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Secp256k1ProverV1} from "../../provers/Secp256k1ProverV1.sol";

/// @title MockSecp256k1ProverV2
/// @notice Mock version of Secp256k1Prover for testing purposes
/// @dev This contract is a mock and should not be used in production
contract MockSecp256k1ProverV2 is Secp256k1ProverV1 {
    // ============ Constants ============
    bytes32 private constant PROVER_V2_STORAGE_SLOT =
        keccak256(abi.encode(uint256(keccak256("secp256k1prover.storage.v2")) - 1)) & ~bytes32(uint256(0xff));

    // ============ Errors ============
    error ContractNotUpgradeable();

    // ============ Storage ============
    /// @custom:storage-location secp256k1prover.storage.v2
    struct V2Storage {
        string version;
    }

    // ============ Constructor & Initializer ============
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

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
        bytes32 slot = PROVER_V2_STORAGE_SLOT;
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
