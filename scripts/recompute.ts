import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import {
  updateElo,
  updateEloScoreBased,
  updateDoublesElo,
  updateDoublesEloScoreBased,
} from "../lib/elo";

type PlayerRow = { id: string; name: string };

type MatchRow = {
  id: string;
  match_type: "singles" | "doubles";
  created_at: string;

  player_a: string;
  player_b: string;
  teammate_a: string | null;
  teammate_b: string | null;

  winner: string; // singles: winner player id, doubles: winner "anchor" (player_a or player_b)
  k_factor: number | null;
  score_a: number | null;
  score_b: number | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
if (!supabaseAnonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY missing");

const supabase = createClient(supabaseUrl, supabaseAnonKey);

type State = {
  singles_rating: number;
  doubles_rating: number;
  wins: number;
  losses: number;
  games_played: number;
};

const BASE_SINGLES = 1000;
const BASE_DOUBLES = 1000;

async function main() {
  // 1) Load players
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id,name");

  if (pErr || !players) throw pErr ?? new Error("Failed to load players");

  // init state map
  const state = new Map<string, State>();
  for (const p of players as PlayerRow[]) {
    state.set(p.id, {
      singles_rating: BASE_SINGLES,
      doubles_rating: BASE_DOUBLES,
      wins: 0,
      losses: 0,
      games_played: 0,
    });
  }

  // 2) Load matches oldest -> newest
  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select(
      "id,match_type,created_at,player_a,player_b,teammate_a,teammate_b,winner,k_factor,score_a,score_b"
    )
    .order("created_at", { ascending: true });

  if (mErr || !matches) throw mErr ?? new Error("Failed to load matches");

  // 3) Replay matches
  for (const m of matches as MatchRow[]) {
    const k = m.k_factor ?? (m.match_type === "doubles" ? 24 : 32);
    const hasScores = m.score_a !== null && m.score_b !== null;

    if (m.match_type === "singles") {
      const A = state.get(m.player_a);
      const B = state.get(m.player_b);
      if (!A || !B) continue;

      const aWon = m.winner === m.player_a;

      let newA: number, newB: number;
      if (hasScores) {
        const res = updateEloScoreBased(
          A.singles_rating,
          B.singles_rating,
          aWon,
          m.score_a!,
          m.score_b!,
          k
        );
        newA = res.newA;
        newB = res.newB;
      } else {
        const res = updateElo(A.singles_rating, B.singles_rating, aWon, k);
        newA = res.newA;
        newB = res.newB;
      }

      A.singles_rating = newA;
      B.singles_rating = newB;

      A.games_played += 1;
      B.games_played += 1;
      if (aWon) {
        A.wins += 1;
        B.losses += 1;
      } else {
        B.wins += 1;
        A.losses += 1;
      }
    } else {
      // doubles
      if (!m.teammate_a || !m.teammate_b) continue;

      const A1 = state.get(m.player_a);
      const A2 = state.get(m.teammate_a);
      const B1 = state.get(m.player_b);
      const B2 = state.get(m.teammate_b);
      if (!A1 || !A2 || !B1 || !B2) continue;

      const aTeamWon = m.winner === m.player_a; // winner anchor logic

      let newA1: number, newA2: number, newB1: number, newB2: number;
      if (hasScores) {
        const res = updateDoublesEloScoreBased(
          A1.doubles_rating,
          A2.doubles_rating,
          B1.doubles_rating,
          B2.doubles_rating,
          aTeamWon,
          m.score_a!,
          m.score_b!,
          k
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
          k
        );
        newA1 = res.newA1;
        newA2 = res.newA2;
        newB1 = res.newB1;
        newB2 = res.newB2;
      }

      A1.doubles_rating = newA1;
      A2.doubles_rating = newA2;
      B1.doubles_rating = newB1;
      B2.doubles_rating = newB2;

      // overall counters
      A1.games_played += 1;
      A2.games_played += 1;
      B1.games_played += 1;
      B2.games_played += 1;

      if (aTeamWon) {
        A1.wins += 1;
        A2.wins += 1;
        B1.losses += 1;
        B2.losses += 1;
      } else {
        B1.wins += 1;
        B2.wins += 1;
        A1.losses += 1;
        A2.losses += 1;
      }
    }
  }

  // 4) Write back to players table
  // (simple loop; fine for frat size)
  for (const [playerId, s] of state.entries()) {
    const { error } = await supabase
      .from("players")
      .update({
        singles_rating: s.singles_rating,
        doubles_rating: s.doubles_rating,
        wins: s.wins,
        losses: s.losses,
        games_played: s.games_played,
      })
      .eq("id", playerId);

    if (error) throw error;
  }

  console.log("✅ Recompute complete.");
}

main().catch((e) => {
  console.error("❌ Recompute failed:", e);
  process.exit(1);
});
