import { readFile } from './io';

export async function readParams<T extends object>(
  filePath: string,
  requiredFields: string[],
  objectPath: string[],
): Promise<T> {
  // Read and parse JSON file
  let params: T;
  try {
    const fileContent = await readFile(filePath);
    const parsedJson = JSON.parse(fileContent);

    // Navigate through nested object structure with better error handling
    params = objectPath.reduce((obj, key) => {
      if (obj === undefined || obj === null) {
        throw new Error(`Invalid path: '${objectPath.join('.')}' - '${key}' not found`);
      }
      return obj[key];
    }, parsedJson);

    if (!params) {
      throw new Error(`No data found at path '${objectPath.join('.')}'`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read or parse params file: ${errorMessage}`);
  }

  // Validate JSON structure
  const missingFields = requiredFields.filter((field) => !(field in params));
  if (missingFields.length > 0) {
    throw new Error(`Invalid params configuration: missing required fields: ${missingFields.join(', ')}`);
  }

  return params as T;
}
