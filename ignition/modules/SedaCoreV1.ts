import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { ethers } from 'hardhat';

const SedaCoreV1Module = buildModule('SedaCoreV1', (m) => {
  // Constructor arguments
  const initialBatch = m.getParameter('initialBatch');

  // Deploy Secp256k1Prover contract
  const proverContract = m.contract('Secp256k1ProverV1');
  // Initialize the UUPS upgradeable contract
  m.call(proverContract, 'initialize', [initialBatch]);

  // Deploy SedaCoreV1 contract
  const coreV1Contract = m.contract('SedaCoreV1');
  // Initialize the UUPS upgradeable contract
  m.call(coreV1Contract, 'initialize', [proverContract]);

  return { proverContract, coreV1Contract };
});

export default SedaCoreV1Module;
