import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    // os testes de integração compartilham o banco clinic_test: um arquivo por vez
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
    env: { NODE_ENV: 'test' },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
