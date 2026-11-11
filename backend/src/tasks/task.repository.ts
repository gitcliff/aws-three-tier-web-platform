import type pg from 'pg';
import type {
  CreateTaskInput,
  ListTasksFilter,
  TaskStatus,
  UpdateTaskInput,
} from './task.schema.js';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Persistence boundary. The service depends on this interface, not on PostgreSQL. */
export interface TaskRepository {
  list(filter: ListTasksFilter): Promise<Task[]>;
  findById(id: string): Promise<Task | null>;
  create(input: CreateTaskInput): Promise<Task>;
  update(id: string, patch: UpdateTaskInput): Promise<Task | null>;
  delete(id: string): Promise<boolean>;
}

const COLUMNS = `id, title, description, status,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

/**
 * Maps API field names to column names. Only these fixed identifiers are ever placed into
 * SQL text; every value goes through a $n placeholder, so input can never alter a query.
 */
const UPDATABLE_COLUMNS = {
  title: 'title',
  description: 'description',
  status: 'status',
} as const satisfies Record<keyof UpdateTaskInput, string>;

export class PgTaskRepository implements TaskRepository {
  constructor(private readonly pool: pg.Pool) {}

  async list(filter: ListTasksFilter): Promise<Task[]> {
    const { rows } = filter.status
      ? await this.pool.query<Task>(
          `SELECT ${COLUMNS} FROM tasks WHERE status = $1 ORDER BY created_at DESC, id`,
          [filter.status],
        )
      : await this.pool.query<Task>(`SELECT ${COLUMNS} FROM tasks ORDER BY created_at DESC, id`);
    return rows;
  }

  async findById(id: string): Promise<Task | null> {
    const { rows } = await this.pool.query<Task>(`SELECT ${COLUMNS} FROM tasks WHERE id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const { rows } = await this.pool.query<Task>(
      `INSERT INTO tasks (title, description, status) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
      [input.title, input.description, input.status],
    );
    const task = rows[0];
    if (!task) throw new Error('INSERT ... RETURNING returned no row');
    return task;
  }

  async update(id: string, patch: UpdateTaskInput): Promise<Task | null> {
    const assignments: string[] = [];
    const values: unknown[] = [];

    for (const field of Object.keys(UPDATABLE_COLUMNS) as (keyof UpdateTaskInput)[]) {
      const value = patch[field];
      if (value === undefined) continue;
      values.push(value);
      assignments.push(`${UPDATABLE_COLUMNS[field]} = $${values.length}`);
    }

    if (assignments.length === 0) return this.findById(id);

    values.push(id);
    const { rows } = await this.pool.query<Task>(
      `UPDATE tasks SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING ${COLUMNS}`,
      values,
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}
