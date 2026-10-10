import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: { input: { main: 'index.html', listening: 'listening.html', demo: 'ui/demo.html' } },
  },
  // The renderer imports the exported model from ../model/export, outside app/.
  server: { port: 5173, strictPort: true, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
});
