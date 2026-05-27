/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8084',
        changeOrigin: true,
      },
      '/graphql': {
        target: 'http://localhost:8084',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
