/** @type {import('jest').Config} */
// Tests de repositorio contra Postgres real (base pgim_test). Se corren con
// `npm run test:db`; `npm test` los ignora.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.db.test.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  globalSetup: '<rootDir>/src/test/db-global-setup.js',
};
