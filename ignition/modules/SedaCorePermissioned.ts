import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const SedaProverModule = buildModule('SedaCorePermissioned', (m) => {
  // Constructor arguments
  const relayers = [m.getAccount(0)];
  const maxReplicationFactor = m.getParameter('maxReplicationFactor');

  // Deploy SedaDataTypes library
  const dataTypesLib = m.library('SedaDataTypes');

  // Deploy SedaCorePermissioned contract with the library
  const coreContract = m.contract('SedaCorePermissioned', [relayers, maxReplicationFactor], {
    libraries: { SedaDataTypes: dataTypesLib },
  });

  return { coreContract };
});

export default SedaProverModule;
