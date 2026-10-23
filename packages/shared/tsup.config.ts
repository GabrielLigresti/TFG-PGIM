import { defineConfig } from 'tsup';

// Se publica en ESM (web) y CommonJS (api), con sus declaraciones de tipos.
// En watch no se vacía dist/: la API (tsx watch) lo carga mientras tsup
// recompila y se caería con "Cannot find module .../dist/index.cjs".
export default defineConfig((opciones) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: !opciones.watch,
  sourcemap: true,
}));
