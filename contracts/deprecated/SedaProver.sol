// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

// solhint-disable var-name-mixedcase
// solhint-disable gas-custom-errors

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/// @dev DEPRECATED: This contract is no longer in use and has been replaced by a newer version.
///      Please refer to the latest documentation for the current implementation.
library SedaDataTypes {
    string public constant VERSION = "0.0.1";

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
        /// Filter applied before tally execution
        bytes consensus_filter;
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
        /// Filter to be applied before tally execution
        bytes consensus_filter;
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
        /// True or false whether the reveal results are in consensus or not (≥ 66%)
        bool consensus;
        /// Exit code of Tally WASM binary execution
        uint8 exit_code;
        /// Result from Tally WASM binary execution
        bytes result;
        /// Block Height at which data request was finalized
        uint64 block_height;
        /// Gas used by the complete data request execution
        uint128 gas_used;
        // Fields from Data Request Execution
        /// Payback address set by the relayer
        bytes payback_address;
        /// Payload set by SEDA Protocol (e.g. OEV-enabled data requests)
        bytes seda_payload;
    }
}

/// @dev DEPRECATED: This contract is no longer in use and has been replaced by a newer version.
///      Please refer to the latest documentation for the current implementation.
contract SedaProver is AccessControl {
    bytes32 public constant RELAYER = keccak256("RELAYER");
    bytes32 public constant ADMIN = keccak256("ADMIN");
    address public admin;
    address public pendingAdmin;
    uint16 public maxReplicationFactor;

    // DR ID => DataRequest
    mapping(bytes32 => SedaDataTypes.DataRequest) public data_request_pool;
    // DR ID => DataResult
    mapping(bytes32 => SedaDataTypes.DataResult) public data_request_id_to_result;
    bytes32[] public data_request_pool_array; // for iterating over the data request pool

    event DataRequestPosted(SedaDataTypes.DataRequest data_request, address caller);
    event DataResultPosted(SedaDataTypes.DataResult data_result, address caller);

    error DataRequestNotFound(bytes32 id);
    error DataResultNotFound(bytes32 id);
    error NotAdmin();
    error NotRelayer();
    error NotPendingAdmin();
    error DataRequestAlreadyPosted(bytes32 id);
    
    /// @param _admin The address of the initial admin of this contract
    /// @param _relayers The addresses of the initial relayers
    constructor(address _admin, address[] memory _relayers, uint16 _maxReplicationFactor) {
        _grantRole(ADMIN, _admin);
        admin = _admin;
        _setRoleAdmin(RELAYER, ADMIN);
        for (uint256 i = 0; i < _relayers.length; ++i) {
            _grantRole(RELAYER, _relayers[i]);
        }
        maxReplicationFactor = _maxReplicationFactor;
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

    /// @notice Post a data request
    function postDataRequest(SedaDataTypes.DataRequestInputs calldata inputs) public returns (bytes32) {
        //solhint-disable-next-line reason-string
        require(
            inputs.replication_factor > 0 && inputs.replication_factor <= maxReplicationFactor,
            "Replication factor must be greater than zero and not exceed the allowed maximum"
        );
        bytes32 dr_id = generateDataRequestId(inputs);

        if (data_request_pool[dr_id].replication_factor != 0) {
            revert DataRequestAlreadyPosted(dr_id);
        }

        SedaDataTypes.DataRequest memory data_request = SedaDataTypes.DataRequest(
            SedaDataTypes.VERSION,
            inputs.dr_binary_id,
            inputs.dr_inputs,
            inputs.tally_binary_id,
            inputs.tally_inputs,
            inputs.replication_factor,
            inputs.consensus_filter,
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
    function postDataResult(SedaDataTypes.DataResult calldata inputs) public onlyRelayer {
        // Require the data request to exist
        // TODO: do we need this?
        SedaDataTypes.DataRequest memory data_request = getDataRequest(inputs.dr_id);
        if (data_request.replication_factor == 0) {
            revert DataRequestNotFound(inputs.dr_id);
        }

        // set the data result
        SedaDataTypes.DataResult memory data_result = SedaDataTypes.DataResult(
            inputs.version,
            inputs.dr_id,
            inputs.consensus,
            inputs.exit_code,
            inputs.result,
            inputs.block_height,
            inputs.gas_used,
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

    /// @notice Get a data request by id
    /// @dev Throws if the data request does not exist
    function getDataRequest(bytes32 id) public view returns (SedaDataTypes.DataRequest memory) {
        SedaDataTypes.DataRequest memory data_request = data_request_pool[id];
        if (bytes(data_request.version).length == 0) {
            revert DataRequestNotFound(id);
        }
        return data_request;
    }

    /// @notice Get an array of data requests starting from a position, up to a limit
    /// @dev Returns valid data requests
    function getDataRequestsFromPool(
        uint128 position,
        uint128 limit
    )
        public
        view
        returns (SedaDataTypes.DataRequest[] memory)
    {
        if (position > data_request_pool_array.length) {
          return new SedaDataTypes.DataRequest[](0);
        }
        // Compute the actual limit, taking into account the array size
        uint128 actualLimit = (position + limit > data_request_pool_array.length)
            ? (uint128(data_request_pool_array.length) - position)
            : limit;
        SedaDataTypes.DataRequest[] memory data_requests = new SedaDataTypes.DataRequest[](actualLimit);

        for (uint128 i = 0; i < actualLimit; ++i) {
            data_requests[i] = data_request_pool[data_request_pool_array[position + i]];
        }

        return data_requests;
    }

    /// @notice Get a data result by request id
    /// @dev Throws if the data request does not exist
    function getDataResult(bytes32 id) public view returns (SedaDataTypes.DataResult memory) {
        SedaDataTypes.DataResult memory data_result = data_request_id_to_result[id];
        if (data_result.dr_id == 0) {
            revert DataResultNotFound(id);
        }
        return data_result;
    }

    /// @notice Hashes arguments to a data request to produce a unique id
    function generateDataRequestId(SedaDataTypes.DataRequestInputs memory inputs) public pure returns (bytes32) {
        return keccak256(
            bytes.concat(
                keccak256(bytes(SedaDataTypes.VERSION)),
                inputs.dr_binary_id,
                keccak256(inputs.dr_inputs),
                inputs.tally_binary_id,
                keccak256(inputs.tally_inputs),
                bytes2(inputs.replication_factor),
                keccak256(inputs.consensus_filter),
                bytes16(inputs.gas_price),
                bytes16(inputs.gas_limit),
                keccak256(inputs.memo)
            )
        );
    }

    /// @notice Validates a data result hash based on the inputs
    function generateDataResultId(SedaDataTypes.DataResult memory inputs) public pure returns (bytes32) {
        bytes32 reconstructed_id = keccak256(
            bytes.concat(
                keccak256(bytes(SedaDataTypes.VERSION)),
                inputs.dr_id,
                inputs.consensus ? bytes1(0x01) : bytes1(0x00),
                bytes1(inputs.exit_code),
                keccak256(inputs.result),
                bytes8(inputs.block_height),
                bytes16(inputs.gas_used),
                keccak256(inputs.payback_address),
                keccak256(inputs.seda_payload)
            )
        );
        return reconstructed_id;
    }
}
