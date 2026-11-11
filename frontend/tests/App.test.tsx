import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { installFakeApi, makeTask } from './fake-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  return { user };
}

const newTaskForm = () => within(screen.getByRole('region', { name: 'New task' }));
const taskList = () => screen.getByRole('list');

describe('App', () => {
  it('shows a loading state, then the tasks with counts', async () => {
    installFakeApi([
      makeTask({ title: 'Write docs', status: 'completed' }),
      makeTask({ title: 'Fix bug', description: 'in the parser' }),
    ]);
    renderApp();

    expect(screen.getByRole('status', { name: 'Loading tasks' })).toBeInTheDocument();
    expect(await screen.findByText('Fix bug')).toBeInTheDocument();
    expect(screen.getByText('in the parser')).toBeInTheDocument();
    expect(screen.getByText('1 pending · 1 completed')).toBeInTheDocument();
  });

  it('shows an empty state when there are no tasks', async () => {
    installFakeApi();
    renderApp();
    expect(await screen.findByText(/No tasks yet/)).toBeInTheDocument();
  });

  it('creates a task with trimmed input and clears the form', async () => {
    const api = installFakeApi();
    const { user } = renderApp();
    await screen.findByText(/No tasks yet/);

    await user.type(newTaskForm().getByLabelText('Title'), '  Buy milk  ');
    await user.type(newTaskForm().getByLabelText(/Description/), 'semi-skimmed');
    await user.click(newTaskForm().getByRole('button', { name: 'Add task' }));

    expect(await within(taskList()).findByText('Buy milk')).toBeInTheDocument();
    expect(api.requests.at(-1)).toMatchObject({
      method: 'POST',
      body: { title: 'Buy milk', description: 'semi-skimmed' },
    });
    expect(newTaskForm().getByLabelText('Title')).toHaveValue('');
  });

  it('validates locally before calling the API', async () => {
    const api = installFakeApi();
    const { user } = renderApp();
    await screen.findByText(/No tasks yet/);

    await user.click(newTaskForm().getByRole('button', { name: 'Add task' }));

    expect(newTaskForm().getByText('Title is required')).toBeInTheDocument();
    expect(newTaskForm().getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('shows server-side validation errors next to the field', async () => {
    const api = installFakeApi();
    api.failNext('POST', 400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ path: 'title', message: 'Title is already taken' }],
      },
    });
    const { user } = renderApp();
    await screen.findByText(/No tasks yet/);

    await user.type(newTaskForm().getByLabelText('Title'), 'Duplicate');
    await user.click(newTaskForm().getByRole('button', { name: 'Add task' }));

    expect(await newTaskForm().findByText('Title is already taken')).toBeInTheDocument();
    // Input is kept so the user can correct it.
    expect(newTaskForm().getByLabelText('Title')).toHaveValue('Duplicate');
  });

  it('marks a task completed and filters by status', async () => {
    installFakeApi([makeTask({ title: 'Ship it' }), makeTask({ title: 'Plan it' })]);
    const { user } = renderApp();
    await screen.findByText('Ship it');

    const checkbox = screen.getByRole('checkbox', { name: 'Mark "Ship it" as completed' });
    await user.click(checkbox);

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Mark "Ship it" as pending' })).toBeChecked(),
    );
    expect(screen.getByText('1 pending · 1 completed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Completed/ }));
    expect(within(taskList()).getByText('Ship it')).toBeInTheDocument();
    expect(within(taskList()).queryByText('Plan it')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Pending/ }));
    expect(within(taskList()).getByText('Plan it')).toBeInTheDocument();
    expect(within(taskList()).queryByText('Ship it')).not.toBeInTheDocument();
  });

  it('edits a task', async () => {
    const api = installFakeApi([makeTask({ title: 'Old title' })]);
    const { user } = renderApp();
    await screen.findByText('Old title');

    await user.click(screen.getByRole('button', { name: 'Edit "Old title"' }));
    const title = within(taskList()).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'New title');
    await user.click(within(taskList()).getByRole('button', { name: 'Save' }));

    expect(await within(taskList()).findByText('New title')).toBeInTheDocument();
    expect(api.requests.at(-1)).toMatchObject({
      method: 'PATCH',
      body: { title: 'New title', description: '' },
    });
  });

  it('cancels an edit without saving', async () => {
    const api = installFakeApi([makeTask({ title: 'Keep me' })]);
    const { user } = renderApp();
    await screen.findByText('Keep me');

    await user.click(screen.getByRole('button', { name: 'Edit "Keep me"' }));
    await user.type(within(taskList()).getByLabelText('Title'), ' changed');
    await user.click(within(taskList()).getByRole('button', { name: 'Cancel' }));

    expect(within(taskList()).getByText('Keep me')).toBeInTheDocument();
    expect(api.requests.some((r) => r.method === 'PATCH')).toBe(false);
  });

  it('deletes a task only after confirmation', async () => {
    const api = installFakeApi([makeTask({ title: 'Remove me' }), makeTask({ title: 'Stay' })]);
    const { user } = renderApp();
    await screen.findByText('Remove me');

    await user.click(screen.getByRole('button', { name: 'Delete "Remove me"' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Remove me')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete "Remove me"' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete "Remove me"' }));

    await waitFor(() => expect(screen.queryByText('Remove me')).not.toBeInTheDocument());
    expect(screen.getByText('Stay')).toBeInTheDocument();
    expect(api.tasks.map((t) => t.title)).toEqual(['Stay']);
  });

  it('shows an inline error and keeps state when an update fails', async () => {
    const api = installFakeApi([makeTask({ title: 'Flaky' })]);
    api.failNext('PATCH', 503, {
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
    });
    const { user } = renderApp();
    await screen.findByText('Flaky');

    await user.click(screen.getByRole('checkbox', { name: 'Mark "Flaky" as completed' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Service temporarily unavailable');
    expect(screen.getByRole('checkbox', { name: 'Mark "Flaky" as completed' })).not.toBeChecked();
  });

  it('shows a load error and recovers on retry', async () => {
    const api = installFakeApi([makeTask({ title: 'Eventually loaded' })]);
    api.failNextNetwork('GET');
    const { user } = renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not reach the server/);
    // No misleading zero counts while the list is unknown.
    expect(screen.queryByRole('group', { name: 'Filter tasks' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Eventually loaded')).toBeInTheDocument();
  });
});
