// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../contracts/interfaces/IFeeManager.sol";

contract MaliciousRecipient {
    // This contract will reject any ETH transfers
    receive() external payable {
        revert("I reject all ETH transfers");
    }

    function withdrawFeesFrom(address feeManager) external {
        IFeeManager(feeManager).withdrawFees();
    }
}
