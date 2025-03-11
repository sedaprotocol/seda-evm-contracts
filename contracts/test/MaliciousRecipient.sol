// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../contracts/provers/Secp256k1ProverV1.sol";

contract MaliciousRecipient {
    // This contract will reject any ETH transfers
    receive() external payable {
        revert("I reject all ETH transfers");
    }

    function withdrawFeesFrom(address proverAddress) external {
        Secp256k1ProverV1(proverAddress).withdrawFees();
    }
}
