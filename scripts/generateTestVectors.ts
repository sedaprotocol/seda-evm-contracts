import * as fs from 'node:fs';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';
import { ethers } from 'hardhat';

import {
  computeResultLeafHash,
  computeValidatorLeafHash,
  deriveDataResultId,
  deriveRequestId,
  generateDataFixtures,
} from '../test/utils';

// Function to write JSON data to a file with error handling
function writeJsonToFile(filename: string, data: object) {
  try {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`Data has been written to ${filename}`);
  } catch (error) {
    console.error(`Error writing to file ${filename}:`, error);
  }
}

// Generate multiple data requests and results
const { requests, results } = generateDataFixtures(10);

// Derive request IDs
const requestIds = requests.map(deriveRequestId);

// Derive result IDs
const resultIds = results.map(deriveDataResultId);

// Create result leaves for the Merkle tree
const resultLeaves = resultIds.map(computeResultLeafHash);

// Create the Merkle tree
const resultsTree = SimpleMerkleTree.of(resultLeaves);

const wallets = Array.from({ length: 10 }, (_, i) => {
  const seed = ethers.id(`validator${i}`);
  return new ethers.Wallet(seed.slice(2, 66));
});

const validators = wallets.map((wallet, _index) => ({
  identity: wallet.address,
  votingPower: 10_000_000,
}));

// Create validator leaves for the Merkle tree
const validatorLeaves = validators.map((v) => computeValidatorLeafHash(v.identity, v.votingPower));

// Create the Merkle tree for validators
const validatorTree = SimpleMerkleTree.of(validatorLeaves);

// Create a JSON object with the data
const dataJSON = {
  requests: requests.map((request, index) => ({
    requestId: requestIds[index],
    execProgramId: request.execProgramId,
    execInputs: request.execInputs,
    execGasLimit: request.execGasLimit.toString(),
    tallyProgramId: request.tallyProgramId,
    tallyInputs: request.tallyInputs,
    tallyGasLimit: request.tallyGasLimit.toString(),
    replicationFactor: request.replicationFactor,
    consensusFilter: request.consensusFilter,
    gasPrice: ethers.formatUnits(request.gasPrice, 'gwei'),
    memo: request.memo,
  })),
  results: results.map((result, index) => ({
    resultId: resultIds[index],
    ...result,
  })),
  resultsTree: {
    root: resultsTree.root,
    leaves: resultLeaves,
  },
  validators: validators,
  validatorsTree: {
    root: validatorTree.root,
    leaves: validatorLeaves,
  },
  wallets: wallets.map((wallet) => ({
    address: wallet.address,
    privateKey: wallet.privateKey,
    publicKey: wallet.signingKey.publicKey,
  })),
};

// Write the JSON data to files
writeJsonToFile('test-vectors.json', dataJSON);
