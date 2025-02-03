import type { CoreRequestTypes } from '../../ts-types';

export function convertPendingToRequestInputs(
  // biome-ignore lint/suspicious/noExplicitAny: Explicit any type is necessary to handle the unformatted tuple result
  pending: any,
): CoreRequestTypes.RequestInputsStruct {
  return {
    execProgramId: pending[1][1],
    execInputs: pending[1][2],
    execGasLimit: pending[1][3],
    tallyProgramId: pending[1][4],
    tallyInputs: pending[1][5].toString(),
    tallyGasLimit: pending[1][6],
    replicationFactor: Number(pending[1][7]),
    consensusFilter: pending[1][8].toString(),
    gasPrice: pending[1][9],
    memo: pending[1][10],
  };
}
