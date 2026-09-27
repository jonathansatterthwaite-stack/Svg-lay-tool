import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: {
        'svg-lay-tool': 'src/index.ts',
        core: 'src/core/index.ts',
      },
      formats: ['es'],
    },
    sourcemap: true,
    target: 'es2020',
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
