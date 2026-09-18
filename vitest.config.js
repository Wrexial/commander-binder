/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    // Hermetic default so tests run without a local .env / CI secret. The
    // Clerk publishable key only needs to be syntactically valid here; every
    // test either mocks @clerk/clerk-js or never talks to Clerk.
    env: {
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk',
    },
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
