import * as v from 'valibot';
import { readFile } from '../io';

const HexString = v.pipe(v.string(), v.regex(/^0x[0-9a-fA-F]*$/, 'Invalid hex string'));

export const ParamsSchema = v.partial(
  v.object({
    SedaCoreV1: v.object({
      sedaProverAddress: HexString,
    }),
    Secp256k1ProverV1: v.object({
      initialBatch: v.object({
        batchHeight: v.number(),
        blockHeight: v.number(),
        validatorsRoot: HexString,
        resultsRoot: HexString,
        provingMetadata: HexString,
      }),
    }),
    SedaPermissioned: v.object({
      maxReplicationFactor: v.number(),
    }),
    Secp256k1ProverResettable: v.object({
      initialBatch: v.object({
        batchHeight: v.number(),
        blockHeight: v.number(),
        validatorsRoot: HexString,
        resultsRoot: HexString,
        provingMetadata: HexString,
      }),
    }),
  }),
);

export async function readParams(filePath: string): Promise<v.InferOutput<typeof ParamsSchema>> {
  try {
    const fileContent = await readFile(filePath);
    const parsedJson = JSON.parse(fileContent);

    return v.parse(ParamsSchema, parsedJson);
  } catch (error: unknown) {
    if (error instanceof v.ValiError) {
      throw new Error(`Failed to read or parse params file: ${v.flatten(error.issues)}`);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read or parse params file: ${errorMessage}`);
  }
}
