// SPDX-License-Identifier: UNLICENSED
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
        assertEq(oracle.data_requests(1), "test");
    }
}
