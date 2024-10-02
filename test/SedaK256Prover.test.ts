import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';

import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('SedaK256Prover: 4 validators', () => {
  function generateNewBatchWithId() {
    const newBatch = {
      batchHeight: 1,
      blockHeight: 100,
      validatorRoot: ethers.keccak256(ethers.toUtf8Bytes('new validator root')),
      resultsRoot: ethers.keccak256(ethers.toUtf8Bytes('new results root')),
    };

    const newBatchId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'bytes32', 'bytes32'],
        [
          newBatch.batchHeight,
          newBatch.blockHeight,
          newBatch.validatorRoot,
          newBatch.resultsRoot,
        ]
      )
    );
    return { newBatchId, newBatch };
  }

  async function deployProverFixture() {
    // Create wallets from the given private keys in decimal format
    // Create wallets from the given private keys in decimal format
    const privateKeysDec = [
      '19364754072319078679550301671505040179035858431960811629105035944776133510182',
      '68619014097430004589532778183241588574857414830238493947312392711069044622953',
      '58435399889922176161880059996414222578881241975318132253376082907538942305313',
      '64770165991303981399885074754284222540880024302873026014683458694822777728452',
    ];

    const wallets = privateKeysDec.map((pkDec) => {
      // Convert decimal to hexadecimal, ensure it's 32 bytes long, and create a wallet
      const pkHex = BigInt(pkDec).toString(16).padStart(64, '0');
      return new ethers.Wallet(`0x${pkHex}`);
    });

    // // Alternative way to generate wallets
    // const wallets = Array.from({ length: 4 }, (_, i) => {
    //     const seed = ethers.id(`validator${i}`);
    //     return new ethers.Wallet(seed.slice(2, 66));
    // });

    const validators = wallets.map((wallet) => wallet.address);
    const votingPowers = [75_000_000, 25_000_000, 25_000_000, 25_000_000];

    const leaves = validators.map((validator, index) =>
      ethers.solidityPackedKeccak256(
        ['address', 'uint32'],
        [validator, votingPowers[index]]
      )
    );

    // Create merkle tree and proofs
    const tree = SimpleMerkleTree.of(leaves, { sortLeaves: true });
    const proofs = validators.map((validator, index) => {
      const proof = tree.getProof(index);
      return {
        publicKey: validator,
        votingPower: votingPowers[index],
        merkleProof: proof,
      };
    });

    // Create initial batch
    const initialBatch = {
      batchHeight: 0,
      blockHeight: 0,
      validatorRoot: tree.root, // Placeholder, replace with actual validatorRoot
      resultsRoot: ethers.ZeroHash,
    };

    // Deploy the SedaDataTypes library first
    const DataTypesFactory = await ethers.getContractFactory('SedaDataTypes');
    const dataTypes = await DataTypesFactory.deploy();

    // Deploy the contract
    const ProverFactory = await ethers.getContractFactory('SedaK256Prover', {
      libraries: {
        SedaDataTypes: await dataTypes.getAddress(),
      },
    });
    const prover = await ProverFactory.deploy(initialBatch);

    return { prover, wallets, proofs };
  }

  it('should update a batch with 1 validator (75% voting power)', async () => {
    const { prover, wallets, proofs } = await loadFixture(deployProverFixture);

    const { newBatchId, newBatch } = generateNewBatchWithId();
    const signatures = [
      await wallets[0].signingKey.sign(newBatchId).serialized,
    ];
    await prover.updateBatch(newBatch, signatures, [proofs[0]]);

    const updatedBatch = await prover.currentBatch();
    expect(updatedBatch.batchHeight).to.equal(1);
  });

  it('should update a batch with 3 validators (75% voting power)', async () => {
    const { prover, wallets, proofs } = await loadFixture(deployProverFixture);

    const { newBatchId, newBatch } = generateNewBatchWithId();
    const signatures = await Promise.all(
      wallets
        .slice(1)
        .map((wallet) => wallet.signingKey.sign(newBatchId).serialized)
    );
    await prover.updateBatch(newBatch, signatures, proofs.slice(1));

    const updatedBatch = await prover.currentBatch();
    expect(updatedBatch.batchHeight).to.equal(1);
  });

  it('should update a batch with 4 validators', async () => {
    const { prover, wallets, proofs } = await loadFixture(deployProverFixture);

    const { newBatchId, newBatch } = generateNewBatchWithId();
    const signatures = await Promise.all(
      wallets.map((wallet) => wallet.signingKey.sign(newBatchId).serialized)
    );
    await prover.updateBatch(newBatch, signatures, proofs);

    const updatedBatch = await prover.currentBatch();
    expect(updatedBatch.batchHeight).to.equal(1);
  });

  it('should fail to update a batch with 1 validator (25% voting power)', async () => {
    const { prover, wallets, proofs } = await loadFixture(deployProverFixture);

    const { newBatchId, newBatch } = generateNewBatchWithId();
    const signatures = [
      await wallets[1].signingKey.sign(newBatchId).serialized,
    ];
    await expect(
      prover.updateBatch(newBatch, signatures, [proofs[1]])
    ).to.be.revertedWith('Consensus not reached');

    const updatedBatch = await prover.currentBatch();
    expect(updatedBatch.batchHeight).to.equal(0);
  });

  it('should fail to update a batch with 2 validator (50% voting power)', async () => {
    const { prover, wallets, proofs } = await loadFixture(deployProverFixture);

    const { newBatchId, newBatch } = generateNewBatchWithId();
    const signatures = [
      await wallets[1].signingKey.sign(newBatchId).serialized,
      await wallets[2].signingKey.sign(newBatchId).serialized,
    ];

    await expect(
      prover.updateBatch(newBatch, signatures, [proofs[1], proofs[2]])
    ).to.be.revertedWith('Consensus not reached');

    const updatedBatch = await prover.currentBatch();
    expect(updatedBatch.batchHeight).to.equal(0);
  });

  it('should fail to update a batch if mismatching signatures and proofs', async () => {
    const { prover, wallets, proofs } = await loadFixture(deployProverFixture);

    const { newBatchId, newBatch } = generateNewBatchWithId();
    const signatures = [
      await wallets[0].signingKey.sign(newBatchId).serialized,
    ];

    await expect(
      prover.updateBatch(newBatch, signatures, proofs)
    ).to.be.revertedWith('Mismatched signatures and proofs');

    const updatedBatch = await prover.currentBatch();
    expect(updatedBatch.batchHeight).to.equal(0);
  });

  it('should fail to update a batch if invalid merkle proof', async () => {
    const { prover, wallets, proofs } = await loadFixture(deployProverFixture);

    const { newBatchId, newBatch } = generateNewBatchWithId();
    const signatures = [
      await wallets[0].signingKey.sign(newBatchId).serialized,
    ];
    const invalidProofs = [
      {
        publicKey: proofs[0].publicKey,
        votingPower: proofs[0].votingPower,
        merkleProof: [],
      },
    ];

    await expect(
      prover.updateBatch(newBatch, signatures, invalidProofs)
    ).to.be.revertedWith('Invalid validator proof');

    const updatedBatch = await prover.currentBatch();
    expect(updatedBatch.batchHeight).to.equal(0);
  });

  it('should fail to update a batch if invalid signature', async () => {
    const { prover, wallets, proofs } = await loadFixture(deployProverFixture);

    const { newBatchId, newBatch } = generateNewBatchWithId();
    const signatures = [
      await wallets[1].signingKey.sign(newBatchId).serialized,
    ];

    await expect(
      prover.updateBatch(newBatch, signatures, [proofs[0]])
    ).to.be.revertedWith('Invalid signature');

    const updatedBatch = await prover.currentBatch();
    expect(updatedBatch.batchHeight).to.equal(0);
  });
});
