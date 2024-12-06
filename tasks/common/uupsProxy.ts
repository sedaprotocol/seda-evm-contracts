import type { Signer } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { ProverDataTypes } from '../../ts-types';

type Contracts = {
  Secp256k1ProverV1: {
    constructorArgs: [ProverDataTypes.BatchStruct];
  };
  SedaCoreV1: {
    constructorArgs: [string];
  };
};

export async function deployProxyContract<T extends keyof Contracts>(
  hre: HardhatRuntimeEnvironment,
  contractName: T,
  constructorArgs: Contracts[T]['constructorArgs'],
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
