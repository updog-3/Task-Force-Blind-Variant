import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const server = `http://localhost:${process.env.PORT ?? 3000}`;

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    host: true,
    fs: { allow: ['..'] },
    proxy: {
      '/api': server,
      '/maps': server,
      '/ws': { target: server, ws: true },
    },
  },
});
