import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * The browser always calls the API at the relative path /api. In development the Vite dev
 * server proxies /api to the backend; in containers nginx does the same (Phase 4). Nothing
 * environment-specific is compiled into the bundle, so one image runs in every environment.
 */
export default defineConfig(({ mode }) => {
  // Empty prefix: read API_PROXY_TARGET without exposing it to client code (only VITE_* is).
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: env.API_PROXY_TARGET ?? 'http://localhost:4000' },
      },
    },
    build: {
      // No source maps in production output: they would publish the original source.
      sourcemap: false,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  };
});
