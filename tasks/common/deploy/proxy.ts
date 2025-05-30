import type { Signer } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import type { ProverDataTypes } from '../../../ts-types';

export type UupsContracts = {
  Secp256k1ProverV1: {
    constructorArgs: [ProverDataTypes.BatchStruct, number, string];
  };
  Secp256k1ProverResettable: {
    constructorArgs: [ProverDataTypes.BatchStruct, number, string];
  };
  SedaCoreV1: {
    constructorArgs: [string, number];
  };
};

export async function deployProxyContract<T extends keyof UupsContracts>(
  hre: HardhatRuntimeEnvironment,
  contractName: T,
  constructorArgs: UupsContracts[T]['constructorArgs'],
  signer: Signer,
) {
  const ContractFactory = await hre.ethers.getContractFactory(contractName, signer);
  const contract = await hre.upgrades.deployProxy(ContractFactory, constructorArgs, {
    initializer: 'initialize',
    kind: 'uups',
  });
  await contract.waitForDeployment();

  const contractImplAddress = await hre.upgrades.erc1967.getImplementationAddress(await contract.getAddress());

  return {
    contract,
    contractImplAddress,
  };
}

export async function upgradeProxyContract(
  hre: HardhatRuntimeEnvironment,
  proxyAddress: string,
  contractName: string,
  signer: Signer,
) {
  const ContractFactory = await hre.ethers.getContractFactory(contractName, signer);
  const upgraded = await hre.upgrades.upgradeProxy(proxyAddress, ContractFactory, {
    kind: 'uups',
  });
  await upgraded.waitForDeployment();

  const contractImplAddress = await hre.upgrades.erc1967.getImplementationAddress(await upgraded.getAddress());

  return {
    contractImplAddress,
  };
}
