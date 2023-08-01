// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

library SedaOracleLib {
    struct DataRequest {
        uint128 dr_id;
        string value;
    }

    struct DataResult {
        uint128 dr_id;
        string value;
        string result;
    }
}

contract SedaOracle {
    uint128 public data_request_count;
    mapping(uint128 => SedaOracleLib.DataRequest) public data_request_pool;
    mapping(uint128 => SedaOracleLib.DataResult) public data_results;

    event DataRequestPosted(uint128 id, string value);
    event DataResultPosted(uint128 id, string value, string result);

    error DataRequestNotFound(uint128 id);

    /// @notice Get a data request by id
    /// @dev Throws if the data request does not exist
    function getDataRequest(uint128 id) public view returns (SedaOracleLib.DataRequest memory) {
        SedaOracleLib.DataRequest memory data_request = data_request_pool[id];
        if (data_request.dr_id == 0) {
            revert DataRequestNotFound(id);
        }
        return data_request;
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
        data_request_pool[data_request_count] = SedaOracleLib.DataRequest(data_request_count, value);
        emit DataRequestPosted(data_request_count, value);
    }

    /// @notice Post a result for a data request
    function postDataResult(uint128 dr_id, string calldata result) public {
        SedaOracleLib.DataRequest memory data_request = getDataRequest(dr_id);
        data_results[dr_id] = SedaOracleLib.DataResult(dr_id, data_request.value, result);
        delete data_request_pool[dr_id];
        emit DataResultPosted(dr_id, data_request.value, result);
    }
}
