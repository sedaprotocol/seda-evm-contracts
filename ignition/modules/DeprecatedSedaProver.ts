import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const DeprecatedSedaProverModule = buildModule('DeprecatedSedaProver', (m) => {
  // Constructor arguments
  const relayers = [m.getAccount(0)];
  const maxReplicationFactor = m.getParameter('maxReplicationFactor', 1);

  // Deploy SedaDataTypes library
  // const dataTypesLib = m.library('contracts/deprecated/SedaProver.sol:SedaDataTypes');

  // Deploy SedaCorePermissioned contract with the library
  const coreContract = m.contract('SedaProver', [
    m.getAccount(0),
    relayers,
    maxReplicationFactor,
  ]);

  return { coreContract };
});

export default DeprecatedSedaProverModule;
