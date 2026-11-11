import { pino, type Logger } from 'pino';
import type { LogLevel } from './config/env.js';

/**
 * Structured JSON logs on stdout: the container runtime ships them, and nothing is written
 * to disk inside the container. Credentials that could appear in request headers are redacted.
 */
export function createLogger(level: LogLevel): Logger {
  return pino({
    level,
    base: { service: 'task-api' },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[REDACTED]',
    },
  });
}

export type { Logger };
