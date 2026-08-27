import { describe, expect, it } from 'vitest';
import { goldenPlayerPoints } from './golden-score.mjs';

describe('Golden Game player score normalization', () => {
  it('reads the Season 2 player ID and lineup-index format', () => {
    expect(goldenPlayerPoints({ 'player-123-2': '5' }, 'player-123', 2)).toBe(5);
  });

  it('reads the Season 3 direct player ID format', () => {
    expect(goldenPlayerPoints({ 'player-123': '4' }, 'player-123', 2)).toBe(4);
  });

  it('prefers the explicit lineup-index score when both formats exist', () => {
    expect(goldenPlayerPoints({ 'player-123': '2', 'player-123-2': '5' }, 'player-123', 2)).toBe(5);
  });
});
