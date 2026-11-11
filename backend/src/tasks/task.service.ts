import { NotFoundError } from '../errors.js';
import type { Task, TaskRepository } from './task.repository.js';
import type { CreateTaskInput, ListTasksFilter, UpdateTaskInput } from './task.schema.js';

/**
 * Business rules for tasks. Input arriving here has already been validated; this layer
 * turns "no such row" into a domain NotFoundError and has no knowledge of HTTP or SQL.
 */
export class TaskService {
  constructor(private readonly repository: TaskRepository) {}

  list(filter: ListTasksFilter): Promise<Task[]> {
    return this.repository.list(filter);
  }

  async get(id: string): Promise<Task> {
    const task = await this.repository.findById(id);
    if (!task) throw new NotFoundError('Task');
    return task;
  }

  create(input: CreateTaskInput): Promise<Task> {
    return this.repository.create(input);
  }

  async update(id: string, patch: UpdateTaskInput): Promise<Task> {
    const task = await this.repository.update(id, patch);
    if (!task) throw new NotFoundError('Task');
    return task;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) throw new NotFoundError('Task');
  }
}
