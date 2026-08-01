import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
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
