import type { Signer } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';

export async function deployProxyContract(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  constructorArgs: unknown[],
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
