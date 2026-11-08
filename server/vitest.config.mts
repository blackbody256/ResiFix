// Two test projects:
//   unit  src/**/*.spec.ts       pure logic, no database
//   e2e   test/**/*.e2e-spec.ts  HTTP tests against the real app, a test Postgres and Redis
// `npm test -w server` runs both; `test:unit` / `test:e2e` run one. See test/README.md.
// SWC compiles the TypeScript because NestJS needs decorator metadata, which esbuild drops.
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e-spec.ts'],
          setupFiles: ['test/setup-env.ts'],
          globalSetup: ['test/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
