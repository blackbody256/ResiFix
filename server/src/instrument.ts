// Sentry must initialise before anything else is imported. No-op when SENTRY_DSN is unset.
import * as Sentry from '@sentry/nestjs';
import { loadConfig } from './config/config';

const { sentry } = loadConfig();
if (sentry.dsn) {
  Sentry.init({ dsn: sentry.dsn, environment: sentry.environment, tracesSampleRate: 0.1 });
}
