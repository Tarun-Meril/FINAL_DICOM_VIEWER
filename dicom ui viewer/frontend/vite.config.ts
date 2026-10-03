import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import viewerConfig from '../../viewer.config.json';
import path from 'path';
import fs from 'fs';

import wasm from 'vite-plugin-wasm';

const spaViewerFallback = () => ({
  name: 'spa-viewer-fallback',
  configureServer(server: any) {
    server.middlewares.use((req: any, _res: any, next: any) => {
      const isSpaRoute =
        req.url &&
        (req.url.startsWith('/viewer/') ||
          req.url === '/pacs' ||
          req.url.startsWith('/pacs/') ||
          req.url.startsWith('/pacs?') ||
          req.url === '/mpr' ||
          req.url.startsWith('/mpr?') ||
          req.url.startsWith('/mpr/') ||
          req.url === '/vr' ||
          req.url.startsWith('/vr?') ||
          req.url.startsWith('/vr/'));
      if (isSpaRoute && req.headers.accept?.includes('text/html')) {
        req.url = '/index.html';
      }
      next();
    });
  }
});

function cornerstoneCodecFixPlugin() {
  return {
    name: 'cornerstone-codec-fix-vite',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const cleanId = id.split('?')[0];
      // Skip files already pre-bundled by Vite's dep optimizer
      if (cleanId.includes('.vite/deps') || cleanId.includes('node_modules/.vite')) {
        return;
      }
      if (cleanId.includes('codec-') && cleanId.endsWith('.js')) {
        // Don't add if any form of default export already exists
        if (/export\s+default\b|export\s*\{[^}]*\bdefault\b/.test(code)) {
          return;
        }
        const match = code.match(/var\s+([a-zA-Z0-9_]+)\s*=\s*\(\s*\(\)\s*=>\s*\{/);
        if (match && match[1]) {
          return {
            code: code + '\nexport default ' + match[1] + ';\n',
            map: null
          };
        }
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      'globalthis': path.resolve(__dirname, './src/globalthis-shim.ts'),
      'events': 'events',
      // Volume-rendering engine (already in this project) and the VR UI layer.
      '@3d': path.resolve(__dirname, './src/3d'),
      '@vr': path.resolve(__dirname, './src/vr')
    }
  },
  plugins: [
    spaViewerFallback(),
    cornerstoneCodecFixPlugin(),
    react(),
    tailwindcss(),
    wasm()
  ],
  worker: {
    format: 'es'
  },
  base: './',
  server: {
    port: viewerConfig.port,
    host: '127.0.0.1',
    strictPort: true,
    cors: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      keepNames: true,
    },
    include: [
      'dicom-parser',
      'globalthis',
      '@kitware/vtk.js',
      '@kitware/vtk.js/Rendering/Profiles/Volume',
      '@cornerstonejs/core',
      '@cornerstonejs/tools',
      '@cornerstonejs/codec-libjpeg-turbo-8bit',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decode',
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-charls/decode',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decode',
      'jpeg-lossless-decoder-js',
      'fflate',
      'events',
      'xmlbuilder2'
    ],
    exclude: ['decodeImageFrameWorker', '@cornerstonejs/dicom-image-loader']
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
