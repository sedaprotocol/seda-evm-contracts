// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "forge-std/Test.sol";
import "../src/SedaOracle.sol";

contract SedaOracleTest is Test {
    SedaOracle public oracle;

    function setUp() public {
        oracle = new SedaOracle();
    }

    function testPostDataRequest() public {
        assertEq(oracle.data_request_count(), 0);
        oracle.postDataRequest("test");
        assertEq(oracle.data_request_count(), 1);

        bytes32 dr_id = oracle.data_requests_by_nonce(1);

        (bytes32 expected_id,, string memory expected_value) = oracle.data_request_pool(dr_id);
        assertEq(expected_id, dr_id);
        assertEq(expected_value, "test");
    }

    function testPostDataResult() public {
        oracle.postDataRequest("test");
        (bytes32 dr_id,, string memory dr_value) = oracle.data_request_pool(oracle.data_requests_by_nonce(1));
        (bytes32 res_id,, string memory res_value, string memory res_result) = oracle.data_results(dr_id);
        assertEq(dr_id, oracle.data_requests_by_nonce(1));
        assertEq(dr_value, "test");
        assertEq(res_id, 0);
        assertEq(res_value, "");
        assertEq(res_result, "");

        oracle.postDataResult(dr_id, "result");
        (bytes32 dr_id_after,, string memory dr_value_after) = oracle.data_request_pool(dr_id);
        (bytes32 res_id_after,, string memory res_value_after, string memory res_result_after) =
            oracle.data_results(dr_id);
        assertEq(dr_id_after, 0);
        assertEq(dr_value_after, "");
        assertEq(res_id_after, oracle.data_requests_by_nonce(1));
        assertEq(res_value_after, "test");
        assertEq(res_result_after, "result");
    }

    function getDataRequests() public {
        oracle.postDataRequest("1");
        oracle.postDataRequest("2");
        oracle.postDataRequest("3");

        // fetch all three data requests
        SedaOracleLib.DataRequest[] memory data_requests = oracle.getDataRequests(1, 3);
        assertEq(data_requests.length, 3);

        // fetch data requests with a limit of 2
        SedaOracleLib.DataRequest[] memory data_requests_2 = oracle.getDataRequests(1, 2);
        assertEq(data_requests_2.length, 2);

        // fetch a single data request
        SedaOracleLib.DataRequest[] memory data_requests_3 = oracle.getDataRequests(1, 1);
        assertEq(data_requests_3.length, 1);

        // fetch two data requests starting from the second index
        SedaOracleLib.DataRequest[] memory data_requests_4 = oracle.getDataRequests(2, 2);
        assertEq(data_requests_4.length, 1);
    }

    function testHash() public {
        uint256 nonce = 1;
        string memory value = "hello world";
        uint256 chainId = 31337;
        bytes32 test_hash = keccak256(abi.encode(nonce, value, chainId));

        bytes memory test_hash_bytes = new bytes(32);
        assembly {
            mstore(add(test_hash_bytes, 32), test_hash)
        }

        emit log_named_bytes("test_hash", test_hash_bytes);
    }
}
