import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_URL = 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Escucha en la red local para poder abrir la app desde un celular.
    host: true,
    // Quick tunnel de Cloudflare (HTTPS): la URL cambia en cada arranque.
    allowedHosts: ['.trycloudflare.com'],
    // En desarrollo, la API y Socket.IO se sirven por el mismo origen que el front.
    // xfwd agrega la IP del cliente a X-Forwarded-For para que la API la vea.
    proxy: {
      '/api': { target: API_URL, xfwd: true },
      '/socket.io': { target: API_URL, ws: true, xfwd: true },
    },
  },
});
