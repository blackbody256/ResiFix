// Vitest `setupFiles` for e2e: runs before each test file imports the app, because
// AppModule reads its configuration at import time.
import { testEnv } from './test-env';

Object.assign(process.env, testEnv());
