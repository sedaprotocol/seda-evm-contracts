module.exports = {
  mocha: {
    grep: '[Gg]as.*[Aa]nalysis',
    invert: true,
  },
  skipFiles: ['mocks/', 'interfaces/', 'libraries/SedaDataTypes.sol', 'test/MaliciousRecipient.sol'],
  modifierWhitelist: ['initializer', 'onlyInitializing'],
};
