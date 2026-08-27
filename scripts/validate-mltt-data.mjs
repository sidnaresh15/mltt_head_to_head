import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'public', 'data', 'mltt.json');

function fail(message) {
  throw new Error(`MLTT dataset validation failed: ${message}`);
}

const data = JSON.parse(await readFile(path, 'utf8'));
if (data.schemaVersion !== 1) fail('unexpected schemaVersion');
if (!data.refreshedAt || Number.isNaN(Date.parse(data.refreshedAt))) fail('invalid refreshedAt');
if (!Array.isArray(data.players) || data.players.length === 0) fail('no players');
if (!Array.isArray(data.matches) || data.matches.length === 0) fail('no matches');

const playerIds = new Set();
for (const player of data.players) {
  if (!player.id || !player.name || !Array.isArray(player.sourceIds) || player.sourceIds.length === 0) fail(`invalid player ${player.id ?? '(unknown)'}`);
  if (playerIds.has(player.id)) fail(`duplicate player ${player.id}`);
  playerIds.add(player.id);
}

const matchIds = new Set();
for (const match of data.matches) {
  if (!match.id || !match.date || !match.event || !match.season || !match.sourceUrl) fail(`invalid match ${match.id ?? '(unknown)'}`);
  if (matchIds.has(match.id)) fail(`duplicate match ${match.id}`);
  matchIds.add(match.id);
  if (!['singles', 'doubles', 'golden'].includes(match.type)) fail(`${match.id}: invalid type`);
  if (![...match.sideA.playerIds, ...match.sideB.playerIds].every((id) => playerIds.has(id))) fail(`${match.id}: unknown player reference`);
  if (match.type === 'golden') {
    if (!Array.isArray(match.goldenPairs) || match.goldenPairs.length === 0) fail(`${match.id}: no Golden Game pairs`);
    for (const pair of match.goldenPairs) {
      if (!playerIds.has(pair.playerAId) || !playerIds.has(pair.playerBId)) fail(`${match.id}: invalid Golden Game pair`);
    }
  }
}

console.log(`Validated ${data.players.length} players and ${data.matches.length} records (refreshed ${data.refreshedAt}).`);
