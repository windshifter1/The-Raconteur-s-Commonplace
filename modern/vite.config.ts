import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// GitHub project pages: https://windshifter1.github.io/The-Raconteur-s-Commonplace/
// Override with BASE_PATH=/ for a custom domain or user/org site root.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  root,
  base,
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2018',
    cssMinify: true,
    minify: true,
    outDir: path.resolve(root, 'dist'),
    emptyOutDir: true,
  },
});
