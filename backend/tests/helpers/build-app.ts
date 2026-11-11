import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import type { TaskRepository } from '../../src/tasks/task.repository.js';
import { InMemoryTaskRepository } from './in-memory-task-repository.js';

export function buildTestApp(
  overrides: { taskRepository?: TaskRepository; checkDatabase?: () => Promise<void> } = {},
) {
  return createApp({
    logger: createLogger('silent'),
    taskRepository: overrides.taskRepository ?? new InMemoryTaskRepository(),
    checkDatabase: overrides.checkDatabase ?? (() => Promise.resolve()),
  });
}
