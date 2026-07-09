// ExerciseLibrary component test. Simple render + add form. Mocks db.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ExerciseLibrary from './ExerciseLibrary.svelte';

vi.mock('./db/client', async () => {
  const actual = await vi.importActual('./db/client');
  return {
    ...actual,
    getExercises: vi.fn().mockResolvedValue([
      { id: 10, name: 'Deadlift', muscle_groups: '["back"]', is_custom: 0 },
      { id: 99, name: 'My Row', muscle_groups: '["back"]', is_custom: 1, description: 'test' }
    ]),
    addCustomExercise: vi.fn().mockResolvedValue(123),
    deleteExercise: vi.fn(),
    updateExercise: vi.fn(),
  };
});

describe('ExerciseLibrary', () => {
  it('renders seeded + custom', async () => {
    render(ExerciseLibrary);
    expect(await screen.findByText('Deadlift')).toBeInTheDocument();
    expect(screen.getByText('My Row')).toBeInTheDocument();
    expect(screen.getByText('custom')).toBeInTheDocument();
  });

  it('shows add form', async () => {
    render(ExerciseLibrary);
    await fireEvent.click(screen.getByText('+ Add Custom'));
    expect(screen.getByPlaceholderText('Exercise name')).toBeInTheDocument();
  });
});
