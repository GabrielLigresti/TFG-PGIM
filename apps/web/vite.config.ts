import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_URL = 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // En desarrollo, la API y Socket.IO se sirven por el mismo origen que el front.
    proxy: {
      '/api': API_URL,
      '/socket.io': { target: API_URL, ws: true },
    },
  },
});
