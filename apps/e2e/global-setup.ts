import { abrirCentroTodoElDia, prisma } from './lib/base';

// Deja pgim_e2e lista para correr: migraciones, seed y Centro abierta todo el
// día. No borra datos (el resguardo de Prisma no permite resetear desde un
// agente, y no hace falta): el seed es repetible, el comensal del camino
// principal es único por corrida y la mesa se cierra al final.
export default function globalSetup() {
  prisma('migrate', 'deploy');
  prisma('db', 'seed');
  abrirCentroTodoElDia();
}
