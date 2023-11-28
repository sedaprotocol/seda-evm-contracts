// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

library SedaOracleLib {
    struct DataRequestInputs {
        /// Identifier of DR WASM binary
        bytes32 dr_binary_id;
        // /// Inputs for DR WASM binary
        bytes dr_inputs;
        /// Identifier of Tally WASM binary
        bytes32 tally_binary_id;
        /// Inputs for Tally WASM binary
        bytes tally_inputs;
        /// Amount of required DR executors
        uint16 replication_factor;
        /// Amount of SEDA tokens per gas unit
        uint128 gas_price;
        /// Maximum of gas units to be used by data request executors
        uint128 gas_limit;
        /// Maximum of gas units to be used in the tallying process
        uint128 tally_gas_limit;
    }

    struct DataRequest {
        /// Semantic Version
        string version;
        /// Identifier
        bytes32 id;
        // DR definition
        /// Identifier of DR WASM binary
        bytes32 dr_binary_id;
        /// Inputs for DR WASM binary
        bytes dr_inputs;
        /// Identifier of Tally WASM binary
        bytes32 tally_binary_id;
        /// Inputs for Tally WASM binary
        bytes tally_inputs;
        /// Amount of required DR executors
        uint16 replication_factor;
        /// Amount of SEDA tokens per gas unit
        uint128 gas_price;
        /// Maximum of gas units to be used by data request executors
        uint128 gas_limit;
        /// Maximum of gas units to be used in the tallying process
        uint128 tally_gas_limit;
        /// Public info attached to DR
        bytes32 memo;
        // Internal bookkeeping
        // Index within DR pool
        uint256 index_in_pool;
        /// Nonce of data request in this contract
        uint256 nonce;
    }

    struct DataResult {
        /// Semantic Version
        string version;
        /// Identifier
        bytes32 id;
        // DR Result
        /// Data Request Identifier
        bytes32 dr_id;
        /// Block Height at which data request was finalized
        uint128 block_height;
        /// Exit code of Tally WASM binary execution
        uint8 exit_code;
        /// Gas used by the complete data request execution
        uint128 gas_used;
        /// Result from Tally WASM binary execution
        bytes result;
        // Fields from Data Request Execution
        /// Payback address set by the relayer
        bytes payback_address;
        /// Payload set by SEDA Protocol (e.g. OEV-enabled data requests)
        bytes seda_payload;
    }

    string constant VERSION = "1.0.0";
}

contract SedaOracle {
    uint256 public data_request_count; // i.e. nonce
    mapping(bytes32 => SedaOracleLib.DataRequest) public data_request_pool;
    mapping(bytes32 => SedaOracleLib.DataResult) public data_request_id_to_result;
    bytes32[] public data_request_pool_array; // for iterating over the data request pool

    event DataRequestPosted(SedaOracleLib.DataRequest data_request, address caller);
    event DataResultPosted(SedaOracleLib.DataResult data_result, address caller);

    error DataRequestNotFound(bytes32 id);
    error DataResultInvalidHash(bytes32 expected, bytes32 actual);

    /// @notice Get a data request by id
    /// @dev Throws if the data request does not exist
    function getDataRequest(bytes32 id) public view returns (SedaOracleLib.DataRequest memory) {
        SedaOracleLib.DataRequest memory data_request = data_request_pool[id];
        require(data_request.id != 0, "Data request not found");
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
    function postDataRequest(SedaOracleLib.DataRequestInputs calldata inputs) public {
        data_request_count++;
        bytes32 memo = hashMemo(uint128(block.chainid), uint128(data_request_count));
        bytes32 id = hashDataRequest(inputs, memo);
        SedaOracleLib.DataRequest memory data_request = SedaOracleLib.DataRequest(
            SedaOracleLib.VERSION,
            id,
            inputs.dr_binary_id,
            inputs.dr_inputs,
            inputs.tally_binary_id,
            inputs.tally_inputs,
            inputs.replication_factor,
            inputs.gas_price,
            inputs.gas_limit,
            inputs.tally_gas_limit,
            memo,
            data_request_pool_array.length,
            data_request_count
        );
        data_request_pool[id] = data_request;
        data_request_pool_array.push(id);
        emit DataRequestPosted(data_request, msg.sender);
    }

    // @notice Post a result for a data request
    function postDataResult(SedaOracleLib.DataResult calldata inputs) public {
        // Validate the data result hash
        bytes32 reconstructed_id = hashDataResult(inputs);
        if (reconstructed_id != inputs.id) {
            revert DataResultInvalidHash(reconstructed_id, inputs.id);
        }

        // Require the data request to exist
        // TODO: do we need this?
        SedaOracleLib.DataRequest memory data_request = getDataRequest(inputs.dr_id);
        if (data_request.id == 0) {
            revert DataRequestNotFound(inputs.dr_id);
        }

        // set the data result
        SedaOracleLib.DataResult memory data_result = SedaOracleLib.DataResult(
            inputs.version,
            inputs.id,
            inputs.dr_id,
            inputs.block_height,
            inputs.exit_code,
            inputs.gas_used,
            inputs.result,
            inputs.payback_address,
            inputs.seda_payload
        );
        data_request_id_to_result[inputs.dr_id] = data_result;

        // Remove the data request from the array
        uint256 index = data_request_pool[inputs.dr_id].index_in_pool;
        bytes32 lastRequestId = data_request_pool_array[data_request_pool_array.length - 1];
        data_request_pool_array[index] = lastRequestId;
        data_request_pool[lastRequestId].index_in_pool = index;
        data_request_pool_array.pop();

        delete data_request_pool[inputs.dr_id];
        emit DataResultPosted(data_result, msg.sender);
    }

    /// @notice Hashes arguments to a data request to produce a unique id
    function hashDataRequest(SedaOracleLib.DataRequestInputs memory inputs, bytes32 memo)
        public
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                SedaOracleLib.VERSION,
                inputs.dr_binary_id,
                inputs.dr_inputs,
                inputs.gas_limit,
                inputs.gas_price,
                inputs.tally_gas_limit,
                memo,
                inputs.replication_factor,
                inputs.tally_binary_id,
                inputs.tally_inputs
            )
        );
    }

    /// @notice Hashes memo using chainId and nonce
    function hashMemo(uint128 chainId, uint128 nonce) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(chainId, nonce));
    }

    /// @notice Validates a data result hash based on the inputs
    function hashDataResult(SedaOracleLib.DataResult memory inputs) public pure returns (bytes32) {
        bytes32 resultHash = keccak256(abi.encodePacked(inputs.result));
        bytes32 sedaPayloadHash = keccak256(abi.encodePacked(inputs.seda_payload));
        bytes32 reconstructed_id = keccak256(
            abi.encodePacked(
                inputs.version,
                inputs.dr_id,
                inputs.block_height,
                inputs.exit_code,
                resultHash,
                inputs.gas_used,
                inputs.payback_address,
                sedaPayloadHash
            )
        );
        return reconstructed_id;
    }
}
