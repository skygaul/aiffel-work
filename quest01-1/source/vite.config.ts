import { defineConfig } from 'vite';
export default defineConfig({
  base: './', // relative asset paths so the build runs from any subfolder (e.g. GitHub Pages)
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1200 },
  test: { include: ['tests/**/*.spec.ts'] },
} as any);
