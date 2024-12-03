import { ethers } from 'hardhat';

import type { SedaDataTypes } from '../typechain-types/contracts/libraries/SedaDataTypes';

export const SEDA_DATA_TYPES_VERSION = '0.0.1';

const RESULT_DOMAIN_SEPARATOR = '0x00';
const SECP256K1_DOMAIN_SEPARATOR = '0x01';

function padBigIntToBytes(value: bigint, byteLength: number): string {
  return ethers.zeroPadValue(ethers.toBeArray(value), byteLength);
}

export function generateNewBatchWithId(initialBatch: SedaDataTypes.BatchStruct) {
  const newBatch: SedaDataTypes.BatchStruct = {
    ...initialBatch,
    batchHeight: BigInt(initialBatch.batchHeight) + BigInt(1),
    blockHeight: BigInt(initialBatch.blockHeight) + BigInt(1),
  };

  const newBatchId = deriveBatchId(newBatch);
  return { newBatchId, newBatch };
}

export function deriveBatchId(batch: SedaDataTypes.BatchStruct): string {
  return ethers.keccak256(
    ethers.concat([
      padBigIntToBytes(BigInt(batch.batchHeight), 8),
      padBigIntToBytes(BigInt(batch.blockHeight), 8),
      batch.validatorsRoot,
      batch.resultsRoot,
      batch.provingMetadata,
    ]),
  );
}

export function deriveRequestId(request: SedaDataTypes.RequestInputsStruct): string {
  return ethers.keccak256(
    ethers.concat([
      ethers.keccak256(ethers.toUtf8Bytes(SEDA_DATA_TYPES_VERSION)),
      request.execProgramId,
      ethers.keccak256(request.execInputs),
      padBigIntToBytes(BigInt(request.execGasLimit), 8),
      request.tallyProgramId,
      ethers.keccak256(request.tallyInputs),
      padBigIntToBytes(BigInt(request.tallyGasLimit), 8),
      padBigIntToBytes(BigInt(request.replicationFactor), 2),
      ethers.keccak256(request.consensusFilter),
      padBigIntToBytes(BigInt(request.gasPrice), 16),
      ethers.keccak256(request.memo),
    ]),
  );
}

export function deriveDataResultId(dataResult: SedaDataTypes.ResultStruct): string {
  return ethers.keccak256(
    ethers.concat([
      ethers.keccak256(ethers.toUtf8Bytes(SEDA_DATA_TYPES_VERSION)),
      dataResult.drId,
      new Uint8Array([dataResult.consensus ? 1 : 0]),
      new Uint8Array([Number(dataResult.exitCode)]),
      ethers.keccak256(dataResult.result),
      padBigIntToBytes(BigInt(dataResult.blockHeight), 8),
      padBigIntToBytes(BigInt(dataResult.blockTimestamp), 8),
      padBigIntToBytes(BigInt(dataResult.gasUsed), 8),
      ethers.keccak256(dataResult.paybackAddress),
      ethers.keccak256(dataResult.sedaPayload),
    ]),
  );
}

export function computeResultLeafHash(resultId: string): string {
  return ethers.solidityPackedKeccak256(['bytes1', 'bytes32'], [RESULT_DOMAIN_SEPARATOR, ethers.getBytes(resultId)]);
}

export function computeValidatorLeafHash(validator: string, votingPower: number): string {
  return ethers.solidityPackedKeccak256(
    ['bytes1', 'bytes', 'uint32'],
    [SECP256K1_DOMAIN_SEPARATOR, validator, votingPower],
  );
}

export function generateDataFixtures(length: number): {
  requests: SedaDataTypes.RequestInputsStruct[];
  results: SedaDataTypes.ResultStruct[];
} {
  const requests = Array.from({ length }, (_, i) => ({
    execProgramId: ethers.ZeroHash,
    execInputs: '0x',
    execGasLimit: 1000000n,
    tallyProgramId: ethers.ZeroHash,
    tallyInputs: '0x',
    tallyGasLimit: 1000000n,
    replicationFactor: 1,
    consensusFilter: '0x00',
    gasPrice: 0n,
    memo: `0x${i.toString(16).padStart(2, '0')}`,
  }));

  const results = requests.map((request) => {
    const drId = deriveRequestId(request);
    return {
      version: SEDA_DATA_TYPES_VERSION,
      drId,
      consensus: true,
      exitCode: 0,
      result: ethers.keccak256(ethers.toUtf8Bytes('SUCCESS')),
      blockHeight: 0,
      blockTimestamp: 0,
      gasUsed: 0,
      paybackAddress: ethers.ZeroAddress,
      sedaPayload: ethers.ZeroHash,
    };
  });

  return { requests, results };
}
