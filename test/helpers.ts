import { expect } from 'chai';
import type { CoreRequestTypes, CoreResultTypes, ProverDataTypes } from '../ts-types';

// Function to convert an unformatted tuple result to a formatted struct
export function convertToRequestInputs(
  // biome-ignore lint/suspicious/noExplicitAny: Explicit any type is necessary to handle the unformatted tuple result
  request: any,
): CoreRequestTypes.RequestInputsStruct {
  return {
    //version: unformatted[0],
    execProgramId: request[1],
    execInputs: request[2],
    execGasLimit: request[3],
    tallyProgramId: request[4],
    tallyInputs: request[5].toString(),
    tallyGasLimit: request[6],
    replicationFactor: Number(request[7]),
    consensusFilter: request[8].toString(),
    gasPrice: request[9],
    memo: request[10],
  };
}

// Helper function to compare two requests
export const compareRequests = (
  actual: CoreRequestTypes.RequestInputsStruct,
  expected: CoreRequestTypes.RequestInputsStruct,
) => {
  expect(actual.execProgramId).to.equal(expected.execProgramId);
  expect(actual.execInputs).to.equal(expected.execInputs);
  expect(actual.execGasLimit).to.equal(expected.execGasLimit);
  expect(actual.tallyProgramId).to.equal(expected.tallyProgramId);
  expect(actual.tallyInputs).to.equal(expected.tallyInputs);
  expect(actual.tallyGasLimit).to.equal(expected.tallyGasLimit);
  expect(actual.replicationFactor).to.equal(expected.replicationFactor);
  expect(actual.consensusFilter).to.equal(expected.consensusFilter);
  expect(actual.gasPrice).to.equal(expected.gasPrice);
  expect(actual.memo).to.equal(expected.memo);
};

// Helper function to compare two results
export const compareResults = (actual: CoreResultTypes.ResultStruct, expected: CoreResultTypes.ResultStruct) => {
  expect(actual.version).to.equal(expected.version);
  expect(actual.drId).to.equal(expected.drId);
  expect(actual.consensus).to.equal(expected.consensus);
  expect(actual.exitCode).to.equal(expected.exitCode);
  expect(actual.result).to.equal(expected.result);
  expect(actual.blockHeight).to.equal(expected.blockHeight);
  expect(actual.gasUsed).to.equal(expected.gasUsed);
  expect(actual.paybackAddress).to.equal(expected.paybackAddress);
  expect(actual.sedaPayload).to.equal(expected.sedaPayload);
};
