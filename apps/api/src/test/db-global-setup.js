const { execSync } = require('node:child_process');
const path = require('node:path');

// Aplica las migraciones a la base de prueba antes de correr los tests. La URL
// la fija el script test:db; nunca se toca la base de desarrollo.
module.exports = async () => {
  if (!process.env.DATABASE_URL?.includes('pgim_test')) {
    throw new Error('test:db solo corre contra una base pgim_test');
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    env: process.env,
    stdio: 'pipe',
  });
};
