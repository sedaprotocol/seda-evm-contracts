// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IResultHandler} from "./IResultHandler.sol";
import {IRequestHandler} from "./IRequestHandler.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title ISedaCoreV1
/// @notice Interface for the main Seda protocol contract that handles both requests and results
interface ISedaCore is IResultHandler, IRequestHandler {
    /// @notice Retrieves a paginated list of pending requests
    /// @param offset The starting position in the list
    /// @param limit The maximum number of requests to return
    /// @return An array of Request structs
    function getPendingRequests(uint256 offset, uint256 limit) external view returns (SedaDataTypes.Request[] memory);
}
