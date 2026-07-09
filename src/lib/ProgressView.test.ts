// Simple component test ProgressView. Mocks db. Checks stats + table render.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProgressView from './ProgressView.svelte';

vi.mock('./db/client', async () => {
  const actual = await vi.importActual('./db/client');
  return {
    ...actual,
    getExercises: vi.fn().mockResolvedValue([{ id: 5, name: 'Squat', muscle_groups: '[]', is_custom: 0 }]),
    getExerciseHistory: vi.fn().mockResolvedValue([
      { date: '2026-06-01', max_weight: 100, volume: 800, sets: 4 },
      { date: '2026-06-08', max_weight: 105, volume: 840, sets: 4 },
    ]),
  };
});

describe('ProgressView', () => {
  it('renders stats and history rows', async () => {
    render(ProgressView);
    expect(await screen.findByText(/Max:/)).toBeInTheDocument();
    expect(await screen.findByText('Squat')).toBeInTheDocument(); // select has it
    // table content
    expect(await screen.findByText('100')).toBeInTheDocument();
  });
});
