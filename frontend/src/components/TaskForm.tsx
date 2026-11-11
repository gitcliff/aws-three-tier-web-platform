import { useId, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import type { TaskInput } from '../api/types';
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  validateTask,
  type FieldErrors,
} from '../lib/validation';
import { buttonStyles, inputStyles } from './ui';

interface TaskFormProps {
  initialValues?: TaskInput;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: TaskInput) => Promise<void>;
  onCancel?: () => void;
  /** Clear the fields after a successful submit (create form) instead of keeping them (edit). */
  resetOnSuccess?: boolean;
  autoFocus?: boolean;
}

const EMPTY: TaskInput = { title: '', description: '' };

/** Shared by "add task" and "edit task": validates locally, then shows server errors per field. */
export function TaskForm({
  initialValues = EMPTY,
  submitLabel,
  submittingLabel,
  onSubmit,
  onCancel,
  resetOnSuccess = false,
  autoFocus = false,
}: TaskFormProps) {
  const id = useId();
  const [values, setValues] = useState<TaskInput>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = (field: keyof TaskInput, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setFieldErrors((errors) => ({ ...errors, [field]: undefined }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { title: values.title.trim(), description: values.description.trim() };

    const errors = validateTask(input);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(input);
      if (resetOnSuccess) setValues(EMPTY);
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        const serverErrors: FieldErrors = {};
        for (const issue of err.details) {
          if (issue.path === 'title' || issue.path === 'description') {
            serverErrors[issue.path] = issue.message;
          }
        }
        setFieldErrors(serverErrors);
        if (Object.keys(serverErrors).length === 0) setFormError(err.message);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Could not save the task.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const titleErrorId = `${id}-title-error`;
  const descriptionErrorId = `${id}-description-error`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div>
        <label htmlFor={`${id}-title`} className="mb-1 block text-sm font-medium">
          Title
        </label>
        <input
          id={`${id}-title`}
          className={inputStyles}
          value={values.title}
          onChange={(e) => setField('title', e.target.value)}
          maxLength={TITLE_MAX_LENGTH}
          placeholder="What needs doing?"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={fieldErrors.title ? true : undefined}
          aria-describedby={fieldErrors.title ? titleErrorId : undefined}
        />
        {fieldErrors.title && (
          <p id={titleErrorId} className="mt-1 text-sm text-red-600 dark:text-red-400">
            {fieldErrors.title}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${id}-description`} className="mb-1 block text-sm font-medium">
          Description <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <textarea
          id={`${id}-description`}
          className={`${inputStyles} min-h-20 resize-y`}
          value={values.description}
          onChange={(e) => setField('description', e.target.value)}
          maxLength={DESCRIPTION_MAX_LENGTH}
          rows={2}
          placeholder="Add details"
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={fieldErrors.description ? descriptionErrorId : undefined}
        />
        {fieldErrors.description && (
          <p id={descriptionErrorId} className="mt-1 text-sm text-red-600 dark:text-red-400">
            {fieldErrors.description}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        )}
        <button type="submit" className={buttonStyles.primary} disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
