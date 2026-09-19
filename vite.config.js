import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true, // enables source maps
    rollupOptions: {
      // Two entry points: the browse/collection app and the Binder Builder.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        binder: fileURLToPath(new URL('./binder.html', import.meta.url)),
      },
    },
  },
  server: {
    // optional: verbose logging for dev server
    logLevel: 'info', // 'error', 'warn', 'info', 'silent'
    port: 5173,
    strictPort: true,
    host: true, // exposes to network
  },
});
