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

        bytes32 dr_id = oracle.data_request_pool_by_nonce(1);

        (bytes32 expected_id,, string memory expected_value) = oracle.data_request_pool(dr_id);
        assertEq(expected_id, dr_id);
        assertEq(expected_value, "test");
    }

    function testPostDataResult() public {
        oracle.postDataRequest("test");
        (bytes32 dr_id,, string memory dr_value) = oracle.data_request_pool(oracle.data_request_pool_by_nonce(1));
        (bytes32 res_id,, string memory res_value, string memory res_result) = oracle.data_results(dr_id);
        assertEq(dr_id, oracle.data_request_pool_by_nonce(1));
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
        assertEq(res_id_after, dr_id);
        assertEq(res_value_after, "test");
        assertEq(res_result_after, "result");

        (bytes32 dr_id_removed_from_pool,,) = oracle.data_request_pool(oracle.data_request_pool_by_nonce(1));
        assertEq(dr_id_removed_from_pool, 0);
    }

    function testGetDataRequestsFromPool() public {
        oracle.postDataRequest("1");
        oracle.postDataRequest("2");
        oracle.postDataRequest("3");

        // fetch all three data requests starting from position 1 (dr 1)
        SedaOracleLib.DataRequest[] memory data_requests = oracle.getDataRequestsFromPool(1, 3);
        assertEq(data_requests.length, 3);

        // fetch all three data requests starting from position 0 (dr 0 doesn't exist, but it should skip over it)
        SedaOracleLib.DataRequest[] memory data_requests_2 = oracle.getDataRequestsFromPool(1, 3);
        assertEq(data_requests_2.length, 3);

        // fetch data requests with a limit of 2
        SedaOracleLib.DataRequest[] memory data_requests_3 = oracle.getDataRequestsFromPool(1, 2);
        assertEq(data_requests_3.length, 2);

        // fetch a single data request
        SedaOracleLib.DataRequest[] memory data_requests_4 = oracle.getDataRequestsFromPool(1, 1);
        assertEq(data_requests_4.length, 1);

        // fetch two data requests starting from the second index
        SedaOracleLib.DataRequest[] memory data_requests_5 = oracle.getDataRequestsFromPool(2, 2);
        assertEq(data_requests_5.length, 2);

        // post a data result for dr 1
        (bytes32 dr_1,,) = oracle.data_request_pool(oracle.data_request_pool_by_nonce(1));
        oracle.postDataResult(dr_1, "result");

        // should only return 2 data requests now
        SedaOracleLib.DataRequest[] memory data_requests_6 = oracle.getDataRequestsFromPool(1, 3);
        assertEq(data_requests_6.length, 2);

        // if fetching from position 1, it should return dr 2 since dr 1 has been removed
        SedaOracleLib.DataRequest[] memory data_requests_7 = oracle.getDataRequestsFromPool(1, 1);
        assertEq(data_requests_7[0].dr_id, oracle.data_request_pool_by_nonce(2));
    }

    function testHash() public {
        uint256 nonce = 1;
        string memory value = "test";
        uint256 chainId = 31337;
        bytes32 test_hash = keccak256(abi.encodePacked(nonce, value, chainId));

        bytes memory test_hash_bytes = new bytes(32);
        assembly {
            mstore(add(test_hash_bytes, 32), test_hash)
        }

        emit log_named_bytes("test_hash", test_hash_bytes);
    }
}
