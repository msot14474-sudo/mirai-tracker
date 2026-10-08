module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\.integration\.ts$',
  transform: { '^.+\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
};
