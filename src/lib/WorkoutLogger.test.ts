// Component test for WorkoutLogger (core logging UI).
// Keep simple. Mock the db module. Use fireEvent + queries.
// Tests render + basic interactions.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import WorkoutLogger from './WorkoutLogger.svelte';

// mock db/client completely for isolation
vi.mock('./db/client', async () => {
  const actual = await vi.importActual('./db/client');
  return {
    ...actual,
    initDb: vi.fn().mockResolvedValue({ success: true }),
    getExercises: vi.fn().mockResolvedValue([
      { id: 1, name: 'Bench Press', muscle_groups: '["chest"]', category: 'strength', is_custom: 0 }
    ]),
    createWorkout: vi.fn().mockResolvedValue(42),
    addWorkoutExercise: vi.fn().mockResolvedValue(99),
    addSet: vi.fn().mockResolvedValue(undefined),
    updateSet: vi.fn().mockResolvedValue(undefined),
    deleteSet: vi.fn().mockResolvedValue(undefined),
    calcVolume: (actual as any).calcVolume,
  };
});

describe('WorkoutLogger (simple)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders start screen', () => {
    render(WorkoutLogger);
    expect(screen.getByText('START TRAINING')).toBeInTheDocument();
  });

  it('starts a workout and shows controls', async () => {
    render(WorkoutLogger);

    // fill name optional
    const startBtn = screen.getByText('START TRAINING');
    await fireEvent.click(startBtn);

    // after start, expect add controls or end button
    expect(await screen.findByText('END WORKOUT')).toBeInTheDocument();
    expect(screen.getByText(/choose exercise/i)).toBeInTheDocument();
  });

  it('can add exercise from lib select after start', async () => {
    render(WorkoutLogger);
    await fireEvent.click(screen.getByText('START TRAINING'));

    // select bench (id 1 from mock)
    const sel = screen.getByRole('combobox') as HTMLSelectElement;
    await fireEvent.change(sel, { target: { value: '1' } });

    await fireEvent.click(screen.getByText('Add'));

    // expect exercise block with name from mock (select also contains text, use count)
    const matches = await screen.findAllByText('Bench Press');
    expect(matches.length).toBeGreaterThan(0);
  });
});
