import { defineConfig } from 'tsup';

// Se publica en ESM (web) y CommonJS (api), con sus declaraciones de tipos.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
