module.exports = {
  mocha: {
    grep: '[Gg]as.*[Aa]nalysis',
    invert: true,
  },
  skipFiles: ['mocks/', 'interfaces/', 'libraries/', 'test/'],
  modifierWhitelist: ['initializer', 'onlyInitializing'],
};
