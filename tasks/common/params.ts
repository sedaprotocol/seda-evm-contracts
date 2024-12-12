import * as v from 'valibot';

import { readFile } from './io';

export const HexString = v.pipe(v.string(), v.regex(/^0x[0-9a-fA-F]*$/, 'Invalid hex string'));

type ValidationIssue = v.BaseIssue<unknown>;
export type ParamsSchema<TInput, TOutput> = v.BaseSchema<TInput, TOutput, ValidationIssue>;

export async function readParams<TInput, TOutput>(
  filePath: string,
  key: string,
  schema: ParamsSchema<TInput, TOutput>,
): Promise<TOutput> {
  try {
    const fileContent = await readFile(filePath);
    const parsedJson = JSON.parse(fileContent);

    if (!(key in parsedJson)) {
      throw new Error(`Key "${key}" not found in params file`);
    }

    const data = parsedJson[key];
    return v.parse(schema, data);
  } catch (error) {
    if (error instanceof v.ValiError) {
      throw new Error(`Validation error for key "${key}": \n${JSON.stringify(v.flatten(error.issues), null, 2)}`);
    }
    throw new Error(`Failed to read or validate params: ${error instanceof Error ? error.message : String(error)}`);
  }
}
