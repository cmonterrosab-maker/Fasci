import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiUrl = process.env.VITE_API_URL || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // En desarrollo, redirige /api al backend local
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,        // desactivar en producción para menor tamaño
    chunkSizeWarningLimit: 1000,
  },
  define: {
    // Expone la URL del backend al código del frontend en producción
    '__API_URL__': JSON.stringify(apiUrl),
  },
});
