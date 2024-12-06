// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {SedaDataTypes} from "../../libraries/SedaDataTypes.sol";
import {IProver} from "../../interfaces/IProver.sol";
import {IResultHandler} from "../../interfaces/IResultHandler.sol";

/// @title ResultHandler
/// @notice Implements the ResultHandlerBase for managing Seda protocol results
abstract contract ResultHandlerBase is IResultHandler, Initializable {
    // ============ Constants ============

    // Define a unique storage slot for ResultHandlerBase
    bytes32 private constant RESULT_HANDLER_STORAGE_SLOT =
        keccak256(abi.encode(uint256(keccak256("seda.resulthandler.storage")) - 1)) & ~bytes32(uint256(0xff));

    // ============ Storage ============

    /// @custom:storage-location erc7201:seda.resulthandler.storage
    struct ResultHandlerStorage {
        IProver sedaProver;
        // Mapping of request IDs to Result structs
        mapping(bytes32 => SedaDataTypes.Result) results;
    }

    // ============ Constructor & Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the ResultHandler contract
    /// @dev Sets up the contract with the provided Seda prover address
    /// @param sedaProverAddress The address of the Seda prover contract
    // solhint-disable-next-line func-name-mixedcase
    function __ResultHandler_init(address sedaProverAddress) internal onlyInitializing {
        _resultHandlerStorage().sedaProver = IProver(sedaProverAddress);
    }

    // ============ External Functions ============

    /// @inheritdoc IResultHandler
    function postResult(
        SedaDataTypes.Result calldata result,
        uint64 batchHeight,
        bytes32[] calldata proof
    ) public virtual override(IResultHandler) returns (bytes32) {
        bytes32 resultId = SedaDataTypes.deriveResultId(result);
        if (_resultHandlerStorage().results[result.drId].drId != bytes32(0)) {
            revert ResultAlreadyExists(resultId);
        }
        if (!_resultHandlerStorage().sedaProver.verifyResultProof(resultId, batchHeight, proof)) {
            revert InvalidResultProof(resultId);
        }

        _resultHandlerStorage().results[result.drId] = result;

        emit ResultPosted(resultId);
        return resultId;
    }

    // ============ Public View Functions ============

    /// @inheritdoc IResultHandler
    function getResult(bytes32 requestId) public view override(IResultHandler) returns (SedaDataTypes.Result memory) {
        SedaDataTypes.Result memory result = _resultHandlerStorage().results[requestId];
        if (bytes(result.version).length == 0) {
            revert ResultNotFound(requestId);
        }
        return _resultHandlerStorage().results[requestId];
    }

    /// @notice Returns the address of the Seda prover contract
    /// @return The address of the Seda prover contract
    function getSedaProver() public view returns (address) {
        return address(_resultHandlerStorage().sedaProver);
    }

    /// @notice Verifies the result without storing it
    /// @param result The result to verify
    /// @param batchHeight The height of the batch the result belongs to
    /// @param proof The proof associated with the result
    /// @return A boolean indicating whether the result is valid
    function verifyResult(
        SedaDataTypes.Result calldata result,
        uint64 batchHeight,
        bytes32[] calldata proof
    ) public view returns (bytes32) {
        bytes32 resultId = SedaDataTypes.deriveResultId(result);
        if (!_resultHandlerStorage().sedaProver.verifyResultProof(resultId, batchHeight, proof)) {
            revert InvalidResultProof(resultId);
        }

        return resultId;
    }

    /// @notice Derives a result ID from the given result
    /// @param result The result data
    /// @return The derived result ID
    function deriveResultId(SedaDataTypes.Result calldata result) public pure returns (bytes32) {
        return SedaDataTypes.deriveResultId(result);
    }

    // ============ Internal Functions ============

    /// @notice Returns the storage struct for the contract
    /// @dev Uses ERC-7201 storage pattern to access the storage struct at a specific slot
    /// @return s The storage struct containing the contract's state variables
    function _resultHandlerStorage() private pure returns (ResultHandlerStorage storage s) {
        bytes32 slot = RESULT_HANDLER_STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            s.slot := slot
        }
    }
}
