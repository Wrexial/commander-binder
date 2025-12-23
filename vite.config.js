import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    sourcemap: true, // enables source maps
  },
  server: {
    // optional: verbose logging for dev server
    logLevel: 'info', // 'error', 'warn', 'info', 'silent'
  },
  server: {
    port: 5173,      // or any free port
    strictPort: true,
    host: true       // exposes to network
  }
})
