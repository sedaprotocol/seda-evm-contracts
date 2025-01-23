import type { CoreRequestTypes } from '../../ts-types';

export function convertPendingToRequestInputs(
  // biome-ignore lint/suspicious/noExplicitAny: Explicit any type is necessary to handle the unformatted tuple result
  pending: any,
): CoreRequestTypes.RequestInputsStruct {
  return {
    execProgramId: pending[0][1],
    execInputs: pending[0][2],
    execGasLimit: pending[0][3],
    tallyProgramId: pending[0][4],
    tallyInputs: pending[0][5].toString(),
    tallyGasLimit: pending[0][6],
    replicationFactor: Number(pending[0][7]),
    consensusFilter: pending[0][8].toString(),
    gasPrice: pending[0][9],
    memo: pending[0][10],
  };
}
