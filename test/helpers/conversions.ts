import type { CoreRequestTypes } from '../../ts-types';

export function convertPendingToRequestInputs(
  // biome-ignore lint/suspicious/noExplicitAny: Explicit any type is necessary to handle the unformatted tuple result
  pending: any,
): CoreRequestTypes.RequestInputsStruct {
  return {
    execProgramId: pending[1][0],
    tallyProgramId: pending[1][1],
    gasPrice: pending[1][2],
    execGasLimit: pending[1][3],
    tallyGasLimit: pending[1][4],
    replicationFactor: Number(pending[1][5]),
    execInputs: pending[1][7],
    tallyInputs: pending[1][8].toString(),
    consensusFilter: pending[1][9].toString(),
    memo: pending[1][10],
  };
}
