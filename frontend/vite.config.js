import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// =====================================================
// This folder is a SECONDARY build entry point only.
//
// It serves the SAME root `src/` and the SAME `index.html` as the
// project-root vite.config.js. It exists purely to emit a build into
// `frontend/dist`.
//
// IMPORTANT: the dev server (host / port / proxy) is intentionally NOT
// redeclared here. It is imported from the root config so there is exactly
// ONE place that owns port 5173. Two configs both claiming 5173 is what
// caused Vite to silently shift ports and leave
// http://localhost:5173 refusing connections.
// =====================================================
import rootConfig from '../vite.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  ...rootConfig,

  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
