// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFeeManager} from "../interfaces/IFeeManager.sol";

/// @title SedaFeeManager
/// @notice Manages fee distribution and withdrawals for the Seda protocol
/// @dev Implements a pull-based payment system where recipients can withdraw their fees
contract SedaFeeManager is IFeeManager {
    // Mapping to track pending fees for each address
    mapping(address => uint256) public pendingFees;

    /// @inheritdoc IFeeManager
    function addPendingFees(address recipient) external payable override {
        if (recipient == address(0)) revert InvalidRecipient();

        pendingFees[recipient] += msg.value;

        emit FeeAdded(recipient, msg.value);
    }

    /// @inheritdoc IFeeManager
    function withdrawFees() external override {
        uint256 amount = pendingFees[msg.sender];

        if (amount == 0) {
            revert NoFeesToWithdraw();
        }

        // Clear balance before transfer to prevent reentrancy
        pendingFees[msg.sender] = 0;

        // Using low-level call instead of transfer() for better compatibility
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert FeeTransferFailed();

        emit FeeWithdrawn(msg.sender, amount);
    }

    /// @inheritdoc IFeeManager
    function getPendingFees(address account) external view override returns (uint256) {
        return pendingFees[account];
    }
}
