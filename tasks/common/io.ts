import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { logger } from './logger';

// Add this helper function at the top level
export async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to read file ${filePath}: ${errorMessage}`);
    throw new Error(`File read failed: ${errorMessage}`);
  }
}

export async function writeFile(filePath: string, data: object): Promise<void> {
  try {
    const relativePath = path.relative(process.cwd(), filePath);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    logger.success(`Updated ${relativePath}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write ${path.basename(filePath)}: ${errorMessage}`);
  }
}

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    logger.info(`Creating directory: ${dirPath}`);
    await fs.mkdir(dirPath, { recursive: true });
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export { path };
