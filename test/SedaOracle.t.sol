// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "forge-std/Test.sol";
import "../src/SedaOracle.sol";

contract SedaOracleTest is Test {
    SedaOracle public oracle;

    function setUp() public {
        oracle = new SedaOracle();
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
            gas_price: 456,
            gas_limit: 789,
            memo: memo
        });
    }

    function _getDataResultsInputs() private view returns (SedaOracleLib.DataResult memory) {
        SedaOracleLib.DataRequestInputs memory data_request_inputs = _getDataRequestInputs("0");
        bytes32 dr_id = oracle.hashDataRequest(data_request_inputs);
        uint128 block_height = 1;
        uint8 exit_code = 2;
        uint128 gas_used = 3;

        bytes memory result = "result";
        bytes memory payback_address = "payback_address";
        bytes memory seda_payload = "seda_payload";

        return SedaOracleLib.DataResult({
            version: SedaOracleLib.VERSION,
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
        assertEq(oracle.getDataRequestsFromPool(0, 10).length, 0);
        SedaOracleLib.DataRequestInputs memory inputs = _getDataRequestInputs("0");
        bytes32 expected_dr_id = oracle.hashDataRequest(inputs);
        oracle.postDataRequest(inputs);

        assertEq(oracle.getDataRequestsFromPool(0, 10).length, 1);

        SedaOracleLib.DataRequest memory received_dr = oracle.getDataRequestsFromPool(0, 1)[0];

        bytes32 received_dr_id = oracle.hashDataRequest(
            SedaOracleLib.DataRequestInputs({
                dr_binary_id: received_dr.dr_binary_id,
                dr_inputs: received_dr.dr_inputs,
                tally_binary_id: received_dr.tally_binary_id,
                tally_inputs: received_dr.tally_inputs,
                replication_factor: received_dr.replication_factor,
                gas_price: received_dr.gas_price,
                gas_limit: received_dr.gas_limit,
                memo: received_dr.memo
            })
        );

        assertEq(expected_dr_id, received_dr_id);
    }

    function testPostDataResult() public {
        // post a data request and assert the associated result is non-existent
        SedaOracleLib.DataRequestInputs memory inputs = _getDataRequestInputs("0");
        oracle.postDataRequest(inputs);

        bytes32 dr_id = oracle.hashDataRequest(inputs);
        (, bytes32 res_id_nonexistent,,,,,,) = oracle.data_request_id_to_result(dr_id);
        assertEq(res_id_nonexistent, 0);

        // post the data result and assert the dr_id is correct
        oracle.postDataResult(_getDataResultsInputs());
        (, bytes32 res_dr_id,,,,,,) = oracle.data_request_id_to_result(dr_id);
        assertEq(res_dr_id, dr_id);

        // assert the pool is empty
        assert(oracle.getDataRequestsFromPool(0, 1).length == 0);
    }

    function testGetDataRequestsFromPool() public {
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
        oracle.postDataResult(_getDataResultsInputs());

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

    function testHash() public {
        // If this fails we also have to change the relayer to handle this
        bytes32 expected_hash = 0x23eeef4d65a87c3e81b23fb54c94bfb66ed3f65f7082b744398bbd0248f1fb55;

        // format data request inputs
        SedaOracleLib.DataRequestInputs memory inputs = _getDataRequestInputs("0");

        // calculate data request hash
        bytes32 test_hash = oracle.hashDataRequest(inputs);

        emit log_named_bytes32("test_hash", test_hash);

        assertEq(expected_hash, test_hash);
    }
}
