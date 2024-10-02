// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library SedaDataTypes {
    string constant VERSION = "0.0.1";

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

    struct Batch {
        uint256 batchHeight;
        uint256 blockHeight;
        bytes32 validatorRoot;
        bytes32 resultsRoot;
        // bytes32 provingData;
    }

    struct ValidatorProof {
        address publicKey;
        uint32 votingPower;
        bytes32[] merkleProof;
    }

    function computeBatchId(Batch memory batch) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    batch.batchHeight,
                    batch.blockHeight,
                    batch.validatorRoot,
                    batch.resultsRoot
                )
            );
    }
}
