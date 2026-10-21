/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // El cliente que genera Prisma importa sus módulos con extensión .js.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
};
