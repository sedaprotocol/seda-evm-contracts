import { ethers } from 'hardhat';
import type { CoreRequestTypes, CoreResultTypes, ProverDataTypes } from '../../ts-types';
import {
  NON_ZERO_HASH,
  RESULT_DOMAIN_SEPARATOR,
  SECP256K1_DOMAIN_SEPARATOR,
  SEDA_DATA_TYPES_VERSION,
} from './constants';

function padBigIntToBytes(value: bigint, byteLength: number): string {
  return ethers.zeroPadValue(ethers.toBeArray(value), byteLength);
}

export function generateNewBatchWithId(initialBatch: ProverDataTypes.BatchStruct) {
  const newBatch: ProverDataTypes.BatchStruct = {
    ...initialBatch,
    batchHeight: BigInt(initialBatch.batchHeight) + BigInt(1),
    blockHeight: BigInt(initialBatch.blockHeight) + BigInt(1),
  };

  const newBatchId = deriveBatchId(newBatch);
  return { newBatchId, newBatch };
}

export function deriveBatchId(batch: ProverDataTypes.BatchStruct): string {
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

export function deriveRequestId(request: CoreRequestTypes.RequestInputsStruct): string {
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

export function deriveResultId(dataResult: CoreResultTypes.ResultStruct): string {
  return ethers.keccak256(
    ethers.concat([
      ethers.keccak256(ethers.toUtf8Bytes(SEDA_DATA_TYPES_VERSION)),
      dataResult.drId,
      new Uint8Array([dataResult.consensus ? 1 : 0]),
      new Uint8Array([Number(dataResult.exitCode)]),
      ethers.keccak256(dataResult.result),
      padBigIntToBytes(BigInt(dataResult.blockHeight), 8),
      padBigIntToBytes(BigInt(dataResult.blockTimestamp), 8),
      padBigIntToBytes(BigInt(dataResult.gasUsed), 16),
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

export function generateDataFixtures(
  length: number,
  resultLength?: number,
): {
  requests: CoreRequestTypes.RequestInputsStruct[];
  results: CoreResultTypes.ResultStruct[];
} {
  const requests = Array.from({ length }, (_, i) => ({
    execProgramId: NON_ZERO_HASH,
    execInputs: NON_ZERO_HASH,
    execGasLimit: 1000000n,
    tallyProgramId: NON_ZERO_HASH,
    tallyInputs: NON_ZERO_HASH,
    tallyGasLimit: 1000000n,
    replicationFactor: 1,
    consensusFilter: '0x01',
    gasPrice: 10000000000n,
    memo: ethers.hexlify(ethers.toUtf8Bytes(`request-${i + 1}`)),
  }));

  const results = requests.map((request) => {
    const drId = deriveRequestId(request);
    const result = resultLength
      ? `0x${Array.from({ length: resultLength }, () =>
          Math.floor(Math.random() * 256)
            .toString(16)
            .padStart(2, '0'),
        ).join('')}`
      : ethers.keccak256(ethers.toUtf8Bytes('SUCCESS'));

    return {
      version: SEDA_DATA_TYPES_VERSION,
      drId,
      consensus: true,
      exitCode: 0,
      result,
      blockHeight: 1,
      blockTimestamp: Math.floor(Date.now() / 1000) + 3600,
      gasUsed: 1000000n,
      paybackAddress: NON_ZERO_HASH,
      sedaPayload: NON_ZERO_HASH,
    };
  });

  return { requests, results };
}
