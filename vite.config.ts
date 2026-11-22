import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@engine': path.resolve(__dirname, './src/engine'),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1100, // maplibre-gl alone is ~1 MB minified
    rollupOptions: {
      output: {
        manualChunks: {
          'maplibre': ['maplibre-gl'],
          'three': ['three'],
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/.edge-temp/**', '**/screenshot*.png', '**/*.log'],
    },
  },
});
