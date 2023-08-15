// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

library SedaOracleLib {
    struct DataRequest {
        bytes32 dr_id;
        uint256 nonce;
        string value;
        uint256 index_in_pool;
        bytes wasm_id;
        bytes[][] wasm_args;
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
    mapping(bytes32 => SedaOracleLib.DataResult) public data_results;
    bytes32[] public data_request_pool_array; // for iterating over the data request pool

    event DataRequestPosted(bytes32 id, string value, uint256 nonce, address caller);
    event DataResultPosted(bytes32 id, string value, string result, address caller);

    error DataRequestNotFound(bytes32 id);

    /// @notice Get a data request by id
    /// @dev Throws if the data request does not exist
    function getDataRequest(bytes32 id) public view returns (SedaOracleLib.DataRequest memory) {
        SedaOracleLib.DataRequest memory data_request = data_request_pool[id];
        require(data_request.dr_id != 0, "Data request not found");
        return data_request;
    }

    /// @notice Get an array of data requests starting from a position, up to a limit
    /// @dev Returns valid data requests
    function getDataRequestsFromPool(uint128 position, uint128 limit)
        public
        view
        returns (SedaOracleLib.DataRequest[] memory)
    {
        // Compute the actual limit, taking into account the array size
        uint128 actualLimit = (position + limit > data_request_pool_array.length)
            ? (uint128(data_request_pool_array.length) - position)
            : limit;
        SedaOracleLib.DataRequest[] memory data_requests = new SedaOracleLib.DataRequest[](actualLimit);

        for (uint128 i = 0; i < actualLimit; ++i) {
            data_requests[i] = data_request_pool[data_request_pool_array[position + i]];
        }

        return data_requests;
    }

    /// @notice Post a data request
    function postDataRequest(string calldata value, bytes calldata wasmId, bytes[][] calldata wasmArgs) public {
        data_request_count++;
        bytes32 dr_id =
            keccak256(abi.encodePacked(data_request_count, value, block.chainid, wasmId, abi.encode(wasmArgs)));
        data_request_pool[dr_id] = SedaOracleLib.DataRequest(
            dr_id, data_request_count, value, data_request_pool_array.length, wasmId, wasmArgs
        );
        data_request_pool_array.push(dr_id);
        emit DataRequestPosted(dr_id, value, data_request_count, msg.sender);
    }

    /// @notice Post a result for a data request
    function postDataResult(bytes32 dr_id, string calldata result) public {
        SedaOracleLib.DataRequest memory data_request = getDataRequest(dr_id);
        data_results[dr_id] = SedaOracleLib.DataResult(dr_id, data_request.nonce, data_request.value, result);

        // Remove the data request from the array
        uint256 index = data_request_pool[dr_id].index_in_pool;
        bytes32 lastRequestId = data_request_pool_array[data_request_pool_array.length - 1];
        data_request_pool_array[index] = lastRequestId;
        data_request_pool[lastRequestId].index_in_pool = index;
        data_request_pool_array.pop();

        delete data_request_pool[dr_id];
        emit DataResultPosted(dr_id, data_request.value, result, msg.sender);
    }
}
