// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISedaFeeManager
/// @notice Interface for the SedaFeeManager contract
/// @dev Defines functions for fee balance tracking and withdrawals
interface IFeeManager {
    /// @notice Emitted when fees are added to a recipient's balance
    /// @param recipient The address receiving the fee
    /// @param amount The amount of fees added
    event FeeAdded(address indexed recipient, uint256 amount);

    /// @notice Emitted when fees are withdrawn by a recipient
    /// @param recipient The address that withdrew fees
    /// @param amount The amount of fees withdrawn
    event FeeWithdrawn(address indexed recipient, uint256 amount);

    /// @notice Error thrown when attempting to withdraw zero fees
    error NoFeesToWithdraw();

    /// @notice Error thrown when the fee transfer fails
    error FeeTransferFailed();

    /// @notice Error thrown when an invalid recipient address is provided
    error InvalidRecipient();

    /// @notice Error thrown when the recipients and amounts arrays have different lengths
    error ArrayLengthMismatch();

    /// @notice Error thrown when the sum of amounts doesn't match the msg.value
    error FeeAmountMismatch();

    /// @notice Adds fees to an address's pending balance
    /// @param recipient The address to add fees for
    /// @dev This function is payable to allow ETH to be sent with the function call
    function addPendingFees(address recipient) external payable;

    /// @notice Adds pending fees for multiple recipients in a single transaction
    /// @param recipients Array of addresses to receive fees
    /// @param amounts Array of fee amounts corresponding to each recipient
    /// @dev The sum of amounts must equal msg.value
    function addPendingFeesMultiple(address[] calldata recipients, uint256[] calldata amounts) external payable;

    /// @notice Returns the amount of pending fees for an address
    /// @param account The address to check
    /// @return The amount of pending fees
    function getPendingFees(address account) external view returns (uint256);

    /// @notice Allows users to withdraw their accumulated fees
    /// @dev Reverts with NoFeesToWithdraw if there are no fees to withdraw
    /// @dev Reverts with FeeTransferFailed if the transfer fails
    /// @dev Reverts with InvalidRecipient if recipient is zero address
    function withdrawFees() external;
}
