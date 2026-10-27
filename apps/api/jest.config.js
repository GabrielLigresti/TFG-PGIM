/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Los *.db.test.ts necesitan la base de prueba: van con jest.db.config.js.
  testPathIgnorePatterns: ['/node_modules/', '\\.db\\.test\\.ts$'],
  // El cliente que genera Prisma importa sus módulos con extensión .js.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
};
