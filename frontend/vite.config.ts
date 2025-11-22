import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { jsonLogger } from './vite-plugin-json-logger';
import path from 'path';

// Get backend URL from environment, defaulting to dev server
// Support both VITE_API_BASE_URL (E2E tests) and VITE_BACKEND_URL (legacy)
const backendUrl = process.env.VITE_API_BASE_URL || process.env.VITE_BACKEND_URL || 'http://localhost:5000';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    jsonLogger({
      serviceName: 'app-monitor-frontend',
      logFile: './logs/frontend.log',
    }),
  ],
  define: {
    'BUILD_TIMESTAMP_VALUE': JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
});
