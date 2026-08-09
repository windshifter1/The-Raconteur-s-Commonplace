import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  base: process.env.VITE_BASE || '/The-Raconteur-s-Commonplace/full/',
  plugins: [react()],
  envDir: resolve(__dirname, '..'),
  build: {
    outDir: resolve(__dirname, '../kobo-dist/full'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    open: false,
  },
});
