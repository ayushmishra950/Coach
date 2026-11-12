import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Big libraries in their own long-cached chunks; charts load only on pages that draw them.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          socket: ['socket.io-client'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4600',
      // Live chat & notifications (Socket.IO over WebSocket)
      '/socket.io': { target: 'http://localhost:4600', ws: true },
    },
  },
});
