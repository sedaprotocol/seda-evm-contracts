// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library SedaDataTypes {
    string constant VERSION = "0.0.1";

    struct RequestInputs {
        /// Identifier of Execution WASM binary
        bytes32 execProgramId;
        /// Inputs for Execution WASM binary
        bytes execInputs;
        /// Identifier of Tally WASM binary
        bytes32 tallyProgramId;
        /// Inputs for Tally WASM binary
        bytes tallyInputs;
        /// Amount of required DR executors
        uint16 replicationFactor;
        /// Filter applied before tally execution
        bytes consensusFilter;
        /// Amount of SEDA tokens per gas unit
        uint128 gasPrice;
        /// Maximum of gas units to be used by data request executors
        uint64 gasLimit;
        /// Public info attached to DR
        bytes memo;
    }

    struct Request {
        /// Semantic Version
        string version;
        // DR definition
        /// Identifier of Execution WASM binary
        bytes32 execProgramId;
        /// Inputs for Execution WASM binary
        bytes execInputs;
        /// Identifier of Tally WASM binary
        bytes32 tallyProgramId;
        /// Inputs for Tally WASM binary
        bytes tallyInputs;
        /// Amount of required DR executors
        uint16 replicationFactor;
        /// Filter to be applied before tally execution
        bytes consensusFilter;
        /// Amount of SEDA tokens per gas unit
        uint128 gasPrice;
        /// Maximum of gas units to be used by data request executors
        uint64 gasLimit;
        /// Public info attached to DR
        bytes memo;
    }

    struct Result {
        /// Semantic Version
        string version;
        /// Data Request Identifier
        bytes32 drId;
        /// True or false whether the reveal results are in consensus or not (≥ 66%)
        bool consensus;
        /// Exit code of Tally WASM binary execution
        uint8 exitCode;
        /// Result from Tally WASM binary execution
        bytes result;
        /// Block Height at which data request was finalized
        uint64 blockHeight;
        /// Gas used by the complete data request execution
        uint64 gasUsed;
        // Fields from Data Request Execution
        /// Payback address set by the relayer
        bytes paybackAddress;
        /// Payload set by SEDA Protocol (e.g. OEV-enabled data requests)
        bytes sedaPayload;
    }

    struct Batch {
        uint256 batchHeight;
        uint256 blockHeight;
        bytes32 validatorRoot;
        bytes32 resultsRoot;
        bytes32 provingMetadata;
    }

    struct ValidatorProof {
        bytes publicKey;
        uint32 votingPower;
        bytes32[] merkleProof;
    }

    function deriveBatchId(Batch memory batch) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    batch.batchHeight,
                    batch.blockHeight,
                    batch.validatorRoot,
                    batch.resultsRoot,
                    batch.provingMetadata
                )
            );
    }

    function deriveResultId(
        SedaDataTypes.Result memory result
    ) public pure returns (bytes32) {
        return
            keccak256(
                bytes.concat(
                    keccak256(bytes(SedaDataTypes.VERSION)),
                    result.drId,
                    result.consensus ? bytes1(0x01) : bytes1(0x00),
                    bytes1(result.exitCode),
                    keccak256(result.result),
                    bytes8(result.blockHeight),
                    bytes8(result.gasUsed),
                    keccak256(result.paybackAddress),
                    keccak256(result.sedaPayload)
                )
            );
    }

    /// @notice Hashes arguments to a data request to produce a unique id
    function deriveRequestId(
        SedaDataTypes.RequestInputs memory inputs
    ) public pure returns (bytes32) {
        return
            keccak256(
                bytes.concat(
                    keccak256(bytes(SedaDataTypes.VERSION)),
                    inputs.execProgramId,
                    keccak256(inputs.execInputs),
                    inputs.tallyProgramId,
                    keccak256(inputs.tallyInputs),
                    bytes2(inputs.replicationFactor),
                    keccak256(inputs.consensusFilter),
                    bytes16(inputs.gasPrice),
                    bytes8(inputs.gasLimit),
                    keccak256(inputs.memo)
                )
            );
    }
}