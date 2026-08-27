import { describe, expect, it } from 'vitest';
import { directMeetings, getMatchPerspective } from './matchup';
import type { MatchRecord } from './types';

const goldenMatch: MatchRecord = {
  id: 'match-1:golden_game',
  sourceMatchId: 'match-1',
  scheduleId: 'week-1',
  date: '2026-01-10',
  event: 'Week 1',
  location: 'Princeton, New Jersey',
  season: 'Season 3',
  type: 'golden',
  sourceUrl: 'https://www.mltt.com/league/results',
  teamA: { id: 'red', name: 'Red Team', score: 12 },
  teamB: { id: 'blue', name: 'Blue Team', score: 9 },
  sideA: { playerIds: ['a', 'c'], playerNames: ['Player A', 'Player C'], score: 21 },
  sideB: { playerIds: ['b', 'd'], playerNames: ['Player B', 'Player D'], score: 18 },
  winner: 'A',
  goldenPairs: [
    { playerAId: 'a', playerBId: 'b', pointsA: 4, pointsB: 2 },
    { playerAId: 'c', playerBId: 'd', pointsA: 3, pointsB: 4 },
  ],
};

describe('Golden Game direct-opponent filtering', () => {
  it('includes a true direct Golden Game pair', () => {
    const meetings = directMeetings([goldenMatch], 'a', 'b');
    expect(meetings).toHaveLength(1);
    expect(meetings[0]).toMatchObject({ player1Score: 4, player2Score: 2, winner: 'player1' });
  });

  it('excludes opposing-team players who faced different lineup opponents', () => {
    expect(directMeetings([goldenMatch], 'a', 'd')).toEqual([]);
  });

  it('reverses the display perspective without losing the matchup', () => {
    const forward = getMatchPerspective(goldenMatch, 'a', 'b');
    const reverse = getMatchPerspective(goldenMatch, 'b', 'a');
    expect(reverse).not.toBeNull();
    expect(reverse?.player1Score).toBe(forward?.player2Score);
    expect(reverse?.player2Score).toBe(forward?.player1Score);
    expect(reverse?.winner).toBe('player2');
  });
});
