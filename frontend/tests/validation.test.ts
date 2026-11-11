import { describe, expect, it } from 'vitest';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH, validateTask } from '../src/lib/validation';

describe('validateTask', () => {
  it('accepts a valid task', () => {
    expect(validateTask({ title: 'Do it', description: '' })).toEqual({});
  });

  it('requires a non-blank title', () => {
    expect(validateTask({ title: '   ', description: '' })).toEqual({
      title: 'Title is required',
    });
  });

  it('enforces the same length limits as the API', () => {
    const errors = validateTask({
      title: 'x'.repeat(TITLE_MAX_LENGTH + 1),
      description: 'y'.repeat(DESCRIPTION_MAX_LENGTH + 1),
    });
    expect(errors.title).toMatch(/at most 200/);
    expect(errors.description).toMatch(/at most 2000/);
  });
});
