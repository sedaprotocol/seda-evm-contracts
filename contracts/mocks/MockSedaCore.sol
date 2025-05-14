// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISedaCore} from "../interfaces/ISedaCore.sol";
import {SedaDataTypes} from "../libraries/SedaDataTypes.sol";

/// @title MockSedaCore
/// @notice A simplified implementation of ISedaCore for testing purposes
/// @dev NOTE: This contract is designed for testing integration with the SEDA core interface.
///      It mocks core functionality for testing purposes and should never be used in production.
contract MockSedaCore is ISedaCore {
    uint256 private timeoutPeriod = 86400; // 1 day default

    mapping(bytes32 => SedaDataTypes.Request) private requests;
    mapping(bytes32 => SedaDataTypes.Result) private results;
    mapping(bytes32 => RequestDetails) private requestDetails;
    bytes32[] private pendingRequestIds;

    struct RequestDetails {
        address requestor;
        uint256 timestamp;
        uint256 requestFee;
        uint256 resultFee;
        uint256 batchFee;
    }

    // Control functions for testing
    function setTimeoutPeriod(uint256 _timeoutPeriod) external {
        timeoutPeriod = _timeoutPeriod;
        emit TimeoutPeriodUpdated(_timeoutPeriod);
    }

    // ISedaCore implementation
    function postRequest(SedaDataTypes.RequestInputs calldata inputs) external payable override returns (bytes32) {
        return postRequest(inputs, 0, 0, 0);
    }

    function postRequest(
        SedaDataTypes.RequestInputs calldata inputs,
        uint256 requestFee,
        uint256 resultFee,
        uint256 batchFee
    ) public payable override returns (bytes32) {
        // Value validation
        if (msg.value != requestFee + resultFee + batchFee) {
            revert InvalidFeeAmount(msg.value, requestFee + resultFee + batchFee);
        }

        // Create request ID
        bytes32 requestId = keccak256(
            bytes.concat(
                keccak256(bytes(SedaDataTypes.VERSION)),
                inputs.execProgramId,
                keccak256(inputs.execInputs),
                bytes8(inputs.execGasLimit),
                inputs.tallyProgramId,
                keccak256(inputs.tallyInputs),
                bytes8(inputs.tallyGasLimit),
                bytes2(inputs.replicationFactor),
                keccak256(inputs.consensusFilter),
                bytes16(inputs.gasPrice),
                keccak256(inputs.memo)
            )
        );

        // Store request
        requests[requestId] = SedaDataTypes.Request({
            version: SedaDataTypes.VERSION,
            execProgramId: inputs.execProgramId,
            execInputs: inputs.execInputs,
            execGasLimit: inputs.execGasLimit,
            tallyProgramId: inputs.tallyProgramId,
            tallyInputs: inputs.tallyInputs,
            tallyGasLimit: inputs.tallyGasLimit,
            replicationFactor: inputs.replicationFactor,
            consensusFilter: inputs.consensusFilter,
            gasPrice: inputs.gasPrice,
            memo: inputs.memo
        });

        // Store request details
        requestDetails[requestId] = RequestDetails({
            requestor: msg.sender,
            timestamp: block.timestamp,
            requestFee: requestFee,
            resultFee: resultFee,
            batchFee: batchFee
        });

        // Add to pending requests
        pendingRequestIds.push(requestId);

        // Emit fee events
        _emitFeeDistributedEvents(requestId, msg.sender, requestFee, resultFee, batchFee);

        return requestId;
    }

    function postResult(
        SedaDataTypes.Result calldata result,
        uint64,
        bytes32[] calldata
    ) external override returns (bytes32) {
        // For testing, we don't validate proof
        bytes32 resultId = keccak256(
            bytes.concat(
                keccak256(bytes(SedaDataTypes.VERSION)),
                result.drId,
                result.consensus ? bytes1(0x01) : bytes1(0x00),
                bytes1(result.exitCode),
                keccak256(result.result),
                bytes8(result.blockHeight),
                bytes8(result.blockTimestamp),
                bytes16(result.gasUsed),
                keccak256(result.paybackAddress),
                keccak256(result.sedaPayload)
            )
        );

        // Store result
        results[result.drId] = result;

        // Remove from pending requests
        _removePendingRequest(result.drId);

        // Emit fee distributed events for testing
        RequestDetails memory details = requestDetails[result.drId];
        _emitFeeDistributedEvents(result.drId, msg.sender, 0, details.resultFee, details.batchFee);

        // Clean up
        delete requestDetails[result.drId];

        return resultId;
    }

    function increaseFees(
        bytes32 requestId,
        uint256 additionalRequestFee,
        uint256 additionalResultFee,
        uint256 additionalBatchFee
    ) external payable override {
        uint256 totalAdditional = additionalRequestFee + additionalResultFee + additionalBatchFee;

        if (msg.value != totalAdditional) {
            revert InvalidFeeAmount(msg.value, totalAdditional);
        }

        if (requestDetails[requestId].timestamp == 0) {
            revert RequestNotFound(requestId);
        }

        RequestDetails storage details = requestDetails[requestId];

        // Update fees
        details.requestFee += additionalRequestFee;
        details.resultFee += additionalResultFee;
        details.batchFee += additionalBatchFee;

        // Emit events
        if (additionalRequestFee > 0) {
            emit FeeUpdated(requestId, details.requestFee, FeeType.REQUEST);
        }
        if (additionalResultFee > 0) {
            emit FeeUpdated(requestId, details.resultFee, FeeType.RESULT);
        }
        if (additionalBatchFee > 0) {
            emit FeeUpdated(requestId, details.batchFee, FeeType.BATCH);
        }
    }

    function getPendingRequests(
        uint256 offset,
        uint256 limit
    ) external view override returns (PendingRequest[] memory) {
        uint256 totalRequests = pendingRequestIds.length;
        if (offset >= totalRequests) {
            return new PendingRequest[](0);
        }

        uint256 actualLimit = (offset + limit > totalRequests) ? totalRequests - offset : limit;
        PendingRequest[] memory result = new PendingRequest[](actualLimit);

        for (uint256 i = 0; i < actualLimit; i++) {
            bytes32 requestId = pendingRequestIds[offset + i];
            RequestDetails memory details = requestDetails[requestId];

            result[i] = PendingRequest({
                id: requestId,
                request: requests[requestId],
                requestor: details.requestor,
                timestamp: details.timestamp,
                requestFee: details.requestFee,
                resultFee: details.resultFee,
                batchFee: details.batchFee
            });
        }

        return result;
    }

    function getFeeManager() external view override returns (address) {}

    function getSedaProver() external view override returns (address) {}

    // Helper functions
    function getRequest(bytes32 requestId) public view returns (SedaDataTypes.Request memory) {
        return requests[requestId];
    }

    function getResult(bytes32 requestId) public view returns (SedaDataTypes.Result memory) {
        return results[requestId];
    }

    function hasResult(bytes32 requestId) public view returns (bool) {
        return results[requestId].drId == requestId;
    }

    // Private helpers
    function _removePendingRequest(bytes32 requestId) private {
        for (uint256 i = 0; i < pendingRequestIds.length; i++) {
            if (pendingRequestIds[i] == requestId) {
                // Move the last element to this position and pop the array
                pendingRequestIds[i] = pendingRequestIds[pendingRequestIds.length - 1];
                pendingRequestIds.pop();
                break;
            }
        }
    }

    function _emitFeeDistributedEvents(
        bytes32 requestId,
        address recipient,
        uint256 requestFee,
        uint256 resultFee,
        uint256 batchFee
    ) private {
        if (requestFee > 0) {
            emit FeeDistributed(requestId, recipient, requestFee, FeeType.REQUEST);
        }
        if (resultFee > 0) {
            emit FeeDistributed(requestId, recipient, resultFee, FeeType.RESULT);
        }
        if (batchFee > 0) {
            emit FeeDistributed(requestId, recipient, batchFee, FeeType.BATCH);
        }
    }
}
