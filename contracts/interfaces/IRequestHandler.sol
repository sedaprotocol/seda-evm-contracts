// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title IRequestHandler
/// @notice Interface for the Request Handler contract.
interface IRequestHandler {
    error InvalidReplicationFactor();
    error RequestAlreadyExists(bytes32);
    error RequestNotFound(bytes32);
    error FeeTransferFailed();

    event RequestPosted(bytes32 indexed requestId);

    /// @notice Retrieves a stored data request by its unique identifier.
    /// @param id The unique identifier of the request to retrieve.
    /// @return request The details of the requested data.
    function getRequest(bytes32 id) external view returns (SedaDataTypes.Request memory);

    /// @notice Allows users to post a new data request.
    /// @param inputs The input parameters for the data request.
    /// @return requestId The unique identifier for the posted request.
    function postRequest(SedaDataTypes.RequestInputs calldata inputs) external payable returns (bytes32);
}
