import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import type { MockSecp256k1ProverV2, Secp256k1ProverResettable } from '../../typechain-types';
import { deployWithSize } from '../helpers/fixtures';
import { generateNewBatchWithId } from '../utils/crypto';

describe('Proxy: Secp256k1Prover', () => {
  async function deployProxyFixture() {
    const [owner, nonOwner] = await ethers.getSigners();

    // Use deployWithSize instead of manual initialization
    const { prover: proxy, data } = await deployWithSize({
      requests: 5, // Smaller test set is fine for proxy tests
      validators: 4,
    });

    // Get V2 factories
    const ProverV2Factory = await ethers.getContractFactory('MockSecp256k1ProverV2', owner);
    const ProverResettableFactory = await ethers.getContractFactory('Secp256k1ProverResettable', owner);

    return {
      proxy,
      ProverV2Factory,
      ProverResettableFactory,
      owner,
      nonOwner,
      initialBatch: data.initialBatch,
    };
  }

  describe('upgrade V1 to V2', () => {
    it('maintains state and ownership after upgrade', async () => {
      const { proxy, ProverV2Factory, owner, initialBatch } = await loadFixture(deployProxyFixture);

      // Check initial state
      expect(await proxy.getLastBatchHeight()).to.equal(initialBatch.batchHeight);
      expect(await proxy.owner()).to.equal(owner.address);

      // Upgrade to V2
      const proxyV2 = await upgrades.upgradeProxy(await proxy.getAddress(), ProverV2Factory);

      // Verify state preservation
      expect(await proxyV2.getLastBatchHeight()).to.equal(initialBatch.batchHeight);
      expect(await proxyV2.owner()).to.equal(owner.address);
    });

    it('adds new functionality after upgrade', async () => {
      const { proxy, ProverV2Factory } = await loadFixture(deployProxyFixture);

      // Verify V1 doesn't have getVersion()
      const V1Contract = proxy.connect(await ethers.provider.getSigner());
      // @ts-expect-error - getVersion shouldn't exist on V1
      expect(V1Contract.getVersion).to.be.undefined;

      // Upgrade and verify new functionality
      const proxyV2 = await upgrades.upgradeProxy(await proxy.getAddress(), ProverV2Factory);
      await proxyV2.initialize();
      expect(await proxyV2.getVersion()).to.equal('2.0.0');
    });

    it('prevents non-owner initialization', async () => {
      const { proxy, ProverV2Factory, nonOwner } = await loadFixture(deployProxyFixture);

      const proxyV2 = (await upgrades.upgradeProxy(
        await proxy.getAddress(),
        ProverV2Factory,
      )) as unknown as MockSecp256k1ProverV2;

      await expect(proxyV2.connect(nonOwner)['initialize()']()).to.be.revertedWithCustomError(
        proxyV2,
        'OwnableUnauthorizedAccount',
      );
    });

    it('prevents double initialization', async () => {
      const { proxy, ProverV2Factory } = await loadFixture(deployProxyFixture);

      const proxyV2 = await upgrades.upgradeProxy(await proxy.getAddress(), ProverV2Factory);
      await proxyV2.initialize();

      await expect(proxyV2.initialize()).to.be.revertedWithCustomError(proxyV2, 'InvalidInitialization');
    });
  });

  describe('resettable variant', () => {
    it('allows owner to reset state with valid batch', async () => {
      const { proxy, ProverResettableFactory, initialBatch } = await loadFixture(deployProxyFixture);
      const proxyV2Resettable = await upgrades.upgradeProxy(await proxy.getAddress(), ProverResettableFactory);

      // Use generateNewBatchWithId instead of manual creation
      const { newBatch } = generateNewBatchWithId(initialBatch);
      // Add random roots
      newBatch.validatorsRoot = ethers.hexlify(ethers.randomBytes(32));
      newBatch.resultsRoot = ethers.hexlify(ethers.randomBytes(32));

      const tx = await proxyV2Resettable.resetProverState(newBatch);

      // Verify state changes
      expect(await proxyV2Resettable.getLastBatchHeight()).to.equal(newBatch.batchHeight);
      expect(await proxyV2Resettable.getLastValidatorsRoot()).to.equal(newBatch.validatorsRoot);

      // Verify event emission
      await expect(tx).to.emit(proxyV2Resettable, 'BatchPosted');
    });

    it('prevents non-owner from resetting state', async () => {
      const { proxy, ProverResettableFactory, nonOwner, initialBatch } = await loadFixture(deployProxyFixture);
      const proxyV2Resettable = (await upgrades.upgradeProxy(
        await proxy.getAddress(),
        ProverResettableFactory,
      )) as unknown as Secp256k1ProverResettable;

      await expect(proxyV2Resettable.connect(nonOwner).resetProverState(initialBatch)).to.be.revertedWithCustomError(
        proxyV2Resettable,
        'OwnableUnauthorizedAccount',
      );
    });
  });
});
