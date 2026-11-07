// Minimal levelled logger. One JSON line per entry in production, readable text in dev.
import { config } from '../config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function write(level, msg, fields = {}) {
  if (LEVELS[level] < threshold || config.isTest) return;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (config.isProd) {
    out(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));
  } else {
    const extra = Object.keys(fields).length ? ' ' + JSON.stringify(fields) : '';
    out(
      `${new Date().toISOString().slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${msg}${extra}`,
    );
  }
}

export const logger = {
  debug: (msg, fields) => write('debug', msg, fields),
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
};
