// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title IRequestHandler
/// @notice Interface for the Request Handler contract.
interface IRequestHandler {
    /// @notice Emitted when a new request is successfully posted
    /// @param requestId The unique identifier of the posted request
    event RequestPosted(bytes32 indexed requestId);

    /// @notice Error thrown when a data request parameter is invalid (e.g., replication factor is zero, gas price is too low)
    /// @param parameterName The name of the invalid parameter
    /// @param value The provided invalid value
    /// @param minimumRequired The minimum required value for the parameter
    error InvalidParameter(string parameterName, uint256 value, uint256 minimumRequired);

    /// @notice Error thrown when attempting to post a request with an ID that already exists
    /// @param requestId The ID that was already used for a previous request
    error RequestAlreadyExists(bytes32 requestId);

    /// @notice Error thrown when trying to access a request that doesn't exist
    /// @param requestId The ID of the non-existent request
    error RequestNotFound(bytes32 requestId);

    /// @notice Error thrown when the transfer of fees fails
    error FeeTransferFailed();

    /// @notice Retrieves a stored data request by its unique identifier.
    /// @param id The unique identifier of the request to retrieve.
    /// @return request The details of the requested data.
    function getRequest(bytes32 id) external view returns (SedaDataTypes.Request memory);

    /// @notice Allows users to post a new data request.
    /// @param inputs The input parameters for the data request.
    /// @return requestId The unique identifier for the posted request.
    function postRequest(SedaDataTypes.RequestInputs calldata inputs) external payable returns (bytes32);
}
