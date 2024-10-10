// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IProver} from "../interfaces/IProver.sol";
import "./Secp256k1Prover.sol";
import "./ResultHandler.sol";
import "./RequestHandler.sol";

contract SedaCoreV1 is ResultHandler, RequestHandler {
    // Array to store request IDs for iteration
    bytes32[] public requestIds;

    constructor(address _sedaProverAddress) ResultHandler(_sedaProverAddress) {}

    // Function to retrieve active requests
    function getRequests(
        uint256 offset,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        uint256 totalRequests = requestIds.length;
        // TODO: check this!
        // if (offset >= totalRequests) {
        //     return new bytes32[](0);
        // }

        uint256 actualLimit = offset + limit > totalRequests
            ? totalRequests - offset
            : limit;
        bytes32[] memory requests = new bytes32[](actualLimit);

        for (uint256 i = 0; i < actualLimit; i++) {
            requests[i] = requestIds[offset + i];
        }

        return requests;
    }

    // Modified postDataRequest function
    function postRequest(
        SedaDataTypes.RequestInputs calldata _inputs
    ) public override returns (bytes32) {
        bytes32 drId = super.postRequest(_inputs);
        _addRequest(drId);
        return drId;
    }

    // Modified postDataResult function
    function postResult(
        SedaDataTypes.Result calldata _result,
        bytes32[] memory _proof
    ) public override {
        super.postResult(_result, _proof);
        _removeRequest(_result.drId);
    }

    // TODO: improve
    function _addRequest(bytes32 drId) internal {
        requestIds.push(drId);
    }

    // TODO: improve
    function _removeRequest(bytes32 drId) internal {
        // Find and remove the request ID from the array
        for (uint256 i = 0; i < requestIds.length; i++) {
            if (requestIds[i] == drId) {
                requestIds[i] = requestIds[requestIds.length - 1];
                requestIds.pop();
                break;
            }
        }
    }
}
