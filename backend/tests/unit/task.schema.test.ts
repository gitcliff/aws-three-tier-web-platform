import { describe, expect, it } from 'vitest';
import {
  createTaskSchema,
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  taskIdParamsSchema,
  updateTaskSchema,
} from '../../src/tasks/task.schema.js';

describe('createTaskSchema', () => {
  it('trims input and applies defaults', () => {
    expect(createTaskSchema.parse({ title: '  Buy milk  ' })).toEqual({
      title: 'Buy milk',
      description: '',
      status: 'pending',
    });
  });

  it.each([
    ['missing title', {}],
    ['blank title', { title: '   ' }],
    ['non-string title', { title: 42 }],
    ['title too long', { title: 'x'.repeat(TITLE_MAX_LENGTH + 1) }],
    ['description too long', { title: 'ok', description: 'x'.repeat(DESCRIPTION_MAX_LENGTH + 1) }],
    ['unknown status', { title: 'ok', status: 'done' }],
    ['unknown field', { title: 'ok', id: 'client-chosen-id' }],
  ])('rejects %s', (_case, input) => {
    expect(createTaskSchema.safeParse(input).success).toBe(false);
  });

  it('accepts values at the limits', () => {
    const input = {
      title: 'x'.repeat(TITLE_MAX_LENGTH),
      description: 'y'.repeat(DESCRIPTION_MAX_LENGTH),
      status: 'completed',
    };
    expect(createTaskSchema.safeParse(input).success).toBe(true);
  });
});

describe('updateTaskSchema', () => {
  it('accepts a partial update', () => {
    expect(updateTaskSchema.parse({ status: 'completed' })).toEqual({ status: 'completed' });
  });

  it('rejects an empty update', () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });

  it('rejects blanking the title', () => {
    expect(updateTaskSchema.safeParse({ title: ' ' }).success).toBe(false);
  });
});

describe('taskIdParamsSchema', () => {
  it('requires a UUID', () => {
    expect(taskIdParamsSchema.safeParse({ id: '123' }).success).toBe(false);
    expect(
      taskIdParamsSchema.safeParse({ id: '3f1c2a7e-8b4d-4c6e-9a1b-2d3e4f5a6b7c' }).success,
    ).toBe(true);
  });
});
