import { ethers } from 'hardhat';

import type { SedaDataTypes } from '../typechain-types/contracts/libraries/SedaDataTypes';

export function generateNewBatchWithId() {
  const newBatch: SedaDataTypes.BatchStruct = {
    batchHeight: 1,
    blockHeight: 100,
    validatorRoot: ethers.keccak256(ethers.toUtf8Bytes('new validator root')),
    resultsRoot: ethers.keccak256(ethers.toUtf8Bytes('new results root')),
    provingMetadata: ethers.keccak256(ethers.toUtf8Bytes('new proving data')),
  };

  const newBatchId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'bytes32', 'bytes32', 'bytes32'],
      [
        newBatch.batchHeight,
        newBatch.blockHeight,
        newBatch.validatorRoot,
        newBatch.resultsRoot,
        newBatch.provingMetadata,
      ]
    )
  );
  return { newBatchId, newBatch };
}

export function deriveRequestId(request: SedaDataTypes.RequestInputsStruct): string {
  return ethers.keccak256(
    ethers.concat([
      ethers.keccak256(ethers.toUtf8Bytes('0.0.1')), // Hash the version string
      request.execProgramId,
      ethers.keccak256(request.execInputs),
      request.tallyProgramId,
      ethers.keccak256(request.tallyInputs),
      ethers.zeroPadValue(
        ethers.toBeArray(BigInt(request.replicationFactor)),
        2
      ),
      ethers.keccak256(request.consensusFilter),
      ethers.zeroPadValue(ethers.toBeArray(BigInt(request.gasPrice)), 16),
      ethers.zeroPadValue(ethers.toBeArray(BigInt(request.gasLimit)), 8),
      ethers.keccak256(request.memo),
    ])
  );
}

export function deriveDataResultId(dataResult: SedaDataTypes.ResultStruct): string {
  return ethers.keccak256(
    ethers.concat([
      ethers.keccak256(ethers.toUtf8Bytes('0.0.1')), // Hash the version string
      dataResult.drId,
      dataResult.consensus ? new Uint8Array([1]) : new Uint8Array([0]),
      new Uint8Array([Number(dataResult.exitCode)]),
      ethers.keccak256(dataResult.result),
      ethers.zeroPadValue(ethers.toBeArray(BigInt(dataResult.blockHeight)), 8),
      ethers.zeroPadValue(ethers.toBeArray(BigInt(dataResult.gasUsed)), 8),
      ethers.keccak256(dataResult.paybackAddress),
      ethers.keccak256(dataResult.sedaPayload),
    ])
  );
}

export function generateResults(length: number): Array<SedaDataTypes.ResultStruct> {
  return Array.from({ length }, (_, i) => ( {
    version: '0.0.1',
    drId: ethers.keccak256(ethers.toUtf8Bytes(`DR_${i}`)),
    consensus: true,
    exitCode: 0,
    result: ethers.keccak256(ethers.toUtf8Bytes('SUCCESS')),
    blockHeight: 0,
    gasUsed: 0,
    paybackAddress: ethers.ZeroAddress,
    sedaPayload: ethers.ZeroHash,
  }));
}

export function generateRequestsAndResults(length: number): {
  requests: SedaDataTypes.RequestInputsStruct[];
  results: SedaDataTypes.ResultStruct[];
} {
  const requests = Array.from({ length }, (_, i) => ({
    execProgramId: ethers.ZeroHash,
    execInputs: '0x',
    tallyProgramId: ethers.ZeroHash,
    tallyInputs: '0x',
    replicationFactor: 3,
    consensusFilter: '0x00',
    gasPrice: '0',
    gasLimit: 1000000,
    memo: `0x${i.toString(16).padStart(2, '0')}`,
  }));

  const results = Array.from({ length }, (_, i) => {
    const drId = deriveRequestId(requests[i]);
    return {
      version: '0.0.1',
      drId: drId,
      consensus: true,
      exitCode: 0,
      result: ethers.keccak256(ethers.toUtf8Bytes('SUCCESS')),
      blockHeight: 0,
      gasUsed: 0,
      paybackAddress: ethers.ZeroAddress,
      sedaPayload: ethers.ZeroHash,
    };
  });

  return {
    requests,
    results,
  };
}
