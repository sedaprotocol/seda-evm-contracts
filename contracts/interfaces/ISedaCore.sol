// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IResultHandler} from "./IResultHandler.sol";
import {IRequestHandler} from "./IRequestHandler.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title ISedaCoreV1
/// @notice Interface for the main Seda protocol contract that handles both requests and results
interface ISedaCore is IResultHandler, IRequestHandler {
    /// @notice Enum representing different types of fee distributions
    /// @dev Used to identify fee types in events and fee distribution logic
    /// @param REQUEST Fee paid to solver submitting the data request to SEDA network
    /// @param RESULT Fee paid to solver submitting the data result from SEDA network
    /// @param BATCH Fee paid to solver that submitted the batch containing the result
    /// @param REFUND Fee refunded back to the original requestor
    enum FeeType {
        REQUEST,
        RESULT,
        BATCH,
        REFUND
    }

    /// @notice Error thrown when the fee amount is not equal to the sum of the request, result, and batch fees
    error InvalidFeeAmount();

    /// @notice Emitted when fees are distributed for a data request and result
    /// @param drId The unique identifier for the data request
    /// @param recipient The address receiving the fee distribution
    /// @param amount The amount of fees distributed to the recipient
    event FeeDistributed(bytes32 indexed drId, address indexed recipient, uint256 amount, FeeType indexed feeType);

    /// @notice Retrieves a paginated list of pending requests
    /// @param offset The starting position in the list
    /// @param limit The maximum number of requests to return
    /// @return An array of Request structs
    function getPendingRequests(uint256 offset, uint256 limit) external view returns (SedaDataTypes.Request[] memory);

    /// @notice Posts a request with associated fees
    /// @param inputs The input parameters for the data request
    /// @param requestFee Fee paid to result submitter
    /// @param resultFee Fee for result submission
    /// @param batchFee Fee for batch processing
    /// @return requestId The unique identifier for the posted request
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs,
        uint256 requestFee,
        uint256 resultFee,
        uint256 batchFee
    ) external payable returns (bytes32);
}
