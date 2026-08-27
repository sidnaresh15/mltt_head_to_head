import type { GoldenPair, MatchFilter, MatchRecord, MatchType, Player } from './types';

export type Perspective = {
  match: MatchRecord;
  player1Side: 'A' | 'B';
  player2Side: 'A' | 'B';
  player1Score: number;
  player2Score: number;
  winner: 'player1' | 'player2' | 'tie';
  goldenPair?: GoldenPair;
};

export type RecordLine = {
  meetings: number;
  player1Wins: number;
  player2Wins: number;
  ties: number;
};

export function normalizeSearch(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

export function rankPlayers(players: Player[], query: string, excludedId?: string, limit = 8) {
  const needle = normalizeSearch(query);
  if (!needle) return players.filter((player) => player.id !== excludedId).slice(0, limit);

  return players
    .filter((player) => player.id !== excludedId)
    .map((player) => {
      const searchable = [player.name, ...player.aliases].map(normalizeSearch);
      let score = Number.POSITIVE_INFINITY;
      for (const name of searchable) {
        if (name.startsWith(needle)) score = Math.min(score, 0);
        else if (name.split(' ').some((part) => part.startsWith(needle))) score = Math.min(score, 1);
        else if (name.includes(needle)) score = Math.min(score, 2);
      }
      return { player, score };
    })
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => a.score - b.score || a.player.name.localeCompare(b.player.name))
    .slice(0, limit)
    .map(({ player }) => player);
}

function directGoldenPair(match: MatchRecord, player1Id: string, player2Id: string) {
  return match.goldenPairs?.find(
    (pair) =>
      (pair.playerAId === player1Id && pair.playerBId === player2Id) ||
      (pair.playerAId === player2Id && pair.playerBId === player1Id),
  );
}

export function getMatchPerspective(match: MatchRecord, player1Id: string, player2Id: string): Perspective | null {
  if (player1Id === player2Id) return null;

  if (match.type === 'golden') {
    const goldenPair = directGoldenPair(match, player1Id, player2Id);
    if (!goldenPair) return null;
    const player1Side = goldenPair.playerAId === player1Id ? 'A' : 'B';
    const player1Score = player1Side === 'A' ? goldenPair.pointsA ?? 0 : goldenPair.pointsB ?? 0;
    const player2Score = player1Side === 'A' ? goldenPair.pointsB ?? 0 : goldenPair.pointsA ?? 0;
    return {
      match,
      player1Side,
      player2Side: player1Side === 'A' ? 'B' : 'A',
      player1Score,
      player2Score,
      winner: player1Score === player2Score ? 'tie' : player1Score > player2Score ? 'player1' : 'player2',
      goldenPair,
    };
  }

  const player1InA = match.sideA.playerIds.includes(player1Id);
  const player1InB = match.sideB.playerIds.includes(player1Id);
  const player2InA = match.sideA.playerIds.includes(player2Id);
  const player2InB = match.sideB.playerIds.includes(player2Id);
  if (!((player1InA && player2InB) || (player1InB && player2InA))) return null;

  const player1Side = player1InA ? 'A' : 'B';
  const player1Score = player1Side === 'A' ? match.sideA.score : match.sideB.score;
  const player2Score = player1Side === 'A' ? match.sideB.score : match.sideA.score;
  return {
    match,
    player1Side,
    player2Side: player1Side === 'A' ? 'B' : 'A',
    player1Score,
    player2Score,
    winner: player1Score === player2Score ? 'tie' : player1Score > player2Score ? 'player1' : 'player2',
  };
}

export function directMeetings(matches: MatchRecord[], player1Id: string, player2Id: string, filter: MatchFilter = 'all') {
  return matches
    .filter((match) => filter === 'all' || match.type === filter)
    .map((match) => getMatchPerspective(match, player1Id, player2Id))
    .filter((perspective): perspective is Perspective => perspective !== null);
}

export function recordLine(meetings: Perspective[]): RecordLine {
  return meetings.reduce<RecordLine>(
    (record, meeting) => {
      record.meetings += 1;
      if (meeting.winner === 'player1') record.player1Wins += 1;
      else if (meeting.winner === 'player2') record.player2Wins += 1;
      else record.ties += 1;
      return record;
    },
    { meetings: 0, player1Wins: 0, player2Wins: 0, ties: 0 },
  );
}

export function summaryByType(meetings: Perspective[]) {
  const types: MatchType[] = ['singles', 'doubles', 'golden'];
  return Object.fromEntries(types.map((type) => [type, recordLine(meetings.filter((meeting) => meeting.match.type === type))])) as Record<MatchType, RecordLine>;
}
