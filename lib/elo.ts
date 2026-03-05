export function expectedScore(rA: number, rB: number) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

export function updateElo(rA: number, rB: number, aWon: boolean, k = 32) {
  const eA = expectedScore(rA, rB);
  const eB = 1 - eA;

  const sA = aWon ? 1 : 0;
  const sB = aWon ? 0 : 1;

  const newA = Math.round(rA + k * (sA - eA));
  const newB = Math.round(rB + k * (sB - eB));

  return { newA, newB, eA, eB };
}

export function marginMultiplier(scoreA: number, scoreB: number) {
  const diff = Math.abs(scoreA - scoreB);

  // Simple, tunable scaling:
  // diff=2 -> 1.2x, diff=10 -> 2.0x (capped)
  const mult = 1 + diff / 10;

  // Cap so blowouts don't create insane swings
  return Math.min(mult, 2.0);
}

export function updateEloScoreBased(
  rA: number,
  rB: number,
  aWon: boolean,
  scoreA: number,
  scoreB: number,
  k = 32
) {
  const eA = expectedScore(rA, rB);
  const eB = 1 - eA;

  const sA = aWon ? 1 : 0;
  const sB = aWon ? 0 : 1;

  const mult = marginMultiplier(scoreA, scoreB);

  const newA = Math.round(rA + k * mult * (sA - eA));
  const newB = Math.round(rB + k * mult * (sB - eB));

  return { newA, newB, eA, eB, mult };
}

export function winProb(rA: number, rB: number) {
  return expectedScore(rA, rB); // same thing, nicer name
}

export function updateDoublesElo(
  rA1: number,
  rA2: number,
  rB1: number,
  rB2: number,
  aTeamWon: boolean,
  k = 24
) {
  const teamA = (rA1 + rA2) / 2;
  const teamB = (rB1 + rB2) / 2;

  const eA = expectedScore(teamA, teamB);
  const sA = aTeamWon ? 1 : 0;

  const deltaTeamA = k * (sA - eA);
  const deltaEach = deltaTeamA / 2;

  const newA1 = Math.round(rA1 + deltaEach);
  const newA2 = Math.round(rA2 + deltaEach);
  const newB1 = Math.round(rB1 - deltaEach);
  const newB2 = Math.round(rB2 - deltaEach);

  return { newA1, newA2, newB1, newB2, eA, deltaEach };
}

export function updateDoublesEloScoreBased(
  rA1: number,
  rA2: number,
  rB1: number,
  rB2: number,
  aTeamWon: boolean,
  scoreA: number,
  scoreB: number,
  k = 24
) {
  const teamA = (rA1 + rA2) / 2;
  const teamB = (rB1 + rB2) / 2;

  const eA = expectedScore(teamA, teamB);
  const sA = aTeamWon ? 1 : 0;

  const mult = marginMultiplier(scoreA, scoreB);
  const deltaTeamA = k * mult * (sA - eA);
  const deltaEach = deltaTeamA / 2;

  const newA1 = Math.round(rA1 + deltaEach);
  const newA2 = Math.round(rA2 + deltaEach);
  const newB1 = Math.round(rB1 - deltaEach);
  const newB2 = Math.round(rB2 - deltaEach);

  return { newA1, newA2, newB1, newB2, eA, deltaEach, mult };
}
