// Unit tests for pure logic in db/client + helpers.
// Keep simple. No worker/db needed here. Vitest + comments.

import { describe, it, expect } from 'vitest';
import { calcVolume } from './client';

describe('calcVolume', () => {
  it('multiplies weight x reps', () => {
    expect(calcVolume(80, 8)).toBe(640);
    expect(calcVolume(22.5, 10)).toBe(225);
  });

  it('returns 0 for missing values', () => {
    expect(calcVolume(null, 5)).toBe(0);
    expect(calcVolume(50, undefined)).toBe(0);
    expect(calcVolume(0, 10)).toBe(0);
  });

  it('handles floats correctly', () => {
    expect(calcVolume(2.5, 12)).toBe(30);
  });
});

// simple PR logic test (mirrors ProgressView.isPR)
function isPR(history: any[], idx: number) {
  const maxSoFar = Math.max(...history.slice(0, idx + 1).map((x: any) => x.max_weight || 0));
  return history[idx].max_weight === maxSoFar;
}

describe('progress PR detection (simple)', () => {
  it('marks highest as PR', () => {
    const h = [
      { max_weight: 80 },
      { max_weight: 85 },
      { max_weight: 82 },
    ];
    expect(isPR(h, 0)).toBe(true);
    expect(isPR(h, 1)).toBe(true);
    expect(isPR(h, 2)).toBe(false);
  });
});
