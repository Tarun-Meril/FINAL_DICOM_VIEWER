import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 2D MPR only: the segmentation WebAssembly module that
      // @cornerstonejs/tools imports statically is replaced by a stub.
      '@icr/polyseg-wasm': fileURLToPath(
        new URL('./src/shims/polyseg-stub.ts', import.meta.url),
      ),
    },
  },
  worker: { format: 'es' },
  // Cross-origin isolation enables SharedArrayBuffer, which Cornerstone3D uses
  // to stream large volumes without copying between workers. Production
  // deployments must send the same two headers.
  server: {
    port: 5176,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    port: 5176,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    include: ['@cornerstonejs/dicom-image-loader', 'dicom-parser'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
} as any);
