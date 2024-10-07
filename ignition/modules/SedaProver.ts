import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const SedaProverModule = buildModule('SedaProverModule', (m) => {
  const owner = m.getParameter('owner', m.getAccount(0));
  const relayers = [owner];
  const maxReplicationFactor = m.getParameter('maxReplicationFactor', 1);

  const sedaProver = m.contract('SedaProver', [
    owner,
    relayers,
    maxReplicationFactor,
  ]);

  return { sedaProver: sedaProver };
});

export default SedaProverModule;
