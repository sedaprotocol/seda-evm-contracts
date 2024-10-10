// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title IResultHandler
/// @notice Interface for handling result posting and retrieval
interface IResultHandler {
    /// @notice Posts a new result with a proof
    /// @param inputs The result data to be posted
    /// @param proof The proof associated with the result
    function postResult(
        SedaDataTypes.Result calldata inputs,
        bytes32[] memory proof
    ) external;

    /// @notice Retrieves a result by its ID
    /// @param id The unique identifier of the result
    /// @return The result data associated with the given ID
    function getResult(
        bytes32 id
    ) external view returns (SedaDataTypes.Result memory);
}
