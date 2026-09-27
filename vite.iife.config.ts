import { defineConfig } from 'vite';

// Second build: a single self-contained script exposing `SvgLayTool` on window,
// for apps that want a plain <script> tag instead of a bundler.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/index.ts',
      name: 'SvgLayTool',
      formats: ['iife'],
      fileName: () => 'svg-lay-tool.iife.js',
    },
    sourcemap: true,
    target: 'es2020',
  },
});
