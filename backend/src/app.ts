import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFoundHandler } from './http/error-handler.js';
import type { Logger } from './logger.js';
import type { TaskRepository } from './tasks/task.repository.js';
import { createTaskRouter } from './tasks/task.routes.js';
import { TaskService } from './tasks/task.service.js';

export interface AppDependencies {
  logger: Logger;
  taskRepository: TaskRepository;
  /** Resolves when the database answers; rejects otherwise. Drives the readiness probe. */
  checkDatabase: () => Promise<void>;
}

const REQUEST_ID = /^[\w-]{1,128}$/;

/**
 * Builds the Express app from its dependencies without opening a port or a database
 * connection, so tests can create it with in-memory fakes.
 */
export function createApp({ logger, taskRepository, checkDatabase }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());

  app.use(
    pinoHttp({
      logger,
      // Reuse an upstream request id (e.g. from nginx) when it is well formed, otherwise make
      // one. It is returned to the client and attached to every log line for the request.
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
    }),
  );

  // Small body limit: a task is at most ~2 KB of text.
  app.use(express.json({ limit: '16kb' }));

  // Liveness: the process is up. Deliberately does not touch the database, so a database
  // outage does not get healthy API containers restarted in a loop.
  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: the API can serve traffic, which requires the database.
  app.get('/health/ready', async (req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ok', database: 'ok' });
    } catch (err) {
      req.log.warn({ err }, 'readiness check failed');
      res.status(503).json({ status: 'unavailable', database: 'unreachable' });
    }
  });

  app.use('/api/tasks', createTaskRouter(new TaskService(taskRepository)));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
