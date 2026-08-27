export type MatchType = 'singles' | 'doubles' | 'golden';
export type MatchFilter = 'all' | MatchType;

export type Player = {
  id: string;
  sourceIds: string[];
  spindexId?: string;
  name: string;
  aliases: string[];
  avatar?: string;
  country?: string;
};

export type Team = {
  id: string;
  name: string;
  score: number;
};

export type MatchSide = {
  playerIds: string[];
  playerNames: string[];
  score: number;
  games?: number[];
};

export type GoldenPair = {
  playerAId: string;
  playerBId: string;
  pointsA?: number;
  pointsB?: number;
};

export type MatchRecord = {
  id: string;
  sourceMatchId: string;
  scheduleId: string;
  date: string;
  event: string;
  location: string;
  season: string;
  type: MatchType;
  sourceUrl: string;
  teamA: Team;
  teamB: Team;
  sideA: MatchSide;
  sideB: MatchSide;
  winner: 'A' | 'B' | null;
  goldenPairs?: GoldenPair[];
};

export type MlttDataset = {
  schemaVersion: 1;
  refreshedAt: string;
  source: { name: string; apiBase: string; resultsPage: string };
  seasons: Array<{ id: string; name: string; startDate: string; endDate: string; eventCount: number }>;
  teams: Array<{ id: string; name: string }>;
  players: Player[];
  matches: MatchRecord[];
  warnings: string[];
  stats: { events: number; teamMatches: number; scorecards: number; directRecords: number };
};
