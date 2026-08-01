import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createRequire } from 'node:module';

// Single source of truth for the version shown in the UI. It used to be
// hardcoded in Topbar.tsx and silently sat at "v0.1.0 · Preview" for six
// releases; injecting it here means it can never drift from package.json.
const { version } = createRequire(import.meta.url)('./package.json');

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: './',
  root: '.',
  server: { port: 5273, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Split vendors so a UI change doesn't invalidate the whole bundle and
    // React Flow only downloads when the Database designer opens.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          flow: ['reactflow'],
          motion: ['framer-motion'],
          icons: ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      '@core': path.resolve(process.cwd(), 'src/core'),
      '@plugins': path.resolve(process.cwd(), 'src/plugins'),
      '@ui': path.resolve(process.cwd(), 'src/ui'),
    },
  },
});
