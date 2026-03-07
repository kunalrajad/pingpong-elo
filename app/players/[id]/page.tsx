"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useParams } from "next/navigation";

type Player = {
  id: string;
  name: string;
  singles_rating: number;
  doubles_rating: number;
  wins: number;
  losses: number;
  games_played: number;
  singles_wins: number;
  singles_losses: number;
  singles_games: number;
  doubles_wins: number;
  doubles_losses: number;
  doubles_games: number;
  tier: number | null;
};

type MatchRow = {
  id: string;
  created_at: string;
  match_type: "singles" | "doubles";
  player_a: string;
  player_b: string;
  teammate_a: string | null;
  teammate_b: string | null;
  winner: string;
  score_a: number | null;
  score_b: number | null;
};

export default function PlayerPage() {
  const params = useParams();
  const playerId = params.id as string;

  const [player, setPlayer] = useState<Player | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [playersById, setPlayersById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!playerId) return;

    setLoading(true);

    const [
      { data: playerData, error: playerErr },
      { data: allPlayers },
      { data: matchData, error: matchErr },
    ] = await Promise.all([
      supabase
        .from("players")
        .select(`
          id,
          name,
          singles_rating,
          doubles_rating,
          wins,
          losses,
          games_played,
          singles_wins,
          singles_losses,
          singles_games,
          doubles_wins,
          doubles_losses,
          doubles_games,
          tier
        `)
        .eq("id", playerId)
        .maybeSingle(),

      supabase.from("players").select("id,name"),

      supabase
        .from("matches")
        .select(`
          id,
          created_at,
          match_type,
          player_a,
          player_b,
          teammate_a,
          teammate_b,
          winner,
          score_a,
          score_b
        `)
        .or(
          `player_a.eq.${playerId},player_b.eq.${playerId},teammate_a.eq.${playerId},teammate_b.eq.${playerId}`
        )
        .order("created_at", { ascending: false }),
    ]);

    if (!playerErr) {
      setPlayer((playerData as Player) ?? null);
    } else {
      setPlayer(null);
    }

    const map: Record<string, string> = {};
    (allPlayers ?? []).forEach((p: any) => {
      map[p.id] = p.name;
    });
    setPlayersById(map);

    if (!matchErr && matchData) {
      setMatches(matchData as MatchRow[]);
    } else {
      setMatches([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [playerId]);

  function name(id: string | null) {
    if (!id) return "";
    return playersById[id] ?? "Unknown";
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

  function renderMatch(m: MatchRow) {
    const isDoubles = m.match_type === "doubles";

    const teamA = isDoubles
      ? `${name(m.player_a)} + ${name(m.teammate_a)}`
      : name(m.player_a);

    const teamB = isDoubles
      ? `${name(m.player_b)} + ${name(m.teammate_b)}`
      : name(m.player_b);

    const score =
      m.score_a !== null && m.score_b !== null ? `${m.score_a}-${m.score_b}` : "No score entered";

    const teamAWon = m.winner === m.player_a;
    const winnerLabel = teamAWon ? teamA : teamB;

    const playerWon = isDoubles
      ? (teamAWon && (m.player_a === playerId || m.teammate_a === playerId)) ||
        (!teamAWon && (m.player_b === playerId || m.teammate_b === playerId))
      : m.winner === playerId;

    return (
      <div
        key={m.id}
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>
            {isDoubles ? "Doubles" : "Singles"} • {score}
          </div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>{formatDate(m.created_at)}</div>
        </div>

        <div style={{ marginTop: 8 }}>
          <div>
            <b>A:</b> {teamA}
          </div>
          <div>
            <b>B:</b> {teamB}
          </div>
          <div style={{ marginTop: 4 }}>
            <b>Winner:</b> 🏆 {winnerLabel}
          </div>
          <div style={{ marginTop: 6, fontWeight: 700 }}>
            {playerWon ? "✅ Win" : "❌ Loss"}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!player) {
    return (
      <main style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
        <p>Player not found.</p>
        <p>
          <Link href="/">← Back to leaderboard</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <p>
        <Link href="/">← Back to leaderboard</Link>
      </p>

      <h1 style={{ fontSize: 30, fontWeight: 800 }}>{player.name}</h1>

      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <div><b>Tier:</b> {player.tier ?? "-"}</div>
        <div><b>Singles Elo:</b> {player.singles_games === 0 ? "Unranked" : player.singles_rating}</div>
        <div><b>Doubles Elo:</b> {player.doubles_games === 0 ? "Unranked" : player.doubles_rating}</div>
        <div><b>Singles W-L:</b> {player.singles_wins}-{player.singles_losses}</div>
        <div><b>Doubles W-L:</b> {player.doubles_wins}-{player.doubles_losses}</div>
        <div><b>Overall W-L:</b> {player.wins}-{player.losses}</div>
      </div>

      <h2 style={{ marginTop: 24, fontSize: 22 }}>Match History</h2>

      {matches.length === 0 ? (
        <p>No matches recorded yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {matches.map(renderMatch)}
        </div>
      )}
    </main>
  );
}
