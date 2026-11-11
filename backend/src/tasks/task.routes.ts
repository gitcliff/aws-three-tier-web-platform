import { Router } from 'express';
import { parseInput } from '../http/validate.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
  taskIdParamsSchema,
  updateTaskSchema,
} from './task.schema.js';
import type { TaskService } from './task.service.js';

/**
 * HTTP adapter for tasks: validate input → call the service → shape the response.
 * Express 5 forwards rejected promises from async handlers to the error handler,
 * so no try/catch is needed here.
 *
 *   GET    /api/tasks?status=pending|completed   200 { data: Task[] }
 *   POST   /api/tasks                            201 { data: Task }
 *   GET    /api/tasks/:id                        200 { data: Task }
 *   PATCH  /api/tasks/:id                        200 { data: Task }
 *   DELETE /api/tasks/:id                        204
 */
export function createTaskRouter(service: TaskService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const filter = parseInput(listTasksQuerySchema, req.query);
    res.json({ data: await service.list(filter) });
  });

  router.post('/', async (req, res) => {
    const input = parseInput(createTaskSchema, req.body);
    const task = await service.create(input);
    res.status(201).location(`${req.baseUrl}/${task.id}`).json({ data: task });
  });

  router.get('/:id', async (req, res) => {
    const { id } = parseInput(taskIdParamsSchema, req.params);
    res.json({ data: await service.get(id) });
  });

  router.patch('/:id', async (req, res) => {
    const { id } = parseInput(taskIdParamsSchema, req.params);
    const patch = parseInput(updateTaskSchema, req.body);
    res.json({ data: await service.update(id, patch) });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = parseInput(taskIdParamsSchema, req.params);
    await service.delete(id);
    res.status(204).end();
  });

  return router;
}
