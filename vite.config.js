import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =====================================================
// SINGLE SOURCE OF TRUTH for the Velora dev server.
//
// `strictPort: true` makes Vite FAIL LOUDLY if 5173 is already taken
// instead of silently falling back to 5174. That silent fallback is what
// produced `net::ERR_CONNECTION_REFUSED` on http://localhost:5173 while
// the app was actually being served on a different port.
// =====================================================
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },

  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: process.env.DISABLE_HMR !== 'true',

    watch: process.env.DISABLE_HMR === 'true' ? null : {},

    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
