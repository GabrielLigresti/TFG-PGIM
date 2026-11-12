import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  DATABASE_URL,
  JWT_SECRET_E2E,
  PUERTO_API,
  PUERTO_WEB,
  RAIZ_API,
  URL_WEB,
} from './lib/base';

// Prueba integral: levanta la API (sin credenciales MP_*, así que la pasarela
// de prueba aprueba al instante) y la web, con una base propia.
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: URL_WEB,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // env -u: aunque la terminal tenga las MP_*, la API arranca con la pasarela de prueba.
      command: 'env -u MP_ACCESS_TOKEN -u MP_WEBHOOK_SECRET -u PUBLIC_URL npx tsx src/server.ts',
      cwd: RAIZ_API,
      url: `http://localhost:${PUERTO_API}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'development',
        PORT: String(PUERTO_API),
        DATABASE_URL,
        JWT_SECRET: JWT_SECRET_E2E,
        // Ignora el .env de desarrollo: todo viene de acá.
        DOTENV_CONFIG_PATH: '/nonexistent.env',
      },
    },
    {
      // env -u: sin client ID de Google, la web no muestra el botón aunque la terminal lo tenga.
      command: `env -u VITE_GOOGLE_CLIENT_ID npx vite --port ${PUERTO_WEB} --strictPort`,
      cwd: resolve(__dirname, '../web'),
      url: URL_WEB,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_URL: `http://localhost:${PUERTO_API}` },
    },
  ],
});
