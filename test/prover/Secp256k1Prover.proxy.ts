import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import type { MockSecp256k1ProverV2, Secp256k1ProverV2Resettable } from '../../typechain-types';
import { generateNewBatchWithId } from '../utils';

describe('Proxy: Secp256k1Prover', () => {
  async function deployProxyFixture() {
    const [owner, nonOwner] = await ethers.getSigners();
    const initialBatch = {
      batchHeight: 1,
      blockHeight: 1,
      validatorsRoot: ethers.ZeroHash,
      resultsRoot: ethers.ZeroHash,
      provingMetadata: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    };

    // Deploy V1 through proxy
    const ProverV1Factory = await ethers.getContractFactory('Secp256k1ProverV1', owner);
    const proxy = await upgrades.deployProxy(ProverV1Factory, [initialBatch], { initializer: 'initialize' });
    await proxy.waitForDeployment();

    // Get V2 factories
    const ProverV2Factory = await ethers.getContractFactory('MockSecp256k1ProverV2', owner);
    const ResettableV2Factory = await ethers.getContractFactory('Secp256k1ProverV2Resettable', owner);

    return { proxy, ProverV2Factory, ResettableV2Factory, owner, nonOwner, initialBatch };
  }

  describe('V1 to V2 upgrade', () => {
    it('should maintain state and ownership after upgrade', async () => {
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

    it('should add new functionality after upgrade', async () => {
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

    it('should prevent non-owner initialization', async () => {
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

    it('should prevent double initialization', async () => {
      const { proxy, ProverV2Factory } = await loadFixture(deployProxyFixture);

      const proxyV2 = await upgrades.upgradeProxy(await proxy.getAddress(), ProverV2Factory);
      await proxyV2.initialize();

      await expect(proxyV2.initialize()).to.be.revertedWithCustomError(proxyV2, 'InvalidInitialization');
    });
  });

  describe('Resettable variant', () => {
    it('should allow owner to reset state with valid batch', async () => {
      const { proxy, ResettableV2Factory, initialBatch } = await loadFixture(deployProxyFixture);
      const proxyV2Resettable = await upgrades.upgradeProxy(await proxy.getAddress(), ResettableV2Factory);

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

    it('should prevent non-owner from resetting state', async () => {
      const { proxy, ResettableV2Factory, nonOwner, initialBatch } = await loadFixture(deployProxyFixture);
      const proxyV2Resettable = (await upgrades.upgradeProxy(
        await proxy.getAddress(),
        ResettableV2Factory,
      )) as unknown as Secp256k1ProverV2Resettable;

      await expect(proxyV2Resettable.connect(nonOwner).resetProverState(initialBatch)).to.be.revertedWithCustomError(
        proxyV2Resettable,
        'OwnableUnauthorizedAccount',
      );
    });
  });
});
