import type { z } from 'zod';
import { ValidationError } from '../errors.js';

/**
 * Parses untrusted input (body, params, query) against a schema. Returns the typed, normalised
 * value or throws a ValidationError that the error handler turns into a 400.
 */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  throw new ValidationError(
    result.error.issues.flatMap((issue) =>
      // Report each unexpected field under its own name rather than under the parent object.
      issue.code === 'unrecognized_keys'
        ? issue.keys.map((key) => ({
            path: [...issue.path, key].join('.'),
            message: 'Unknown field',
          }))
        : [{ path: issue.path.join('.'), message: issue.message }],
    ),
  );
}
