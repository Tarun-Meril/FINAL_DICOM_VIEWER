import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

function cornerstoneCodecsPlugin() {
  return {
    name: 'cornerstone-codecs-esm',
    transform(code: string, id: string) {
      if (id.includes('@cornerstonejs') && id.endsWith('.js')) {
        const exportsList = [
          'OpenJPEGWASM',
          'OpenJPEGJS',
          'CharLSWASM',
          'CharLS',
          'libjpegturbowasm_decode',
          'libjpegturbojs_decode',
        ];
        for (const name of exportsList) {
          if (code.includes(`var ${name} =`) && !code.includes(`export default ${name}`)) {
            return {
              code: `${code}\nexport default ${name};\nexport { ${name} };\n`,
              map: null,
            };
          }
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), cornerstoneCodecsPlugin()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es' },
  // WASM codecs ship as side-effectful emscripten glue; keep them out of pre-bundling.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'zustand',
      'dicom-parser',
      'fflate',
      'jpeg-lossless-decoder-js',
      '@kitware/vtk.js/Rendering/Profiles/Volume',
    ],
    exclude: ['@cornerstonejs/codec-openjpeg', '@cornerstonejs/codec-charls', '@cornerstonejs/codec-libjpeg-turbo-8bit'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 4096,
    rollupOptions: { output: { manualChunks: { vtk: ['@kitware/vtk.js/Rendering/Profiles/Volume'] } } },
  },
  server: {
    port: 5173,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  preview: {
    port: 4173,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});
