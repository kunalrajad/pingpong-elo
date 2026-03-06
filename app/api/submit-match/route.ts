import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  updateElo,
  updateEloScoreBased,
  updateDoublesElo,
  updateDoublesEloScoreBased,
} from "@/lib/elo";

type Body = {
  matchType?: "singles" | "doubles";
  playerAId: string;
  playerBId: string;
  winnerId?: string;
  teammateAId?: string;
  teammateBId?: string;
  winnerTeam?: "A" | "B";
  scoreA?: number;
  scoreB?: number;
};

function isNonNegativeInt(n: unknown) {
  return Number.isInteger(n) && (n as number) >= 0;
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  const matchType = body.matchType ?? "singles";
  const SINGLES_K = 32;
  const DOUBLES_K = 24;
  const kFactor = matchType === "doubles" ? DOUBLES_K : SINGLES_K;

  const { playerAId, playerBId } = body;

  if (!playerAId || !playerBId) {
    return NextResponse.json({ error: "Missing player fields" }, { status: 400 });
  }

  if (playerAId === playerBId) {
    return NextResponse.json({ error: "Players must be different" }, { status: 400 });
  }

  const hasScoreA = body.scoreA !== undefined && body.scoreA !== null;
  const hasScoreB = body.scoreB !== undefined && body.scoreB !== null;
  const useScores = hasScoreA && hasScoreB;

  let scoreA: number | null = null;
  let scoreB: number | null = null;

  if (useScores) {
    if (!isNonNegativeInt(body.scoreA) || !isNonNegativeInt(body.scoreB)) {
      return NextResponse.json(
        { error: "Scores must be non-negative integers" },
        { status: 400 }
      );
    }

    scoreA = body.scoreA!;
    scoreB = body.scoreB!;

    if (scoreA === scoreB) {
      return NextResponse.json({ error: "Scores cannot be tied" }, { status: 400 });
    }
  } else if (hasScoreA || hasScoreB) {
    return NextResponse.json(
      { error: "Enter both scores (or leave both blank)." },
      { status: 400 }
    );
  }

  // -------------------------
  // SINGLES
  // -------------------------
  if (matchType === "singles") {
    const { winnerId } = body;

    if (!winnerId) {
      return NextResponse.json({ error: "Missing winnerId" }, { status: 400 });
    }

    if (winnerId !== playerAId && winnerId !== playerBId) {
      return NextResponse.json(
        { error: "Winner must be Player A or Player B" },
        { status: 400 }
      );
    }

    if (useScores) {
      const aWonByScore = scoreA! > scoreB!;
      const aWonByWinner = winnerId === playerAId;

      if (aWonByScore !== aWonByWinner) {
        return NextResponse.json(
          { error: "Winner does not match the submitted score" },
          { status: 400 }
        );
      }
    }

    const { data: players, error: fetchErr } = await supabase
      .from("players")
      .select(`
        id,
        name,
        singles_rating,
        wins,
        losses,
        games_played,
        singles_wins,
        singles_losses,
        singles_games
      `)
      .in("id", [playerAId, playerBId]);

    if (fetchErr || !players || players.length !== 2) {
      return NextResponse.json({ error: "Could not load players" }, { status: 500 });
    }

    const a = players.find((p) => p.id === playerAId)!;
    const b = players.find((p) => p.id === playerBId)!;

    const aWon = winnerId === playerAId;

    let newA: number;
    let newB: number;

    if (useScores) {
      const res = updateEloScoreBased(
        a.singles_rating,
        b.singles_rating,
        aWon,
        scoreA!,
        scoreB!,
        kFactor
      );
      newA = res.newA;
      newB = res.newB;
    } else {
      const res = updateElo(a.singles_rating, b.singles_rating, aWon, kFactor);
      newA = res.newA;
      newB = res.newB;
    }

    const { error: matchErr } = await supabase.from("matches").insert({
      match_type: "singles",
      player_a: a.id,
      player_b: b.id,
      winner: winnerId,
      teammate_a: null,
      teammate_b: null,
      rating_a_before: a.singles_rating,
      rating_b_before: b.singles_rating,
      rating_a_after: newA,
      rating_b_after: newB,
      k_factor: kFactor,
      score_a: scoreA,
      score_b: scoreB,
    });

    if (matchErr) {
      return NextResponse.json({ error: "Failed to insert match" }, { status: 500 });
    }

    const aUpdate = {
      singles_rating: newA,

      // overall
      games_played: a.games_played + 1,
      wins: a.wins + (aWon ? 1 : 0),
      losses: a.losses + (aWon ? 0 : 1),

      // singles-specific
      singles_games: a.singles_games + 1,
      singles_wins: a.singles_wins + (aWon ? 1 : 0),
      singles_losses: a.singles_losses + (aWon ? 0 : 1),
    };

    const bUpdate = {
      singles_rating: newB,

      // overall
      games_played: b.games_played + 1,
      wins: b.wins + (aWon ? 0 : 1),
      losses: b.losses + (aWon ? 1 : 0),

      // singles-specific
      singles_games: b.singles_games + 1,
      singles_wins: b.singles_wins + (aWon ? 0 : 1),
      singles_losses: b.singles_losses + (aWon ? 1 : 0),
    };

    const { error: updAErr } = await supabase
      .from("players")
      .update(aUpdate)
      .eq("id", a.id);

    if (updAErr) {
      return NextResponse.json({ error: "Failed updating player A" }, { status: 500 });
    }

    const { error: updBErr } = await supabase
      .from("players")
      .update(bUpdate)
      .eq("id", b.id);

    if (updBErr) {
      return NextResponse.json({ error: "Failed updating player B" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, matchType: "singles", usedScores: useScores });
  }

  // -------------------------
  // DOUBLES
  // -------------------------
  const { teammateAId, teammateBId, winnerTeam } = body;

  if (!teammateAId || !teammateBId) {
    return NextResponse.json(
      { error: "Missing teammate fields for doubles" },
      { status: 400 }
    );
  }

  if (!winnerTeam || (winnerTeam !== "A" && winnerTeam !== "B")) {
    return NextResponse.json(
      { error: "Missing winnerTeam for doubles" },
      { status: 400 }
    );
  }

  const ids = [playerAId, teammateAId, playerBId, teammateBId];

  if (new Set(ids).size !== 4) {
    return NextResponse.json(
      { error: "All four players must be different" },
      { status: 400 }
    );
  }

  if (useScores) {
    const aTeamWonByScore = scoreA! > scoreB!;
    const aTeamWonByWinner = winnerTeam === "A";

    if (aTeamWonByScore !== aTeamWonByWinner) {
      return NextResponse.json(
        { error: "Winner team does not match the submitted score" },
        { status: 400 }
      );
    }
  }

  const { data: players4, error: fetch4Err } = await supabase
    .from("players")
    .select(`
      id,
      name,
      doubles_rating,
      wins,
      losses,
      games_played,
      doubles_wins,
      doubles_losses,
      doubles_games
    `)
    .in("id", ids);

  if (fetch4Err || !players4 || players4.length !== 4) {
    return NextResponse.json(
      { error: "Could not load players for doubles" },
      { status: 500 }
    );
  }

  const A1 = players4.find((p) => p.id === playerAId)!;
  const A2 = players4.find((p) => p.id === teammateAId)!;
  const B1 = players4.find((p) => p.id === playerBId)!;
  const B2 = players4.find((p) => p.id === teammateBId)!;

  const aTeamWon = winnerTeam === "A";

  let newA1: number;
  let newA2: number;
  let newB1: number;
  let newB2: number;

  if (useScores) {
    const res = updateDoublesEloScoreBased(
      A1.doubles_rating,
      A2.doubles_rating,
      B1.doubles_rating,
      B2.doubles_rating,
      aTeamWon,
      scoreA!,
      scoreB!,
      kFactor
    );
    newA1 = res.newA1;
    newA2 = res.newA2;
    newB1 = res.newB1;
    newB2 = res.newB2;
  } else {
    const res = updateDoublesElo(
      A1.doubles_rating,
      A2.doubles_rating,
      B1.doubles_rating,
      B2.doubles_rating,
      aTeamWon,
      kFactor
    );
    newA1 = res.newA1;
    newA2 = res.newA2;
    newB1 = res.newB1;
    newB2 = res.newB2;
  }

  const winnerAnchor = aTeamWon ? playerAId : playerBId;

  const { error: matchErr } = await supabase.from("matches").insert({
    match_type: "doubles",
    player_a: playerAId,
    teammate_a: teammateAId,
    player_b: playerBId,
    teammate_b: teammateBId,
    winner: winnerAnchor,
    rating_a_before: A1.doubles_rating,
    rating_b_before: B1.doubles_rating,
    rating_a_after: newA1,
    rating_b_after: newB1,
    k_factor: kFactor,
    score_a: scoreA,
    score_b: scoreB,
  });

  if (matchErr) {
    return NextResponse.json(
      { error: "Failed to insert doubles match" },
      { status: 500 }
    );
  }

  const aWin = aTeamWon ? 1 : 0;
  const aLoss = aTeamWon ? 0 : 1;
  const bWin = aTeamWon ? 0 : 1;
  const bLoss = aTeamWon ? 1 : 0;

  const { error: upd1 } = await supabase
    .from("players")
    .update({
      doubles_rating: newA1,

      // overall
      games_played: A1.games_played + 1,
      wins: A1.wins + aWin,
      losses: A1.losses + aLoss,

      // doubles-specific
      doubles_games: A1.doubles_games + 1,
      doubles_wins: A1.doubles_wins + aWin,
      doubles_losses: A1.doubles_losses + aLoss,
    })
    .eq("id", A1.id);

  const { error: upd2 } = await supabase
    .from("players")
    .update({
      doubles_rating: newA2,

      // overall
      games_played: A2.games_played + 1,
      wins: A2.wins + aWin,
      losses: A2.losses + aLoss,

      // doubles-specific
      doubles_games: A2.doubles_games + 1,
      doubles_wins: A2.doubles_wins + aWin,
      doubles_losses: A2.doubles_losses + aLoss,
    })
    .eq("id", A2.id);

  const { error: upd3 } = await supabase
    .from("players")
    .update({
      doubles_rating: newB1,

      // overall
      games_played: B1.games_played + 1,
      wins: B1.wins + bWin,
      losses: B1.losses + bLoss,

      // doubles-specific
      doubles_games: B1.doubles_games + 1,
      doubles_wins: B1.doubles_wins + bWin,
      doubles_losses: B1.doubles_losses + bLoss,
    })
    .eq("id", B1.id);

  const { error: upd4 } = await supabase
    .from("players")
    .update({
      doubles_rating: newB2,

      // overall
      games_played: B2.games_played + 1,
      wins: B2.wins + bWin,
      losses: B2.losses + bLoss,

      // doubles-specific
      doubles_games: B2.doubles_games + 1,
      doubles_wins: B2.doubles_wins + bWin,
      doubles_losses: B2.doubles_losses + bLoss,
    })
    .eq("id", B2.id);

  if (upd1 || upd2 || upd3 || upd4) {
    return NextResponse.json(
      { error: "Failed updating doubles ratings/counters" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, matchType: "doubles", usedScores: useScores });
}
