import { z } from 'zod';

/**
 * Request schemas for the tasks API. The limits mirror the CHECK constraints in
 * database/migrations/001_create_tasks.sql, so invalid input gets a precise 400 here
 * instead of a database error.
 */

export const TASK_STATUSES = ['pending', 'completed'] as const;
export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

export const taskStatusSchema = z.enum(TASK_STATUSES);

const titleSchema = z
  .string({ error: 'Title must be a string' })
  .trim()
  .min(1, 'Title is required')
  .max(TITLE_MAX_LENGTH, `Title must be at most ${TITLE_MAX_LENGTH} characters`);

const descriptionSchema = z
  .string({ error: 'Description must be a string' })
  .trim()
  .max(DESCRIPTION_MAX_LENGTH, `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`);

// strictObject rejects unknown keys, so clients cannot try to set id or timestamps.
export const createTaskSchema = z.strictObject({
  title: titleSchema,
  description: descriptionSchema.default(''),
  status: taskStatusSchema.default('pending'),
});

export const updateTaskSchema = z
  .strictObject({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    status: taskStatusSchema.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'At least one of title, description or status must be provided',
  });

export const taskIdParamsSchema = z.object({
  id: z.uuid({ error: 'Task id must be a valid UUID' }),
});

export const listTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksFilter = z.infer<typeof listTasksQuerySchema>;
