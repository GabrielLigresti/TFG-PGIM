import { abrirCentroTodoElDia, prisma } from './lib/base';

// Deja pgim_e2e como recién sembrada: migraciones (Prisma 7 no siembra solo), seed y Centro abierta todo
// el día. Corre en cada ejecución, así los specs se pueden repetir.
export default function globalSetup() {
  prisma('migrate', 'reset', '--force');
  prisma('db', 'seed');
  abrirCentroTodoElDia();
}
