import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('../site', import.meta.url)),
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 4096 },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: false,
    fs: { allow: [
      fileURLToPath(new URL('../site', import.meta.url)),
      fileURLToPath(new URL('../shared', import.meta.url)),
      fileURLToPath(new URL('./src/renderer/ui/frog', import.meta.url)),
      fileURLToPath(new URL('./node_modules/@fontsource-variable/nunito', import.meta.url)),
      fileURLToPath(new URL('../docs/art', import.meta.url)),
    ] },
  },
});
