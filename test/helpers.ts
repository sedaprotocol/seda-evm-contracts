import { expect } from 'chai';

import type { SedaDataTypes } from '../typechain-types/contracts/libraries/SedaDataTypes';

// Helper function to compare two requests
export const compareRequests = (
  actual: SedaDataTypes.RequestInputsStruct,
  expected: SedaDataTypes.RequestInputsStruct
) => {
  expect(actual.execProgramId).to.equal(expected.execProgramId);
  expect(actual.execInputs).to.equal(expected.execInputs);
  expect(actual.tallyProgramId).to.equal(expected.tallyProgramId);
  expect(actual.tallyInputs).to.equal(expected.tallyInputs);
  expect(actual.replicationFactor).to.equal(expected.replicationFactor);
  expect(actual.consensusFilter).to.equal(expected.consensusFilter);
  expect(actual.gasPrice).to.equal(expected.gasPrice);
  expect(actual.gasLimit).to.equal(expected.gasLimit);
  expect(actual.memo).to.equal(expected.memo);
};

// Helper function to compare two results
export const compareResults = (
  actual: SedaDataTypes.ResultStruct,
  expected: SedaDataTypes.ResultStruct
) => {
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

// Helper function to compare two batches
export const compareBatches = (
  actual: SedaDataTypes.BatchStruct,
  expected: SedaDataTypes.BatchStruct
) => {
  expect(actual.batchHeight).to.equal(expected.batchHeight);
  expect(actual.blockHeight).to.equal(expected.blockHeight);
  expect(actual.validatorRoot).to.equal(expected.validatorRoot);
  expect(actual.resultsRoot).to.equal(expected.resultsRoot);
  expect(actual.provingMetadata).to.equal(expected.provingMetadata);
};