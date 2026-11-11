import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors.js';

/**
 * Centralised error handling. Every failure leaves the API in the same JSON shape:
 *
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
 *
 * Known, client-caused errors keep their status and message. Everything else is logged with
 * its stack and request id, and the client gets a generic 500: internal details such as SQL,
 * hostnames or stack traces are never returned.
 */

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

interface HttpLikeError {
  status?: number;
  type?: string;
  code?: string;
}

// PostgreSQL SQLSTATEs for constraint violations. Validation should catch these first; this
// is the safety net if the API's rules and the database's ever drift apart.
const PG_CONSTRAINT_CODES = new Set(['23502', '23514', '22001']);
// Database unreachable or shutting down: a temporary condition, not a bug.
const DB_UNAVAILABLE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P01', '57P03']);

function classify(err: unknown): { status: number; body: ErrorBody } | null {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    };
  }

  const e = (typeof err === 'object' && err !== null ? err : {}) as HttpLikeError;

  // Errors raised by express.json() (body-parser).
  if (e.type === 'entity.parse.failed') {
    return {
      status: 400,
      body: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
    };
  }
  if (e.type === 'entity.too.large') {
    return {
      status: 413,
      body: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
    };
  }

  if (e.code !== undefined && PG_CONSTRAINT_CODES.has(e.code)) {
    return {
      status: 400,
      body: { code: 'CONSTRAINT_VIOLATION', message: 'Request violates a data constraint' },
    };
  }
  if (e.code !== undefined && DB_UNAVAILABLE_CODES.has(e.code)) {
    return {
      status: 503,
      body: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
    };
  }

  if (typeof e.status === 'number' && e.status >= 400 && e.status < 500) {
    return { status: e.status, body: { code: 'BAD_REQUEST', message: 'Bad request' } };
  }

  return null;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const known = classify(err);
  if (known) {
    if (known.status >= 500) req.log.warn({ err }, 'request failed: dependency unavailable');
    res.status(known.status).json({ error: known.body });
    return;
  }

  req.log.error({ err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
};
