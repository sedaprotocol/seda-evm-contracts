import type { Artifact, BuildInfo } from 'hardhat/types';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CONFIG } from './config';
import { path, ensureDirectoryExists, writeFile } from './io';

export async function updateDeployment(hre: HardhatRuntimeEnvironment, contractName: string) {
  const deploymentsDir = path.join(process.cwd(), CONFIG.DEPLOYMENTS.FOLDER);
  await ensureDirectoryExists(deploymentsDir);

  const networkId = `${hre.network.name}-${(await hre.ethers.provider.getNetwork()).chainId.toString()}`;
  const networkDeployDir = path.join(deploymentsDir, networkId);
  const artifactsDir = path.join(networkDeployDir, CONFIG.DEPLOYMENTS.FILES.ARTIFACTS);

  await Promise.all([ensureDirectoryExists(networkDeployDir), ensureDirectoryExists(artifactsDir)]);

  await Promise.all([
    writeBuildInfoToFile(hre, contractName, networkDeployDir),
    writeArtifactToFile(hre, contractName, artifactsDir),
  ]);
}

async function writeArtifactToFile(hre: HardhatRuntimeEnvironment, contractName: string, artifactDir: string) {
  try {
    ensureDirectoryExists(artifactDir);
    const artifact: Artifact = await hre.artifacts.readArtifact(contractName);
    const artifactPath = path.join(artifactDir, `${contractName}.json`);
    await writeFile(artifactPath, artifact);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Artifact generation failed: ${errorMessage}`);
  }
}

async function writeBuildInfoToFile(hre: HardhatRuntimeEnvironment, contractName: string, folderPath: string) {
  ensureDirectoryExists(folderPath);

  const buildInfo: BuildInfo | undefined = await hre.artifacts.getBuildInfo(await findBuildInfoPath(hre, contractName));

  if (!buildInfo) {
    throw new Error(`Build info not found for ${contractName}`);
  }

  const buildInfoPath = path.join(folderPath, `${contractName}.buildinfo`);
  await writeFile(buildInfoPath, buildInfo);
}

async function findBuildInfoPath(hre: HardhatRuntimeEnvironment, contractName: string): Promise<string> {
  const fullNames = await hre.artifacts.getAllFullyQualifiedNames();
  const contractPath = fullNames.find((name) => name.endsWith(`${contractName}.sol:${contractName}`));

  if (!contractPath) {
    throw new Error(`Contract ${contractName} not found in artifacts`);
  }

  return contractPath;
}
