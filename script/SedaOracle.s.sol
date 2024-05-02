// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "forge-std/Script.sol";
import "../src/SedaOracle.sol";

contract CreateDr is Script {
    function setUp() public {}

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

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("EVM_PRIVATE_KEY");
        address previousDeployment = vm.envAddress("EVM_ORACLE_CONTRACT");
        vm.startBroadcast(deployerPrivateKey);

        string[] memory inputs = new string[](1);
        inputs[0] = "date";
        bytes memory result = vm.ffi(inputs);

        SedaOracle(previousDeployment).postDataRequest(_getDataRequestInputs(result));

        vm.stopBroadcast();
    }
}
