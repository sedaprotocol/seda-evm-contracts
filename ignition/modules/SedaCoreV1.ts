import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { ethers } from 'hardhat';

const SedaCoreV1Module = buildModule('SedaCoreV1', (m) => {
  // Constructor arguments
  const initialBatch = m.getParameter('initialBatch');

  // Deploy SedaDataTypes library
  const dataTypesLib = m.library('SedaDataTypes');

  // Deploy Secp256k1Prover contract
  const proverContract = m.contract('Secp256k1Prover', [initialBatch], {
    libraries: {
      SedaDataTypes: dataTypesLib,
    },
  });

  // Deploy SedaCoreV1 contract
  const coreV1Contract = m.contract('SedaCoreV1', [proverContract], {
    libraries: {
      SedaDataTypes: dataTypesLib,
    },
  });

  return { dataTypesLib, proverContract, coreV1Contract };
});

export default SedaCoreV1Module;
