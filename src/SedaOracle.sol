// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

library SedaOracleLib {
    struct DataRequest {
        bytes32 dr_id;
        uint256 nonce;
        string value;
    }

    struct DataResult {
        bytes32 dr_id;
        uint256 nonce;
        string value;
        string result;
    }
}

contract SedaOracle {
    uint256 public data_request_count; // i.e. nonce
    mapping(bytes32 => SedaOracleLib.DataRequest) public data_request_pool;
    mapping(uint256 => bytes32) public data_requests_by_nonce;
    mapping(bytes32 => SedaOracleLib.DataResult) public data_results;

    event DataRequestPosted(bytes32 id, string value, uint256 nonce);
    event DataResultPosted(bytes32 id, string value, string result);

    error DataRequestNotFound(bytes32 id);

    /// @notice Get a data request by id
    /// @dev Throws if the data request does not exist
    function getDataRequest(bytes32 id) public view returns (SedaOracleLib.DataRequest memory) {
        SedaOracleLib.DataRequest memory data_request = data_request_pool[id];
        if (data_request.dr_id == 0) {
            revert DataRequestNotFound(id);
        }
        return data_request;
    }

    /// @notice Get a data request by nonce / data request count
    /// @dev Throws if the data request does not exist
    function getDataRequest(uint128 nonce) public view returns (SedaOracleLib.DataRequest memory) {
        bytes32 dr_id = data_requests_by_nonce[nonce];
        return getDataRequest(dr_id);
    }

    /// @notice Get an array of data requests starting from a position, up to a limit
    function getDataRequests(uint128 position, uint128 limit)
        public
        view
        returns (SedaOracleLib.DataRequest[] memory)
    {
        // starting from position, iterate forwards until we reach the limit or the end of the data requests
        SedaOracleLib.DataRequest[] memory data_requests = new SedaOracleLib.DataRequest[](limit);
        uint128 count = 0;
        for (uint128 i = position; i <= data_request_count; i++) {
            if (count == limit) {
                break;
            }
            data_requests[count] = getDataRequest(i);
            count++;
        }
        return data_requests;
    }

    /// @notice Post a data request
    function postDataRequest(string calldata value) public {
        data_request_count++;
        bytes32 dr_id = keccak256(abi.encodePacked(data_request_count, value, block.chainid));
        data_request_pool[dr_id] = SedaOracleLib.DataRequest(dr_id, data_request_count, value);
        data_requests_by_nonce[data_request_count] = dr_id;

        emit DataRequestPosted(dr_id, value, data_request_count);
    }

    /// @notice Post a result for a data request
    function postDataResult(bytes32 dr_id, string calldata result) public {
        SedaOracleLib.DataRequest memory data_request = getDataRequest(dr_id);
        data_results[dr_id] = SedaOracleLib.DataResult(dr_id, data_request.nonce, data_request.value, result);
        delete data_request_pool[dr_id];
        emit DataResultPosted(dr_id, data_request.value, result);
    }
}
