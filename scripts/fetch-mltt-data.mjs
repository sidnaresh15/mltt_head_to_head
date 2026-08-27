import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'public', 'data', 'mltt.json');
const CACHE = join(ROOT, '.cache', 'mltt');
const API = 'https://web.mltt.com/api';
const RESULT_PAGE = 'https://www.mltt.com/league/results';
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const FORCE = process.argv.includes('--force');
const today = new Date().toISOString().slice(0, 10);

const warnings = [];
const players = new Map();
const sourceIdToCanonical = new Map();
const spindexToCanonical = new Map();
const teams = new Map();

function normalizeForComparison(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readCache(key) {
  const path = join(CACHE, `${key}.json`);
  try {
    const details = await stat(path);
    if (!FORCE && Date.now() - details.mtimeMs < CACHE_MAX_AGE_MS) return readJson(path);
  } catch {
    // A cold cache is expected in CI.
  }
  return null;
}

async function fetchJson(path, cacheKey) {
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${API}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'mltt-matchup-static-archive/1.0' },
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const body = await response.json();
      await mkdir(CACHE, { recursive: true });
      await writeFile(join(CACHE, `${cacheKey}.json`), `${JSON.stringify(body)}\n`);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`${path}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function requiredString(value, field, context) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${context}: missing ${field}`);
  return value.trim();
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function registerPlayer(raw, context) {
  if (!raw || typeof raw !== 'object') throw new Error(`${context}: missing player`);
  const sourceId = requiredString(raw.id, 'player.id', context);
  const name = requiredString(raw.name, 'player.name', context);
  const spindexId = typeof raw.spindexId === 'string' && raw.spindexId.trim() ? raw.spindexId.trim() : undefined;
  let canonicalId = sourceIdToCanonical.get(sourceId);

  if (!canonicalId && spindexId) {
    const existing = spindexToCanonical.get(spindexId);
    if (existing) {
      const existingPlayer = players.get(existing);
      if (existingPlayer && normalizeForComparison(existingPlayer.name) === normalizeForComparison(name)) canonicalId = existing;
      else warnings.push(`${context}: SPINDEX ${spindexId} has conflicting names; kept source IDs separate.`);
    }
  }

  canonicalId ??= `player:${sourceId}`;
  sourceIdToCanonical.set(sourceId, canonicalId);
  if (spindexId && !spindexToCanonical.has(spindexId)) spindexToCanonical.set(spindexId, canonicalId);

  const existing = players.get(canonicalId);
  if (existing) {
    if (!existing.sourceIds.includes(sourceId)) existing.sourceIds.push(sourceId);
    if (existing.name !== name && !existing.aliases.includes(name)) existing.aliases.push(name);
  } else {
    players.set(canonicalId, {
      id: canonicalId,
      sourceIds: [sourceId],
      ...(spindexId ? { spindexId } : {}),
      name,
      aliases: [],
      ...(typeof raw.avatar === 'string' && raw.avatar.startsWith('http') ? { avatar: raw.avatar } : {}),
      ...(typeof raw.citizenship === 'string' && raw.citizenship ? { country: raw.citizenship } : {}),
    });
  }
  return canonicalId;
}

function registerTeam(raw, context) {
  const id = requiredString(raw?.id, 'team.id', context);
  const name = requiredString(raw?.name, 'team.name', context);
  if (!teams.has(id)) teams.set(id, { id, name });
  return id;
}

function roundGames(round) {
  return [1, 2, 3].map((index) => numberOrZero(round?.[`gm_${index}`]));
}

function playerSide(round, field, context) {
  const raw = round?.[field];
  return {
    playerIds: [registerPlayer(raw, context)],
    playerNames: [raw.name],
  };
}

function doublesSide(round, context) {
  const rawPlayers = [round?.playerA, round?.playerB];
  if (rawPlayers.some((player) => !player)) throw new Error(`${context}: incomplete doubles side`);
  return {
    playerIds: rawPlayers.map((player) => registerPlayer(player, context)),
    playerNames: rawPlayers.map((player) => player.name),
  };
}

function baseRecord(match, event, season, scorecard, key, type) {
  const teamA = scorecard.teamA?.team_info;
  const teamB = scorecard.teamB?.team_info;
  return {
    id: `${match.id}:${key}`,
    sourceMatchId: match.id,
    scheduleId: match.scheduleId,
    date: match.date,
    event: event.venue,
    location: [event.city, event.state].filter(Boolean).join(', '),
    season: season.seasonName,
    type,
    sourceUrl: RESULT_PAGE,
    teamA: { id: registerTeam(teamA, match.id), name: teamA.name, score: numberOrZero(scorecard.teamA?.team_score) },
    teamB: { id: registerTeam(teamB, match.id), name: teamB.name, score: numberOrZero(scorecard.teamB?.team_score) },
  };
}

function normalizeStandardRound(match, event, season, scorecard, key, type) {
  const roundA = scorecard.teamA?.[key];
  const roundB = scorecard.teamB?.[key];
  if (!roundA || !roundB) throw new Error(`${match.id}: missing ${key}`);
  const context = `${match.id}/${key}`;
  const sideA = type === 'doubles' ? doublesSide(roundA, context) : playerSide(roundA, 'player', context);
  const sideB = type === 'doubles' ? doublesSide(roundB, context) : playerSide(roundB, 'player', context);
  const scoreA = numberOrZero(roundA.round_score);
  const scoreB = numberOrZero(roundB.round_score);
  return {
    ...baseRecord(match, event, season, scorecard, key, type),
    sideA: { ...sideA, score: scoreA, games: roundGames(roundA) },
    sideB: { ...sideB, score: scoreB, games: roundGames(roundB) },
    winner: scoreA === scoreB ? null : scoreA > scoreB ? 'A' : 'B',
  };
}

function normalizeGoldenRound(match, event, season, scorecard) {
  const roundA = scorecard.teamA?.golden_game;
  const roundB = scorecard.teamB?.golden_game;
  if (!roundA || !roundB) throw new Error(`${match.id}: missing golden_game`);
  if (!Array.isArray(roundA.players) || !Array.isArray(roundB.players)) throw new Error(`${match.id}: Golden Game lineups are missing`);
  if (!roundA.playerScores || !roundB.playerScores || roundA.players.length !== roundB.players.length) {
    throw new Error(`${match.id}: Golden Game lineup positions cannot be paired reliably`);
  }

  const context = `${match.id}/golden_game`;
  const sideAPlayers = roundA.players.map((player) => ({ raw: player, id: registerPlayer(player, context) }));
  const sideBPlayers = roundB.players.map((player) => ({ raw: player, id: registerPlayer(player, context) }));
  const goldenPairs = sideAPlayers.map((playerA, index) => {
    const playerB = sideBPlayers[index];
    return {
      playerAId: playerA.id,
      playerBId: playerB.id,
      pointsA: numberOrZero(roundA.playerScores[playerA.raw.id]),
      pointsB: numberOrZero(roundB.playerScores[playerB.raw.id]),
    };
  });

  return {
    ...baseRecord(match, event, season, scorecard, 'golden_game', 'golden'),
    sideA: {
      playerIds: sideAPlayers.map((player) => player.id),
      playerNames: sideAPlayers.map((player) => player.raw.name),
      score: numberOrZero(roundA.score),
    },
    sideB: {
      playerIds: sideBPlayers.map((player) => player.id),
      playerNames: sideBPlayers.map((player) => player.raw.name),
      score: numberOrZero(roundB.score),
    },
    winner: numberOrZero(roundA.score) === numberOrZero(roundB.score) ? null : numberOrZero(roundA.score) > numberOrZero(roundB.score) ? 'A' : 'B',
    goldenPairs,
  };
}

function validateDataset(data) {
  if (data.schemaVersion !== 1) throw new Error('Dataset schemaVersion must be 1');
  if (!Array.isArray(data.players) || data.players.length === 0) throw new Error('Dataset has no players');
  if (!Array.isArray(data.matches) || data.matches.length === 0) throw new Error('Dataset has no matches');
  const ids = new Set(data.players.map((player) => player.id));
  for (const match of data.matches) {
    if (!match.id || !match.date || !match.event || !['singles', 'doubles', 'golden'].includes(match.type)) {
      throw new Error(`Invalid match ${match.id ?? '(unknown)'}`);
    }
    const involved = [...match.sideA.playerIds, ...match.sideB.playerIds];
    if (involved.some((id) => !ids.has(id))) throw new Error(`${match.id}: references an unknown player`);
    if (match.type === 'golden' && (!Array.isArray(match.goldenPairs) || match.goldenPairs.length === 0)) {
      throw new Error(`${match.id}: has no direct Golden Game pairs`);
    }
  }
}

async function main() {
  const seasons = await fetchJson('/seasons', 'seasons');
  if (!Array.isArray(seasons) || seasons.length === 0) throw new Error('The seasons endpoint did not return an array');

  const usableSeasons = [];
  const eventContexts = [];
  for (const season of seasons) {
    requiredString(season.id, 'season.id', 'seasons');
    requiredString(season.seasonName, 'seasonName', season.id);
    if (season.startDate > season.endDate) {
      warnings.push(`${season.seasonName}: official start date is after its end date; season skipped.`);
      continue;
    }
    const response = await fetchJson(`/schedules?seasonId=${encodeURIComponent(season.id)}&limit=100`, `events-${season.id}`);
    if (!response || !Array.isArray(response.data)) throw new Error(`${season.seasonName}: schedules response changed shape`);
    if (response.data.length === 0) warnings.push(`${season.seasonName}: official schedules endpoint returned no events.`);
    usableSeasons.push({ id: season.id, name: season.seasonName, startDate: season.startDate, endDate: season.endDate, eventCount: response.data.length });
    for (const event of response.data) {
      if (event.startDate <= today) eventContexts.push({ event, season });
    }
  }

  const matchGroups = await mapLimit(eventContexts, 6, async ({ event, season }) => {
    try {
      const matches = await fetchJson(`/schedules/${encodeURIComponent(event.id)}/matches`, `matches-${event.id}`);
      if (!Array.isArray(matches)) throw new Error('matches response changed shape');
      return matches.filter((match) => match.date <= today).map((match) => ({ match, event, season }));
    } catch (error) {
      warnings.push(`${season.seasonName}/${event.venue}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  });

  const uniqueMatchContexts = [];
  const seenMatches = new Set();
  for (const context of matchGroups.flat()) {
    if (!seenMatches.has(context.match.id)) {
      seenMatches.add(context.match.id);
      uniqueMatchContexts.push(context);
    }
  }

  let fetchedScorecards = 0;
  const normalizedGroups = await mapLimit(uniqueMatchContexts, 5, async ({ match, event, season }) => {
    const team1Id = match.team1?.id ?? match.team1Id;
    const team2Id = match.team2?.id ?? match.team2Id;
    try {
      const scorecard = await fetchJson(
        `/results?matchId=${encodeURIComponent(match.id)}&team1Id=${encodeURIComponent(team1Id)}&team2Id=${encodeURIComponent(team2Id)}`,
        `result-${match.id}`,
      );
      if (!scorecard?.teamA?.team_info || !scorecard?.teamB?.team_info) throw new Error('results response changed shape');
      fetchedScorecards += 1;
      const records = [];
      for (const key of ['singles_1', 'singles_2', 'singles_3', 'singles_4']) {
        try { records.push(normalizeStandardRound(match, event, season, scorecard, key, 'singles')); }
        catch (error) { warnings.push(error instanceof Error ? error.message : String(error)); }
      }
      try { records.push(normalizeStandardRound(match, event, season, scorecard, 'doubles_1', 'doubles')); }
      catch (error) { warnings.push(error instanceof Error ? error.message : String(error)); }
      try { records.push(normalizeGoldenRound(match, event, season, scorecard)); }
      catch (error) { warnings.push(error instanceof Error ? error.message : String(error)); }
      return records;
    } catch (error) {
      warnings.push(`${season.seasonName}/${match.id}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  });

  const sortedPlayers = [...players.values()]
    .map((player) => ({ ...player, sourceIds: [...player.sourceIds].sort(), aliases: [...player.aliases].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const sortedMatches = normalizedGroups.flat().sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const content = {
    schemaVersion: 1,
    source: { name: 'Major League Table Tennis', apiBase: API, resultsPage: RESULT_PAGE },
    seasons: usableSeasons,
    teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)),
    players: sortedPlayers,
    matches: sortedMatches,
    warnings: [...new Set(warnings)].sort(),
    stats: { events: eventContexts.length, teamMatches: uniqueMatchContexts.length, scorecards: fetchedScorecards, directRecords: sortedMatches.length },
  };
  validateDataset(content);

  let previous;
  try { previous = await readJson(OUTPUT); } catch { /* first run */ }
  let previousComparable = null;
  if (previous) {
    const { refreshedAt: _refreshedAt, contentHash: _contentHash, ...comparable } = previous;
    previousComparable = comparable;
  }
  const nextHash = digest(content);
  if (previousComparable && digest(previousComparable) === nextHash) {
    console.log(`MLTT data unchanged; kept ${previous.refreshedAt}.`);
    return;
  }

  const output = { ...content, refreshedAt: new Date().toISOString(), contentHash: nextHash };
  await mkdir(dirname(OUTPUT), { recursive: true });
  const temporary = `${OUTPUT}.tmp`;
  await writeFile(temporary, `${JSON.stringify(output)}\n`);
  await rename(temporary, OUTPUT);
  console.log(`Saved ${output.players.length} players and ${output.matches.length} direct records from ${fetchedScorecards} official scorecards.`);
  if (output.warnings.length) console.warn(`${output.warnings.length} source records or fields need review; see dataset warnings.`);
}

main().catch(async (error) => {
  console.error(`MLTT refresh failed: ${error instanceof Error ? error.message : String(error)}`);
  try {
    const fallback = await readJson(OUTPUT);
    validateDataset(fallback);
    console.error(`Kept committed fallback dataset refreshed ${fallback.refreshedAt}.`);
  } catch {
    console.error('No valid committed fallback dataset is available.');
  }
  process.exitCode = 1;
});
