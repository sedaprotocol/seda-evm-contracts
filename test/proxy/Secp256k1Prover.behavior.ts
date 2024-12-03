import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { generateDataFixtures } from '../utils';

describe('Proxy: Secp256k1Prover', () => {
  async function deployProxyFixture() {
    const [owner] = await ethers.getSigners();

    // Generate initial batch data
    const initialBatch = {
      batchHeight: 0,
      blockHeight: 0,
      validatorsRoot: ethers.ZeroHash,
      resultsRoot: ethers.ZeroHash,
      provingMetadata: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    };

    // Deploy V1 through proxy
    const ProverV1Factory = await ethers.getContractFactory('Secp256k1ProverV1', owner);
    const proxy = await upgrades.deployProxy(ProverV1Factory, [initialBatch], { initializer: 'initialize' });
    await proxy.waitForDeployment();

    // Get V2 factory
    const ProverV2Factory = await ethers.getContractFactory('MockSecp256k1ProverV2', owner);

    return { proxy, ProverV2Factory, initialBatch };
  }

  describe('upgrade', () => {
    it('should maintain state after upgrade', async () => {
      const { proxy, ProverV2Factory, initialBatch } = await loadFixture(deployProxyFixture);

      // Check initial state
      const heightBeforeUpgrade = await proxy.getLastBatchHeight();
      expect(heightBeforeUpgrade).to.equal(initialBatch.batchHeight);

      // Upgrade to V2
      const proxyV2 = await upgrades.upgradeProxy(await proxy.getAddress(), ProverV2Factory);

      // Check state is maintained
      const heightAfterUpgrade = await proxyV2.getLastBatchHeight();
      expect(heightAfterUpgrade).to.equal(heightBeforeUpgrade);
    });

    it('should maintain owner after upgrade', async () => {
      const { proxy, ProverV2Factory } = await loadFixture(deployProxyFixture);
      const [owner] = await ethers.getSigners();

      // Check owner before upgrade
      const ownerBeforeUpgrade = await proxy.owner();
      expect(ownerBeforeUpgrade).to.equal(owner.address);

      // Upgrade to V2
      const proxyV2 = await upgrades.upgradeProxy(await proxy.getAddress(), ProverV2Factory);

      // Check owner is maintained after upgrade
      const ownerAfterUpgrade = await proxyV2.owner();
      expect(ownerAfterUpgrade).to.equal(owner.address);
    });

    it('should have new functionality after upgrade', async () => {
      const { proxy, ProverV2Factory } = await loadFixture(deployProxyFixture);

      // Verify V1 doesn't have getVersion()
      const V1Contract = proxy.connect(await ethers.provider.getSigner());
      // @ts-expect-error - getVersion shouldn't exist on V1
      expect(V1Contract.getVersion).to.be.undefined;

      // Upgrade to V2
      const proxyV2 = await upgrades.upgradeProxy(await proxy.getAddress(), ProverV2Factory);
      await proxyV2.initialize();

      // Check new V2 functionality
      const version = await proxyV2.getVersion();
      expect(version).to.equal('2.0.0');
    });
  });
});
