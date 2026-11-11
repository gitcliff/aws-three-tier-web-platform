/**
 * Errors that are safe to show to API clients. Anything that is not an AppError is treated
 * as unexpected: it is logged in full and the client gets a generic 500.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ValidationError extends AppError {
  constructor(issues: ValidationIssue[]) {
    super(400, 'VALIDATION_ERROR', 'Request validation failed', issues);
  }
}
