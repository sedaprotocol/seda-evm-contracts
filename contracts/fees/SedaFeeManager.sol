// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IFeeManager} from "../interfaces/IFeeManager.sol";

/// @title SedaFeeManager
/// @author Open Oracle Association
/// @notice Manages fee distribution and withdrawals for the Seda protocol
/// @dev Implements a pull-based payment system where recipients can withdraw their fees.
///      Uses a mapping to track pending fees for each address and ensures atomic fee distribution.
contract SedaFeeManager is IFeeManager {
    /// @notice Mapping to track pending fees for each address
    mapping(address => uint256) public pendingFees;

    /// @inheritdoc IFeeManager
    function addPendingFees(address recipient) external payable override {
        if (recipient == address(0)) revert InvalidRecipient();

        pendingFees[recipient] += msg.value;

        emit FeeAdded(recipient, msg.value);
    }

    /// @notice Adds pending fees for multiple recipients in a single transaction
    /// @param recipients Array of addresses to receive fees
    /// @param amounts Array of fee amounts corresponding to each recipient
    /// @dev The sum of amounts must equal msg.value
    function addPendingFeesMultiple(address[] calldata recipients, uint256[] calldata amounts) external payable {
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();

        uint256 totalAmount = 0;

        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            uint256 amount = amounts[i];

            if (recipient == address(0)) revert InvalidRecipient();

            pendingFees[recipient] += amount;
            totalAmount += amount;

            emit FeeAdded(recipient, amount);
        }

        // Ensure the total amount equals the ETH sent with the transaction
        if (totalAmount != msg.value) revert FeeAmountMismatch();
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
