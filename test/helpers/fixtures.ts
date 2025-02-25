import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { ethers, upgrades } from 'hardhat';
import { ONE_DAY_IN_SECONDS } from '../utils/constants';
import { computeResultLeafHash, computeValidatorLeafHash, deriveResultId, generateDataFixtures } from '../utils/crypto';

export async function deployWithSize(size: {
  requests?: number;
  resultLength?: number;
  validators?: number;
  firstValidatorPower?: number;
}) {
  const { requests, results } = generateDataFixtures(size.requests ?? 10, size.resultLength);

  const leaves = results.map(deriveResultId).map(computeResultLeafHash);

  // Create merkle tree and proofs
  const resultsTree = SimpleMerkleTree.of(leaves, { sortLeaves: true });
  const resultProofs = results.map((_, index) => resultsTree.getProof(index));

  // Create validator wallets
  const wallets = Array.from({ length: size.validators ?? 20 }, (_, i) => {
    const seed = ethers.id(`validator${i}`);
    return new ethers.Wallet(seed.slice(2, 66));
  });

  // Sort validators by address (required by the prover contract)
  wallets.sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));

  const validators = wallets.map((wallet) => wallet.address);

  const totalVotingPower = 100_000_000; // Total voting power (100%)
  const firstValidatorPower = size.firstValidatorPower ?? 75_000_000; // by default 75% for first validator
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

  const ProverFactory = await ethers.getContractFactory('Secp256k1ProverV1');
  const prover = await upgrades.deployProxy(ProverFactory, [initialBatch], {
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

  return { prover, core, data };
}
