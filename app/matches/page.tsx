"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Player = { id: string; name: string };

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
  k_factor: number | null;
};

export default function MatchesPage() {
  const [loading, setLoading] = useState(true);
  const [playersById, setPlayersById] = useState<Record<string, string>>({});
  const [matches, setMatches] = useState<MatchRow[]>([]);

  async function load() {
    setLoading(true);

    const [{ data: players }, { data: matchesData, error: matchesErr }] = await Promise.all([
      supabase.from("players").select("id,name"),
      supabase
        .from("matches")
        .select(
          "id,created_at,match_type,player_a,player_b,teammate_a,teammate_b,winner,score_a,score_b,k_factor"
        )
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const map: Record<string, string> = {};
    (players ?? []).forEach((p: Player) => (map[p.id] = p.name));
    setPlayersById(map);

    if (!matchesErr && matchesData) setMatches(matchesData as MatchRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();

    // live updates if new matches come in
    const channel = supabase
      .channel("matches-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function name(id: string | null) {
    if (!id) return "";
    return playersById[id] ?? id.slice(0, 6);
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString();
  }

  return (
    <main style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>🧾 Match History</h1>
      <p style={{ opacity: 0.8 }}>
        <Link href="/">← Back to leaderboard</Link>
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : matches.length === 0 ? (
        <p>No matches yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {matches.map((m) => {
            const isDoubles = m.match_type === "doubles";

            const teamA = isDoubles
              ? `${name(m.player_a)} + ${name(m.teammate_a)}`
              : `${name(m.player_a)}`;

            const teamB = isDoubles
              ? `${name(m.player_b)} + ${name(m.teammate_b)}`
              : `${name(m.player_b)}`;

            // For doubles, you stored winner as "winner anchor" (player_a or player_b)
            const teamAWon = m.winner === m.player_a;
            const winnerLabel = teamAWon ? teamA : teamB;

            const score =
              m.score_a !== null && m.score_b !== null ? `${m.score_a}–${m.score_b}` : "—";

            return (
              <div
                key={m.id}
                style={{
                  border: "1px solid #2a2a2a",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 800 }}>
                    {isDoubles ? "Doubles" : "Singles"} • {score}
                  </div>
                  <div style={{ opacity: 0.7, fontSize: 13 }}>{formatDate(m.created_at)}</div>
                </div>

                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  <div>
                    <span style={{ opacity: 0.7 }}>A:</span>{" "}
                    <b style={{ color: teamAWon ? "inherit" : "inherit" }}>{teamA}</b>
                  </div>
                  <div>
                    <span style={{ opacity: 0.7 }}>B:</span> <b>{teamB}</b>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ opacity: 0.7 }}>Winner:</span> 🏆 <b>{winnerLabel}</b>
                    {m.k_factor ? (
                      <span style={{ opacity: 0.6, marginLeft: 10 }}>K={m.k_factor}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
