// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Secp256k1ProverV1} from "../provers/Secp256k1ProverV1.sol";

/// @title MockSecp256k1ProverV2
/// @notice Mock version of Secp256k1Prover for testing purposes
/// @dev This contract is a mock and should not be used in production
contract MockSecp256k1ProverV2 is Secp256k1ProverV1 {
    error ContractNotUpgradeable();

    bytes32 private constant V2_STORAGE_SLOT =
        keccak256("secp256k1prover.v2.storage");

    struct V2Storage {
        string version;
    }

    function _v2Storage() internal pure returns (V2Storage storage s) {
        bytes32 slot = V2_STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := slot
        }
    }

    /// @notice Returns the version string from V2 storage
    /// @return version The version string
    function getVersion() external view returns (string memory) {
        return _v2Storage().version;
    }

    function initialize() external reinitializer(2) onlyOwner {
        V2Storage storage s = _v2Storage();
        s.version = "2.0.0";
    }

    // /// @dev Override the _authorizeUpgrade function
    // function _authorizeUpgrade(address) internal virtual override onlyOwner {
    //     revert ContractNotUpgradeable();
    // }
}
