import { defineConfig } from 'vite';

// Builds the demo page (index.html + demo/) as a static site for GitHub Pages.
// Relative base so it works from any sub-path, e.g. https://<user>.github.io/<repo>/.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    target: 'es2020',
  },
});
