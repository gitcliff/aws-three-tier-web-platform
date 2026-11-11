/** Wire types for the task API (mirrors backend/src/tasks). Dates arrive as ISO strings. */

export type TaskStatus = 'pending' | 'completed';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  description: string;
}

export type TaskUpdate = Partial<TaskInput & { status: TaskStatus }>;

export interface FieldIssue {
  path: string;
  message: string;
}
