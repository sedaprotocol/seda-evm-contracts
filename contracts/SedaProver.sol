// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import "./SedaDataTypes.sol";

contract SedaProver is AccessControl {
    bytes32 public constant RELAYER = keccak256("RELAYER");
    bytes32 public constant ADMIN = keccak256("ADMIN");
    address public admin;
    address public pendingAdmin;
    uint16 internal maxReplicationFactor;

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
        require(
            inputs.replicationFactor > 0 && inputs.replicationFactor <= maxReplicationFactor,
            "Replication factor must be greater than zero and not exceed the allowed maximum"
        );
        bytes32 dr_id = generateDataRequestId(inputs);

        SedaDataTypes.DataRequest memory data_request = SedaDataTypes.DataRequest(
            SedaDataTypes.VERSION,
            inputs.execProgramId,
            inputs.execInputs,
            inputs.tallyBinaryId,
            inputs.tallyInputs,
            inputs.replicationFactor,
            inputs.consensusFilter,
            inputs.gasPrice,
            inputs.gasLimit,
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
        SedaDataTypes.DataRequest memory data_request = getDataRequest(inputs.drId);
        if (data_request.replicationFactor == 0) {
            revert DataRequestNotFound(inputs.drId);
        }

        // set the data result
        SedaDataTypes.DataResult memory data_result = SedaDataTypes.DataResult(
            inputs.version,
            inputs.drId,
            inputs.consensus,
            inputs.exitCode,
            inputs.result,
            inputs.blockHeight,
            inputs.gasUsed,
            inputs.paybackAddress,
            inputs.sedaPayload
        );
        data_request_id_to_result[inputs.drId] = data_result;

        // Remove the data request from the array
        uint256 index = data_request_pool[inputs.drId].indexInPool;
        bytes32 lastRequestId = data_request_pool_array[data_request_pool_array.length - 1];
        data_request_pool_array[index] = lastRequestId;
        data_request_pool[lastRequestId].indexInPool = index;
        data_request_pool_array.pop();

        delete data_request_pool[inputs.drId];
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
        if (data_result.drId == 0) {
            revert DataResultNotFound(id);
        }
        return data_result;
    }

    /// @notice Hashes arguments to a data request to produce a unique id
    function generateDataRequestId(SedaDataTypes.DataRequestInputs memory inputs) public pure returns (bytes32) {
        return keccak256(
            bytes.concat(
                keccak256(bytes(SedaDataTypes.VERSION)),
                inputs.execProgramId,
                keccak256(inputs.execInputs),
                inputs.tallyBinaryId,
                keccak256(inputs.tallyInputs),
                bytes2(inputs.replicationFactor),
                keccak256(inputs.consensusFilter),
                bytes16(inputs.gasPrice),
                bytes8(inputs.gasLimit),
                keccak256(inputs.memo)
            )
        );
    }

    /// @notice Validates a data result hash based on the inputs
    function generateDataResultId(SedaDataTypes.DataResult memory inputs) public pure returns (bytes32) {
        bytes32 reconstructed_id = keccak256(
            bytes.concat(
                keccak256(bytes(SedaDataTypes.VERSION)),
                inputs.drId,
                inputs.consensus ? bytes1(0x01) : bytes1(0x00),
                bytes1(inputs.exitCode),
                keccak256(inputs.result),
                bytes8(inputs.blockHeight),
                bytes8(inputs.gasUsed),
                keccak256(inputs.paybackAddress),
                keccak256(inputs.sedaPayload)
            )
        );
        return reconstructed_id;
    }
}
