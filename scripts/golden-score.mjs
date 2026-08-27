export function goldenPlayerPoints(playerScores, playerId, lineupIndex) {
  const rawScore = playerScores?.[`${playerId}-${lineupIndex}`] ?? playerScores?.[playerId];
  const score = Number(rawScore);
  return Number.isFinite(score) ? score : 0;
}
