import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { ethers, upgrades } from 'hardhat';
import type { CoreRequestTypes, CoreResultTypes } from '../../ts-types';
import { MAX_BATCH_AGE, ONE_DAY_IN_SECONDS } from '../utils/constants';
import { NON_ZERO_HASH, SEDA_DATA_TYPES_VERSION } from '../utils/constants';
import { computeResultLeafHash, computeValidatorLeafHash, deriveResultId } from '../utils/crypto';
import { deriveRequestId } from '../utils/crypto';

interface DeployOptions {
  requests?: number;
  resultLength?: number;
  validators?: number;
  firstValidatorPower?: number;
  feeManager?: boolean;
}

export async function deployWithOptions(options: DeployOptions) {
  const { requests, results } = generateDataFixtures(options.requests ?? 10, options.resultLength);

  const leaves = results.map(deriveResultId).map(computeResultLeafHash);

  // Create merkle tree and proofs
  const resultsTree = SimpleMerkleTree.of(leaves, { sortLeaves: true });
  const resultProofs = results.map((_, index) => resultsTree.getProof(index));

  // Create validator wallets
  const wallets = Array.from({ length: options.validators ?? 20 }, (_, i) => {
    const seed = ethers.id(`validator${i}`);
    return new ethers.Wallet(seed.slice(2, 66));
  });

  // Sort validators by address (required by the prover contract)
  wallets.sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));

  const validators = wallets.map((wallet) => wallet.address);

  const totalVotingPower = 100_000_000; // Total voting power (100%)
  const firstValidatorPower = options.firstValidatorPower ?? 75_000_000; // by default 75% for first validator
  const remainingPower = totalVotingPower - firstValidatorPower; // 25% to distribute

  // Distribute remaining 25% evenly among other validators
  const votingPowers = validators.map((_, index) =>
    index === 0 ? firstValidatorPower : Math.floor(remainingPower / (validators.length - 1)),
  );

  const validatorLeaves = validators.map((validator, index) =>
    computeValidatorLeafHash(validator, votingPowers[index]),
  );

  // Validators: Create merkle tree and proofs
  const validatorsTree = SimpleMerkleTree.of(validatorLeaves, {
    sortLeaves: true,
  });
  const validatorProofs = validators.map((signer, index) => {
    const proof = validatorsTree.getProof(index);
    return {
      signer,
      votingPower: votingPowers[index],
      merkleProof: proof,
    };
  });

  const initialBatch = {
    batchHeight: 0,
    blockHeight: 0,
    validatorsRoot: validatorsTree.root,
    resultsRoot: resultsTree.root,
    provingMetadata: ethers.ZeroHash,
  };

  let feeManager: string;
  if (options.feeManager) {
    const FeeManagerFactory = await ethers.getContractFactory('SedaFeeManager');
    const feeManagerContract = await FeeManagerFactory.deploy();
    await feeManagerContract.waitForDeployment();
    feeManager = await feeManagerContract.getAddress();
  } else {
    feeManager = ethers.ZeroAddress;
  }

  const ProverFactory = await ethers.getContractFactory('Secp256k1ProverV1');
  const prover = await upgrades.deployProxy(ProverFactory, [initialBatch, MAX_BATCH_AGE, feeManager], {
    initializer: 'initialize',
    kind: 'uups',
  });
  await prover.waitForDeployment();

  const CoreFactory = await ethers.getContractFactory('SedaCoreV1');
  const core = await upgrades.deployProxy(CoreFactory, [await prover.getAddress(), ONE_DAY_IN_SECONDS], {
    initializer: 'initialize',
    kind: 'uups',
  });
  await core.waitForDeployment();

  const data = {
    initialBatch,
    requests,
    results,
    resultProofs,
    validatorProofs,
    wallets,
  };

  return { prover, core, feeManager, data };
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
    execGasLimit: 10_000_000_000_000n,
    tallyProgramId: NON_ZERO_HASH,
    tallyInputs: NON_ZERO_HASH,
    tallyGasLimit: 10_000_000_000_000n,
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
