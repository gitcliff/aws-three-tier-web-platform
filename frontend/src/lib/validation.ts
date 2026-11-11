import type { TaskInput } from '../api/types';

// Mirror the API and database limits so most mistakes are caught before a round trip.
// The API remains the authority; its 400 responses are shown the same way.
export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

export type FieldErrors = Partial<Record<keyof TaskInput, string>>;

export function validateTask(input: TaskInput): FieldErrors {
  const errors: FieldErrors = {};
  const title = input.title.trim();

  if (title.length === 0) errors.title = 'Title is required';
  else if (title.length > TITLE_MAX_LENGTH)
    errors.title = `Title must be at most ${TITLE_MAX_LENGTH} characters`;

  if (input.description.trim().length > DESCRIPTION_MAX_LENGTH)
    errors.description = `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`;

  return errors;
}
