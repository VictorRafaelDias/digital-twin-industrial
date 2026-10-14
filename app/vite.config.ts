import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` gera um único index.html (sem servidor): abre com duplo clique, para entregar por Teams ou e-mail.
export default defineConfig(({ mode }) => ({
  base: mode === 'single' ? './' : '/',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  server: { port: 5175, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));