// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFeeManager} from "../../contracts/interfaces/IFeeManager.sol";

contract MaliciousRecipient {
    error EthTransfersRejected();

    // This contract will reject any ETH transfers
    receive() external payable {
        revert EthTransfersRejected();
    }

    function withdrawFeesFrom(address feeManager) external {
        IFeeManager(feeManager).withdrawFees();
    }
}
