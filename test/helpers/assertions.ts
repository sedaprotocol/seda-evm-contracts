import { expect } from 'chai';
import type { CoreRequestTypes, CoreResultTypes } from '../../ts-types';

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
