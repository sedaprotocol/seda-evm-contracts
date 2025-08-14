import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { deployWithOptions } from '../helpers/fixtures';

describe('Proxy: SedaCore', () => {
  async function deployProxyFixture() {
    const [owner] = await ethers.getSigners();
    const { core, prover } = await deployWithOptions({ requests: 1 });

    // Get V2 factory
    const CoreV2Factory = await ethers.getContractFactory('MockSedaCoreV2', owner);

    return { prover, core, CoreV2Factory };
  }

  describe('upgrade', () => {
    it('maintains state after upgrade', async () => {
      const { prover, core, CoreV2Factory } = await loadFixture(deployProxyFixture);

      // Check initial state (using a relevant state variable from your SedaCore)
      const stateBeforeUpgrade = await core.getSedaProver();
      expect(stateBeforeUpgrade).to.equal(await prover.getAddress());

      // Upgrade to V2
      const proxyV2 = await upgrades.upgradeProxy(await core.getAddress(), CoreV2Factory);

      // Check state is maintained
      const stateAfterUpgrade = await proxyV2.getSedaProver();
      expect(stateAfterUpgrade).to.equal(stateBeforeUpgrade);
    });

    it('maintains owner after upgrade', async () => {
      const { core: proxy, CoreV2Factory } = await loadFixture(deployProxyFixture);
      const [owner] = await ethers.getSigners();

      // Check owner before upgrade
      const ownerBeforeUpgrade = await proxy.owner();
      expect(ownerBeforeUpgrade).to.equal(owner.address);

      // Upgrade to V2
      const proxyV2 = await upgrades.upgradeProxy(await proxy.getAddress(), CoreV2Factory);

      // Check owner is maintained after upgrade
      const ownerAfterUpgrade = await proxyV2.owner();
      expect(ownerAfterUpgrade).to.equal(owner.address);
    });

    it('adds new functionality after upgrade', async () => {
      const { core: proxy, CoreV2Factory } = await loadFixture(deployProxyFixture);

      // Verify V1 doesn't have getVersion()
      const V1Contract = proxy.connect(await ethers.provider.getSigner());
      // @ts-expect-error - getVersion shouldn't exist on V1
      expect(V1Contract.getVersion).to.be.undefined;

      // Upgrade to V2
      const proxyV2 = await upgrades.upgradeProxy(await proxy.getAddress(), CoreV2Factory);
      await proxyV2.getFunction('initialize')();

      // Check new V2 functionality
      const version = await proxyV2.getVersion();
      expect(version).to.equal('2.0.0');
    });

    it('prevents non-owner from upgrading the proxy', async () => {
      const { core: proxy, CoreV2Factory } = await loadFixture(deployProxyFixture);
      const [, nonOwner] = await ethers.getSigners();

      await expect(
        upgrades.upgradeProxy(await proxy.getAddress(), CoreV2Factory.connect(nonOwner)),
      ).to.be.revertedWithCustomError(proxy, 'OwnableUnauthorizedAccount');
    });
  });
});
