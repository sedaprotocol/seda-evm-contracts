// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/**
 * @title IRequestHandler
 * @dev Interface for the Request Handler contract.
 * Defines the essential functions for posting and retrieving data requests.
 */
interface IRequestHandler {
    /**
     * @dev Allows users to post a new data request.
     * @param inputs The input parameters for the data request.
     * @return requestId The unique identifier for the posted request.
     */
    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs
    ) external returns (bytes32);

    /**
     * @dev Retrieves a stored data request by its unique identifier.
     * @param id The unique identifier of the request to retrieve.
     * @return request The details of the requested data.
     */
    function getRequest(
        bytes32 id
    ) external view returns (SedaDataTypes.Request memory);
}
