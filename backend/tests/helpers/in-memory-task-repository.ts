import { randomUUID } from 'node:crypto';
import type { Task, TaskRepository } from '../../src/tasks/task.repository.js';
import type {
  CreateTaskInput,
  ListTasksFilter,
  UpdateTaskInput,
} from '../../src/tasks/task.schema.js';

/** Test double with the same observable behaviour as PgTaskRepository. */
export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, Task>();
  private clock = Date.UTC(2026, 0, 1);

  private now(): Date {
    // Strictly increasing timestamps make ordering deterministic.
    this.clock += 1000;
    return new Date(this.clock);
  }

  list(filter: ListTasksFilter): Promise<Task[]> {
    const tasks = [...this.tasks.values()]
      .filter((task) => !filter.status || task.status === filter.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(tasks);
  }

  findById(id: string): Promise<Task | null> {
    return Promise.resolve(this.tasks.get(id) ?? null);
  }

  create(input: CreateTaskInput): Promise<Task> {
    const now = this.now();
    const task: Task = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.tasks.set(task.id, task);
    return Promise.resolve(task);
  }

  update(id: string, patch: UpdateTaskInput): Promise<Task | null> {
    const existing = this.tasks.get(id);
    if (!existing) return Promise.resolve(null);
    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    const updated: Task = { ...existing, ...defined, updatedAt: this.now() };
    this.tasks.set(id, updated);
    return Promise.resolve(updated);
  }

  delete(id: string): Promise<boolean> {
    return Promise.resolve(this.tasks.delete(id));
  }
}
