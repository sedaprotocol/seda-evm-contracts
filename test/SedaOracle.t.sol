// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "forge-std/Test.sol";
import "../src/SedaOracle.sol";

contract SedaOracleTest is Test {
    SedaOracle public oracle;
    address public constant ADMIN = address(1);
    address public constant ALICE = address(2);
    address public constant RELAYER = address(3);

    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

    function setUp() public {
        address[] memory initialRelayers = new address[](1);
        initialRelayers[0] = RELAYER;
        oracle = new SedaOracle(ADMIN, initialRelayers);
    }

    function hashString(string memory input) public pure returns (bytes32) {
        bytes32 hash = keccak256(abi.encodePacked(input));
        return hash;
    }

    function _getDataRequestInputs() private pure returns (SedaOracleLib.DataRequestInputs memory) {
        return SedaOracleLib.DataRequestInputs({
            dr_binary_id: hashString("dr_binary_id"),
            dr_inputs: "dr_inputs",
            tally_binary_id: hashString("tally_binary_id"),
            tally_inputs: "tally_inputs",
            replication_factor: 123,
            gas_price: 456,
            gas_limit: 789,
            tally_gas_limit: 101112
        });
    }

    function _getDataResultsInputs() private view returns (SedaOracleLib.DataResult memory) {
        SedaOracleLib.DataRequestInputs memory data_request_inputs = _getDataRequestInputs();
        uint128 chainId = 31337;
        uint128 nonce = 1;
        bytes32 memo = oracle.hashMemo(chainId, nonce);
        bytes32 dr_id = oracle.hashDataRequest(data_request_inputs, memo);
        uint128 block_height = 1;
        uint8 exit_code = 2;
        uint128 gas_used = 3;
        bytes memory result = "result";
        bytes memory payback_address = "payback_address";
        bytes memory seda_payload = "seda_payload";
        bytes32 resultHash = keccak256(abi.encode(result));
        bytes32 sedaPayloadHash = keccak256(abi.encode(seda_payload));
        bytes32 id = keccak256(
            abi.encode(
                SedaOracleLib.VERSION,
                dr_id,
                block_height,
                exit_code,
                resultHash,
                gas_used,
                payback_address,
                sedaPayloadHash
            )
        );

        return SedaOracleLib.DataResult({
            version: SedaOracleLib.VERSION,
            id: id,
            dr_id: dr_id,
            block_height: block_height,
            exit_code: exit_code,
            gas_used: gas_used,
            result: result,
            payback_address: payback_address,
            seda_payload: seda_payload
        });
    }

    function testPostDataRequest() public {
        assertEq(oracle.data_request_count(), 0);
        oracle.postDataRequest(_getDataRequestInputs());
        assertEq(oracle.data_request_count(), 1);

        bytes32 dr_id = oracle.getDataRequestsFromPool(0, 1)[0].id;

        (, bytes32 expected_id,,,,,,,,,,,) = oracle.data_request_pool(dr_id);
        assertEq(expected_id, dr_id);
    }

    function testPostDataResult() public {
        vm.startPrank(RELAYER);

        // post a data request and assert the associated result is non-existent
        oracle.postDataRequest(_getDataRequestInputs());
        (, bytes32 dr_id,,,,,,,,,,,) = oracle.data_request_pool(oracle.getDataRequestsFromPool(0, 1)[0].id);
        (, bytes32 res_id_nonexistent,,,,,,,) = oracle.data_request_id_to_result(dr_id);
        assertEq(res_id_nonexistent, 0);

        // post the data result and assert the dr_id is correct
        oracle.postDataResult(_getDataResultsInputs());
        (,, bytes32 res_dr_id,,,,,,) = oracle.data_request_id_to_result(dr_id);
        assertEq(res_dr_id, dr_id);

        // assert the pool is empty
        assert(oracle.getDataRequestsFromPool(0, 1).length == 0);
    }

    function testGetDataRequestsFromPool() public {
        vm.startPrank(RELAYER);

        oracle.postDataRequest(_getDataRequestInputs());
        oracle.postDataRequest(_getDataRequestInputs());
        oracle.postDataRequest(_getDataRequestInputs());

        // fetch all three data requests with a limit of 3
        SedaOracleLib.DataRequest[] memory data_requests = oracle.getDataRequestsFromPool(0, 3);
        assertEq(data_requests.length, 3);

        // fetch data requests with a limit of 2
        SedaOracleLib.DataRequest[] memory data_requests_3 = oracle.getDataRequestsFromPool(0, 2);
        assertEq(data_requests_3.length, 2);

        // fetch two data requests with a limit of 3 (skipping the first)
        SedaOracleLib.DataRequest[] memory data_requests_2 = oracle.getDataRequestsFromPool(1, 3);
        assertEq(data_requests_2.length, 2);

        // fetch a single data request
        SedaOracleLib.DataRequest[] memory data_requests_4 = oracle.getDataRequestsFromPool(0, 1);
        assertEq(data_requests_4.length, 1);

        // fetch two data requests starting from the second index
        SedaOracleLib.DataRequest[] memory data_requests_5 = oracle.getDataRequestsFromPool(1, 2);
        assertEq(data_requests_5.length, 2);

        // post a data result for dr 1
        oracle.postDataResult(_getDataResultsInputs());

        // should only return 2 data requests now, even with limit of 3
        SedaOracleLib.DataRequest[] memory data_requests_6 = oracle.getDataRequestsFromPool(0, 3);
        assertEq(data_requests_6.length, 2);

        // if fetching from position 1, it should return dr 2 since dr 1 has been removed
        SedaOracleLib.DataRequest[] memory data_requests_7 = oracle.getDataRequestsFromPool(1, 1);
        assertEq(data_requests_7[0].nonce, 2);

        // limit can be larger than array length
        oracle.getDataRequestsFromPool(0, 10);

        // throw if position is greater than array length
        vm.expectRevert();
        oracle.getDataRequestsFromPool(3, 1);
    }

    function testHash() public {
        // format memo and calculate memo hash
        uint128 chainId = 31337;
        uint128 nonce = 1;
        bytes32 memo = oracle.hashMemo(chainId, nonce);
        // format data request inputs
        SedaOracleLib.DataRequestInputs memory inputs = SedaOracleLib.DataRequestInputs({
            dr_binary_id: hashString("dr_binary_id"),
            dr_inputs: "dr_inputs",
            tally_binary_id: hashString("tally_binary_id"),
            tally_inputs: "tally_inputs",
            replication_factor: 3,
            gas_price: 10,
            gas_limit: 10,
            tally_gas_limit: 10
        });

        // calculate data request hash
        bytes32 test_hash = oracle.hashDataRequest(inputs, memo);

        emit log_named_bytes32("test_hash", test_hash);
    }

    function testOnlyRelayerCanPostDataResult() public {
        vm.startPrank(ADMIN);

        oracle.postDataRequest(_getDataRequestInputs());

        // ADMIN cannot post a data result
        SedaOracleLib.DataResult memory dataResultInputs = _getDataResultsInputs();
        vm.expectRevert(SedaOracle.NotRelayer.selector);
        oracle.postDataResult(dataResultInputs);

        // relayer can post a data result
        vm.startPrank(RELAYER);
        oracle.postDataResult(dataResultInputs);
    }

    function testAddRemoveRelayer() public {
        // only admin can add relayer
        vm.startPrank(ALICE);
        vm.expectRevert(SedaOracle.NotAdmin.selector);
        oracle.addRelayer(ALICE);

        // add relayer
        vm.startPrank(ADMIN);
        oracle.addRelayer(ALICE);
        assert(oracle.hasRole(oracle.RELAYER(), ALICE));

        // only admin can remove relayer
        vm.startPrank(ALICE);
        vm.expectRevert(SedaOracle.NotAdmin.selector);
        oracle.removeRelayer(ALICE);

        // remove relayer
        vm.startPrank(ADMIN);
        oracle.removeRelayer(RELAYER);
        assert(!oracle.hasRole(oracle.RELAYER(), RELAYER));
    }

    function testAdminTransfer() public {
        bytes32 adminRole = oracle.ADMIN();
        // initial assertions
        assertEq(oracle.pendingAdmin(), address(0));
        assert(oracle.hasRole(adminRole, ADMIN));
        assert(!oracle.hasRole(adminRole, ALICE));

        // only admin can transfer admin role
        vm.startPrank(ALICE);
        vm.expectRevert(SedaOracle.NotAdmin.selector);
        oracle.transferOwnership(ALICE);

        // admin cannot directly grant admin role to another address
        vm.startPrank(ADMIN);
        vm.expectRevert();
        oracle.grantRole(adminRole, ALICE);

        // transfer admin role
        oracle.transferOwnership(ALICE);

        // assert pending admin is ALICE and admin is still ADMIN
        assertEq(oracle.pendingAdmin(), ALICE);
        assert(oracle.hasRole(adminRole, ADMIN));
        assert(!oracle.hasRole(adminRole, ALICE));

        // only alice can claim admin role
        vm.startPrank(RELAYER);
        vm.expectRevert(SedaOracle.NotPendingAdmin.selector);
        oracle.acceptOwnership();

        // claim admin role
        vm.startPrank(ALICE);
        oracle.acceptOwnership();

        // assert admin is now ALICE and old admin is no longer admin
        assertEq(oracle.pendingAdmin(), address(0));
        assert(!oracle.hasRole(adminRole, ADMIN));
        assert(oracle.hasRole(adminRole, ALICE));

        // old admin can no longer add relayers
        vm.startPrank(ADMIN);
        vm.expectRevert(SedaOracle.NotAdmin.selector);
        oracle.addRelayer(RELAYER);

        // new admin can add relayers
        vm.startPrank(ALICE);
        oracle.addRelayer(RELAYER);
    }
}
