// Simple render test for History component.
// Mocks db. Verifies list + buttons exist. Keep simple + comments.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import History from './History.svelte';

vi.mock('./db/client', async () => {
  const actual = await vi.importActual('./db/client');
  return {
    ...actual,
    getWorkouts: vi.fn().mockResolvedValue([
      { id: 1, date: '2026-07-01T10:00:00Z', name: 'Push Day' }
    ]),
    getWorkoutDetail: vi.fn().mockResolvedValue(null),
    duplicateWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
  };
});

describe('History', () => {
  it('shows workout list items', async () => {
    render(History);
    // wait for async
    expect(await screen.findByText('Push Day')).toBeInTheDocument();
    expect(screen.getByText('dup')).toBeInTheDocument();
    expect(screen.getByText('del')).toBeInTheDocument();
  });
});
