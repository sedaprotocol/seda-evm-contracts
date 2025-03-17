import { expect } from 'chai';
import { ethers } from 'hardhat';
import type { SedaFeeManager } from '../../typechain-types';

describe('SedaFeeManager', () => {
  const deployFeeManagerFixture = async () => {
    const FeeManager = await ethers.getContractFactory('SedaFeeManager');
    const feeManager = (await FeeManager.deploy()) as SedaFeeManager;
    const [owner, recipient, otherAccount] = await ethers.getSigners();
    await feeManager.waitForDeployment();

    return { feeManager, owner, recipient, otherAccount };
  };

  describe('addPendingFees', () => {
    it('should add fees for a valid recipient', async () => {
      const { feeManager, recipient } = await deployFeeManagerFixture();
      const amount = ethers.parseEther('1.0');

      await expect(feeManager.addPendingFees(recipient.address, { value: amount }))
        .to.emit(feeManager, 'FeeAdded')
        .withArgs(recipient.address, amount);

      expect(await feeManager.getPendingFees(recipient.address)).to.equal(amount);
    });

    it('should accumulate multiple fee additions', async () => {
      const { feeManager, recipient } = await deployFeeManagerFixture();
      const amount1 = ethers.parseEther('1.0');
      const amount2 = ethers.parseEther('0.5');

      await feeManager.addPendingFees(recipient.address, { value: amount1 });
      await feeManager.addPendingFees(recipient.address, { value: amount2 });

      expect(await feeManager.getPendingFees(recipient.address)).to.equal(amount1 + amount2);
    });

    it('should revert for zero address recipient', async () => {
      const { feeManager } = await deployFeeManagerFixture();
      const amount = ethers.parseEther('1.0');

      await expect(feeManager.addPendingFees(ethers.ZeroAddress, { value: amount })).to.be.revertedWithCustomError(
        feeManager,
        'InvalidRecipient',
      );
    });

    it('should allow adding zero fees', async () => {
      const { feeManager, recipient } = await deployFeeManagerFixture();

      await expect(feeManager.addPendingFees(recipient.address, { value: 0 }))
        .to.emit(feeManager, 'FeeAdded')
        .withArgs(recipient.address, 0);

      expect(await feeManager.getPendingFees(recipient.address)).to.equal(0);
    });
  });

  describe('withdrawFees', () => {
    it('should change recipient balance correctly', async () => {
      const { feeManager, recipient } = await deployFeeManagerFixture();
      const amount = ethers.parseEther('1.0');

      await feeManager.addPendingFees(recipient.address, { value: amount });

      await expect(feeManager.connect(recipient).withdrawFees()).to.changeEtherBalance(recipient, amount);

      expect(await feeManager.getPendingFees(recipient.address)).to.equal(0);
    });

    it('should emit FeeWithdrawn event', async () => {
      const { feeManager, recipient } = await deployFeeManagerFixture();
      const amount = ethers.parseEther('1.0');

      await feeManager.addPendingFees(recipient.address, { value: amount });

      await expect(feeManager.connect(recipient).withdrawFees())
        .to.emit(feeManager, 'FeeWithdrawn')
        .withArgs(recipient.address, amount);
    });

    it('should revert when no fees are available', async () => {
      const { feeManager, recipient } = await deployFeeManagerFixture();

      await expect(feeManager.connect(recipient).withdrawFees()).to.be.revertedWithCustomError(
        feeManager,
        'NoFeesToWithdraw',
      );
    });

    it('should revert when recipient cannot receive ETH', async () => {
      const { feeManager } = await deployFeeManagerFixture();

      // Deploy a contract that rejects ETH transfers
      const MaliciousRecipient = await ethers.getContractFactory('MaliciousRecipient');
      const maliciousRecipient = await MaliciousRecipient.deploy();
      await maliciousRecipient.waitForDeployment();

      // Add fees for the malicious contract
      const amount = ethers.parseEther('1.0');
      await feeManager.addPendingFees(await maliciousRecipient.getAddress(), { value: amount });

      // Attempt to withdraw should fail
      await expect(maliciousRecipient.withdrawFeesFrom(await feeManager.getAddress())).to.be.revertedWithCustomError(
        feeManager,
        'FeeTransferFailed',
      );
    });

    it('should handle multiple withdrawals correctly', async () => {
      const { feeManager, recipient } = await deployFeeManagerFixture();
      const amount1 = ethers.parseEther('1.0');
      const amount2 = ethers.parseEther('0.5');

      // First deposit and withdrawal
      await feeManager.addPendingFees(recipient.address, { value: amount1 });
      await feeManager.connect(recipient).withdrawFees();

      // Second deposit
      await feeManager.addPendingFees(recipient.address, { value: amount2 });

      // Check balance change for second withdrawal
      await expect(feeManager.connect(recipient).withdrawFees()).to.changeEtherBalance(recipient, amount2);

      // Check final state
      expect(await feeManager.getPendingFees(recipient.address)).to.equal(0);
    });
  });

  describe('getPendingFees', () => {
    it('should return correct pending fees amount', async () => {
      const { feeManager, recipient } = await deployFeeManagerFixture();
      const amount = ethers.parseEther('1.0');

      await feeManager.addPendingFees(recipient.address, { value: amount });
      expect(await feeManager.getPendingFees(recipient.address)).to.equal(amount);
    });

    it('should return zero for address with no fees', async () => {
      const { feeManager, recipient } = await deployFeeManagerFixture();
      expect(await feeManager.getPendingFees(recipient.address)).to.equal(0);
    });
  });

  describe('addPendingFeesMultiple', () => {
    it('should add fees for multiple valid recipients', async () => {
      const { feeManager, recipient, otherAccount } = await deployFeeManagerFixture();
      const amount1 = ethers.parseEther('1.0');
      const amount2 = ethers.parseEther('0.5');
      const totalAmount = amount1 + amount2;

      await expect(
        feeManager.addPendingFeesMultiple([recipient.address, otherAccount.address], [amount1, amount2], {
          value: totalAmount,
        }),
      )
        .to.emit(feeManager, 'FeeAdded')
        .withArgs(recipient.address, amount1)
        .to.emit(feeManager, 'FeeAdded')
        .withArgs(otherAccount.address, amount2);

      expect(await feeManager.getPendingFees(recipient.address)).to.equal(amount1);
      expect(await feeManager.getPendingFees(otherAccount.address)).to.equal(amount2);
    });

    it('should revert when array lengths mismatch', async () => {
      const { feeManager, recipient, otherAccount } = await deployFeeManagerFixture();
      const amount = ethers.parseEther('1.0');

      await expect(
        feeManager.addPendingFeesMultiple([recipient.address, otherAccount.address], [amount], { value: amount }),
      ).to.be.revertedWithCustomError(feeManager, 'ArrayLengthMismatch');
    });

    it('should revert when a recipient is zero address', async () => {
      const { feeManager, recipient } = await deployFeeManagerFixture();
      const amount1 = ethers.parseEther('0.5');
      const amount2 = ethers.parseEther('0.5');
      const totalAmount = amount1 + amount2;

      await expect(
        feeManager.addPendingFeesMultiple([recipient.address, ethers.ZeroAddress], [amount1, amount2], {
          value: totalAmount,
        }),
      ).to.be.revertedWithCustomError(feeManager, 'InvalidRecipient');
    });

    it('should revert when fee amount does not match sent value', async () => {
      const { feeManager, recipient, otherAccount } = await deployFeeManagerFixture();
      const amount1 = ethers.parseEther('1.0');
      const amount2 = ethers.parseEther('0.5');
      const totalAmount = ethers.parseEther('2.0'); // Intentionally incorrect

      await expect(
        feeManager.addPendingFeesMultiple([recipient.address, otherAccount.address], [amount1, amount2], {
          value: totalAmount,
        }),
      ).to.be.revertedWithCustomError(feeManager, 'FeeAmountMismatch');
    });

    it('should accumulate fees for existing recipients', async () => {
      const { feeManager, recipient } = await deployFeeManagerFixture();
      const initialAmount = ethers.parseEther('1.0');
      const additionalAmount = ethers.parseEther('0.5');

      // Add initial fees
      await feeManager.addPendingFees(recipient.address, { value: initialAmount });

      // Add more fees using addPendingFeesMultiple
      await feeManager.addPendingFeesMultiple([recipient.address], [additionalAmount], { value: additionalAmount });

      expect(await feeManager.getPendingFees(recipient.address)).to.equal(initialAmount + additionalAmount);
    });
  });
});
