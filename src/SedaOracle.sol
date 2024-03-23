// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

library SedaOracleLib {
    struct DataRequestInputs {
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
        /// Public info attached to DR
        bytes memo;
    }

    struct DataRequest {
        /// Semantic Version
        string version;
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
        /// Public info attached to DR
        bytes memo;
        // Internal bookkeeping
        // Index within DR pool
        uint256 index_in_pool;
    }

    struct DataResult {
        /// Semantic Version
        string version;
        /// Data Request Identifier
        bytes32 dr_id;
        /// Exit code of Tally WASM binary execution
        uint8 exit_code;
        /// Result from Tally WASM binary execution
        bytes result;
        /// Gas used by the complete data request execution
        uint128 gas_used;
        /// Block Height at which data request was finalized
        uint128 block_height;
        // Fields from Data Request Execution
        /// Payback address set by the relayer
        bytes payback_address;
        /// Payload set by SEDA Protocol (e.g. OEV-enabled data requests)
        bytes seda_payload;
    }

    string constant VERSION = "1.0.0";
}

contract SedaOracle is AccessControl {
    bytes32 public constant RELAYER = keccak256("RELAYER");
    bytes32 public constant ADMIN = keccak256("ADMIN");
    address public admin;
    address public pendingAdmin;

    mapping(bytes32 => SedaOracleLib.DataRequest) public data_request_pool;
    // DR ID => DataResult
    mapping(bytes32 => SedaOracleLib.DataResult) public data_request_id_to_result;
    bytes32[] public data_request_pool_array; // for iterating over the data request pool

    event DataRequestPosted(SedaOracleLib.DataRequest data_request, address caller);
    event DataResultPosted(SedaOracleLib.DataResult data_result, address caller);

    error DataRequestNotFound(bytes32 id);
    error DataResultInvalidHash(bytes32 expected, bytes32 actual);
    error NotAdmin();
    error NotRelayer();
    error NotPendingAdmin();

    /// @param _admin The address of the initial admin of this contract
    /// @param _relayers The addresses of the initial relayers
    constructor(address _admin, address[] memory _relayers) {
        _grantRole(ADMIN, _admin);
        admin = _admin;
        _setRoleAdmin(RELAYER, ADMIN);
        for (uint256 i = 0; i < _relayers.length; ++i) {
            _grantRole(RELAYER, _relayers[i]);
        }
    }

    /// @notice Check if the caller has the admin role
    modifier onlyAdmin() {
        if (!hasRole(ADMIN, msg.sender)) {
            revert NotAdmin();
        }
        _;
    }

    /// @notice Check if the caller has the pending admin role
    modifier onlyPendingAdmin() {
        if (msg.sender != pendingAdmin) {
            revert NotPendingAdmin();
        }
        _;
    }

    /// @notice Check if the caller has the relayer role
    modifier onlyRelayer() {
        if (!hasRole(RELAYER, msg.sender)) {
            revert NotRelayer();
        }
        _;
    }

    /// @notice Add a relayer
    /// @param account The address of the relayer to add
    function addRelayer(address account) public onlyAdmin {
        grantRole(RELAYER, account);
    }

    /// @notice Remove a relayer
    /// @param account The address of the relayer to remove
    function removeRelayer(address account) public onlyAdmin {
        revokeRole(RELAYER, account);
    }

    /// @notice Transfer the admin role to a new address
    /// @param newOwner The address of the new admin
    /// @dev The new owner must accept the ownership
    function transferOwnership(address newOwner) public onlyAdmin {
        pendingAdmin = newOwner;
    }

    /// @notice Accept the ownership of the contract
    /// @dev The caller must be the pending admin
    function acceptOwnership() public onlyPendingAdmin {
        _revokeRole(ADMIN, admin); // Remove ADMIN role from old admin
        _grantRole(ADMIN, msg.sender); // Assign ADMIN role to new admin
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    /// @notice Get a data request by id
    /// @dev Throws if the data request does not exist
    function getDataRequest(bytes32 id) public view returns (SedaOracleLib.DataRequest memory) {
        SedaOracleLib.DataRequest memory data_request = data_request_pool[id];
        if (data_request.id == 0) {
            revert DataRequestNotFound(id);
        }
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
    function postDataRequest(SedaOracleLib.DataRequestInputs calldata inputs) public returns (bytes32) {
        bytes32 dr_id = hashDataRequest(inputs);

        SedaOracleLib.DataRequest memory data_request = SedaOracleLib.DataRequest(
            SedaOracleLib.VERSION,
            inputs.dr_binary_id,
            inputs.dr_inputs,
            inputs.tally_binary_id,
            inputs.tally_inputs,
            inputs.replication_factor,
            inputs.gas_price,
            inputs.gas_limit,
            inputs.memo,
            data_request_pool_array.length
        );

        data_request_pool[dr_id] = data_request;
        data_request_pool_array.push(dr_id);

        emit DataRequestPosted(data_request, msg.sender);

        // Returns the dr_id, this allows the user to retrieve the result once its resolved
        return dr_id;
    }

    // @notice Post a result for a data request
    function postDataResult(SedaOracleLib.DataResult calldata inputs) public onlyRelayer {
        // Require the data request to exist
        // TODO: do we need this?
        SedaOracleLib.DataRequest memory data_request = getDataRequest(inputs.dr_id);
        if (data_request.id == 0) {
            revert DataRequestNotFound(inputs.dr_id);
        }

        // set the data result
        SedaOracleLib.DataResult memory data_result = SedaOracleLib.DataResult(
            inputs.version,
            inputs.dr_id,
            inputs.exit_code,
            inputs.result,
            inputs.gas_used,
            inputs.block_height,
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
    function hashDataRequest(SedaOracleLib.DataRequestInputs memory inputs) public pure returns (bytes32) {
        return keccak256(
            bytes.concat(
                keccak256(bytes(SedaOracleLib.VERSION)),
                inputs.dr_binary_id,
                keccak256(inputs.dr_inputs),
                inputs.tally_binary_id,
                keccak256(inputs.tally_inputs),
                bytes2(inputs.replication_factor),
                bytes16(inputs.gas_price),
                bytes16(inputs.gas_limit),
                keccak256(inputs.memo)
            )
        );
    }

    /// @notice Validates a data result hash based on the inputs
    function hashDataResult(SedaOracleLib.DataResult memory inputs) public pure returns (bytes32) {
        bytes32 reconstructed_id = keccak256(
            bytes.concat(
                bytes(inputs.version),
                inputs.dr_id,
                bytes16(inputs.block_height),
                bytes1(inputs.exit_code),
                keccak256(inputs.result),
                bytes16(inputs.gas_used),
                inputs.payback_address,
                keccak256(inputs.seda_payload)
            )
        );
        return reconstructed_id;
    }
}
