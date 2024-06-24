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

    /// Standard data request inputs, memo can be used to generate different Dr hashes
    function _getDataRequestInputs(bytes memory memo) private pure returns (SedaOracleLib.DataRequestInputs memory) {
        return SedaOracleLib.DataRequestInputs({
            dr_binary_id: hashString("dr_binary_id"),
            dr_inputs: "dr_inputs",
            tally_binary_id: hashString("tally_binary_id"),
            tally_inputs: "tally_inputs",
            replication_factor: 123,
            consensus_filter: "0x00",
            gas_price: 456,
            gas_limit: 789,
            memo: memo
        });
    }

    function _getDataResultsInputs(bytes memory memo) private view returns (SedaOracleLib.DataResult memory) {
        SedaOracleLib.DataRequestInputs memory data_request_inputs = _getDataRequestInputs(memo);
        bytes32 dr_id = oracle.generateDataRequestId(data_request_inputs);
        uint64 block_height = 1;
        bool consensus = true;
        uint8 exit_code = 2;
        uint128 gas_used = 3;

        bytes memory result = "result";
        bytes memory payback_address = "payback_address";
        bytes memory seda_payload = "seda_payload";

        return SedaOracleLib.DataResult({
            version: SedaOracleLib.VERSION,
            dr_id: dr_id,
            block_height: block_height,
            consensus: consensus,
            exit_code: exit_code,
            gas_used: gas_used,
            result: result,
            payback_address: payback_address,
            seda_payload: seda_payload
        });
    }

    function testPostDataRequest() public {
        assertEq(oracle.getDataRequestsFromPool(0, 10).length, 0);
        SedaOracleLib.DataRequestInputs memory inputs = _getDataRequestInputs("0");
        bytes32 expected_dr_id = oracle.generateDataRequestId(inputs);
        oracle.postDataRequest(inputs);

        assertEq(oracle.getDataRequestsFromPool(0, 10).length, 1);

        SedaOracleLib.DataRequest memory received_dr = oracle.getDataRequestsFromPool(0, 1)[0];

        bytes32 received_dr_id = oracle.generateDataRequestId(
            SedaOracleLib.DataRequestInputs({
                dr_binary_id: received_dr.dr_binary_id,
                dr_inputs: received_dr.dr_inputs,
                tally_binary_id: received_dr.tally_binary_id,
                tally_inputs: received_dr.tally_inputs,
                replication_factor: received_dr.replication_factor,
                consensus_filter: received_dr.consensus_filter,
                gas_price: received_dr.gas_price,
                gas_limit: received_dr.gas_limit,
                memo: received_dr.memo
            })
        );

        assertEq(expected_dr_id, received_dr_id);
    }

    function testPostDataResult() public {
        vm.startPrank(RELAYER);

        // post a data request and assert the associated result is non-existent
        SedaOracleLib.DataRequestInputs memory inputs = _getDataRequestInputs("0");
        oracle.postDataRequest(inputs);

        bytes32 dr_id = oracle.generateDataRequestId(inputs);
        (, bytes32 res_id_nonexistent,,,,,,,) = oracle.data_request_id_to_result(dr_id);
        assertEq(res_id_nonexistent, 0);

        // post the data result and assert the dr_id is correct
        oracle.postDataResult(_getDataResultsInputs("0"));
        (, bytes32 res_dr_id,,,,,,,) = oracle.data_request_id_to_result(dr_id);
        assertEq(res_dr_id, dr_id);

        // assert the pool is empty
        assert(oracle.getDataRequestsFromPool(0, 1).length == 0);
    }

    function testGetDataRequestsFromPool() public {
        vm.startPrank(RELAYER);

        oracle.postDataRequest(_getDataRequestInputs("1"));
        oracle.postDataRequest(_getDataRequestInputs("2"));
        oracle.postDataRequest(_getDataRequestInputs("3"));

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
        oracle.postDataResult(_getDataResultsInputs("1"));

        // should only return 2 data requests now, even with limit of 3
        SedaOracleLib.DataRequest[] memory data_requests_6 = oracle.getDataRequestsFromPool(0, 3);
        assertEq(data_requests_6.length, 2);

        // if fetching from position 1, it should return dr 2 since dr 1 has been removed
        SedaOracleLib.DataRequest[] memory data_requests_7 = oracle.getDataRequestsFromPool(1, 1);
        assertEq(data_requests_7[0].memo, bytes("2"));

        // limit can be larger than array length
        oracle.getDataRequestsFromPool(0, 10);

        // throw if position is greater than array length
        vm.expectRevert();
        oracle.getDataRequestsFromPool(3, 1);
    }

    function testOnlyRelayerCanPostDataResult() public {
        vm.startPrank(ADMIN);

        oracle.postDataRequest(_getDataRequestInputs("0"));

        // ADMIN cannot post a data result
        SedaOracleLib.DataResult memory dataResultInputs = _getDataResultsInputs("0");
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

    function testGetDataRequest() public {
        vm.startPrank(RELAYER);

        bytes memory memo = "123";
        SedaOracleLib.DataRequestInputs memory inputs = _getDataRequestInputs(memo);
        bytes32 dr_id = oracle.postDataRequest(inputs);

        SedaOracleLib.DataRequest memory data_request = oracle.getDataRequest(dr_id);
        assertEq(data_request.memo, memo);

        bytes32 non_existent_dr_id = 0xef3cf2abe8e1bd9bdb92eff32deb42e0152cb894a395d20238a4c96458efccfd;
        vm.expectRevert(abi.encodeWithSelector(SedaOracle.DataRequestNotFound.selector, non_existent_dr_id));
        oracle.getDataRequest(non_existent_dr_id);
    }

    function testGetDataResult() public {
        vm.startPrank(RELAYER);

        bytes memory memo = "123";
        SedaOracleLib.DataRequestInputs memory inputs = _getDataRequestInputs(memo);
        bytes32 dr_id = oracle.postDataRequest(inputs);

        oracle.postDataResult(_getDataResultsInputs("123"));

        SedaOracleLib.DataResult memory data_result = oracle.getDataResult(dr_id);
        assertEq(data_result.result, "result");

        bytes32 non_existent_dr_id = 0xef3cf2abe8e1bd9bdb92eff32deb42e0152cb894a395d20238a4c96458efccfd;
        vm.expectRevert(abi.encodeWithSelector(SedaOracle.DataResultNotFound.selector, non_existent_dr_id));
        oracle.getDataResult(non_existent_dr_id);
    }

    // Test function to check if DR_ID still matches with other components
    // {
    //     "version": "0.0.1",
    //     "dr_binary_id": "044852b2a670ade5407e78fb2863c51de9fcb96542a07186fe3aeda6bb8a116d",
    //     "dr_inputs": "64725f696e70757473",
    //     "tally_binary_id": "3a1561a3d854e446801b339c137f87dbd2238f481449c00d3470cfcc2a4e24a1",
    //     "tally_inputs": "74616c6c795f696e70757473",
    //     "replication_factor": 1,
    //     "consensus_filter": "00",
    //     "gas_price": "10",
    //     "gas_limit": "10",
    //     "memo": "5d3b53aa92e0bf21abe78ffea2ff372721bce76969ed5ab306b0b5d14a6c2238"
    //              (base64-encoded)"XTtTqpLgvyGr54/+ov83JyG852lp7VqzBrC10UpsIjg="
    //   }
    function testGenerateDataRequestID() public {
        // expected dr id
        bytes32 expected_request_id = 0x264b76bd166a8997c141a4b4b673b2cb5c90bfe313258a4083aaac1dd04e39c1;

        // format data request inputs
        SedaOracleLib.DataRequestInputs memory inputs = SedaOracleLib.DataRequestInputs({
            dr_binary_id: 0x044852b2a670ade5407e78fb2863c51de9fcb96542a07186fe3aeda6bb8a116d,
            dr_inputs: hex"64725f696e70757473",
            // base64: "ZHJfaW5wdXRz"
            tally_binary_id: 0x3a1561a3d854e446801b339c137f87dbd2238f481449c00d3470cfcc2a4e24a1,
            tally_inputs: hex"74616c6c795f696e70757473",
            // base64: "dGFsbHlfaW5wdXRz"
            replication_factor: 1,
            consensus_filter: hex"00",
            // base64: "XTtTqpLgvyGr54/+ov83JyG852lp7VqzBrC10UpsIjg="
            gas_price: 10,
            gas_limit: 10,
            memo: hex"5d3b53aa92e0bf21abe78ffea2ff372721bce76969ed5ab306b0b5d14a6c2238"
        });
        // base64: "XTtTqpLgvyGr54/+ov83JyG852lp7VqzBrC10UpsIjg="

        // calculate data request hash
        bytes32 request_id = oracle.generateDataRequestId(inputs);
        assertEq(request_id, expected_request_id);
    }

    // Test function to check if DR_ID still matches with other components
    // {
    //   "version": "0.0.1",
    //   "dr_id": "5b9194faf640b6c9b6fcb266dd3a1b3af9c11c8bb322528c89838f0aaff30e89",
    //   "consensus": true,
    //   "exit_code": 0,
    //   "result": "1a192fabce13988b84994d4296e6cdc418d55e2f1d7f942188d4040b94fc57ac",
    //   "block_height": 12345,
    //   "gas_used": "20",
    //   "payback_address": "010203",
    //   "seda_payload": "040506"
    // }
    function testGenerateDataResultID() public {
        // expected dr id
        bytes32 expected_result_id = 0xc07800e3f74a3c4b1bf9e70d338b511c2f44b016528b63095efe4012cb1170ff;

        // format data request inputs
        SedaOracleLib.DataResult memory result = SedaOracleLib.DataResult({
            version: "0.0.1",
            dr_id: 0x264b76bd166a8997c141a4b4b673b2cb5c90bfe313258a4083aaac1dd04e39c1,
            consensus: true,
            exit_code: 0,
            result: hex"1a192fabce13988b84994d4296e6cdc418d55e2f1d7f942188d4040b94fc57ac",
            // base64: "Ghkvq84TmIuEmU1ClubNxBjVXi8df5QhiNQEC5T8V6w="
            block_height: 12_345,
            gas_used: 20,
            payback_address: hex"010203",
            // base64: "AQID"
            seda_payload: hex"040506"
        });
        // base 64: "BAUG"

        bytes32 result_id = oracle.generateDataResultId(result);
        assertEq(result_id, expected_result_id);
    }
}
