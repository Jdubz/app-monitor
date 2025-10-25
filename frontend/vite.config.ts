import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { jsonLogger } from './vite-plugin-json-logger';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    jsonLogger({
      serviceName: 'app-monitor-frontend',
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
});
