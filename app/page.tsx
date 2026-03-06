"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

type Player = {
  id: string;
  name: string;
  singles_rating: number;
  doubles_rating: number;

  // overall
  games_played: number;
  wins: number;
  losses: number;

  // singles-specific
  singles_wins: number;
  singles_losses: number;
  singles_games: number;

  // doubles-specific
  doubles_wins: number;
  doubles_losses: number;
  doubles_games: number;

  tier: number | null;
};

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"singles" | "doubles">("singles");

  async function load() {
    setLoading(true);

    const orderCol = view === "singles" ? "singles_rating" : "doubles_rating";

    const { data, error } = await supabase
      .from("players")
      .select(`
        id,
        name,
        singles_rating,
        doubles_rating,
        games_played,
        wins,
        losses,
        singles_wins,
        singles_losses,
        singles_games,
        doubles_wins,
        doubles_losses,
        doubles_games,
        tier
      `)
      .order(orderCol, { ascending: false })
      .order("name", { ascending: true });

    if (!error && data) {
      setPlayers(data as Player[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel("players-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const title = useMemo(
    () => (view === "singles" ? "Singles Leaderboard" : "Doubles Leaderboard"),
    [view]
  );

  return (
    <main style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>🏓 Frat Ping Pong Elo</h1>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
        <button
          onClick={() => setView("singles")}
          style={{
            padding: "8px 14px",
            fontWeight: 700,
            border: "1px solid #666",
            borderRadius: 10,
            background: view === "singles" ? "#ffffff" : "#111111",
            color: view === "singles" ? "#000000" : "#ffffff",
            cursor: "pointer",
          }}
        >
          Singles
        </button>

        <button
          onClick={() => setView("doubles")}
          style={{
            padding: "8px 14px",
            fontWeight: 700,
            border: "1px solid #666",
            borderRadius: 10,
            background: view === "doubles" ? "#ffffff" : "#111111",
            color: view === "doubles" ? "#000000" : "#ffffff",
            cursor: "pointer",
          }}
        >
          Doubles
        </button>

        <div style={{ marginLeft: "auto", opacity: 0.9 }}>
          <Link href="/submit">Submit a match →</Link>
          <Link href="/matches" style={{ marginLeft: 12 }}>
            View matches →
          </Link>
        </div>
      </div>

      <h2 style={{ marginTop: 16, fontSize: 18 }}>{title}</h2>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ padding: 8 }}>Rank</th>
              <th style={{ padding: 8 }}>Player</th>
              <th style={{ padding: 8 }}>Elo</th>
              <th style={{ padding: 8 }}>W–L</th>
              <th style={{ padding: 8 }}>Games</th>
              <th style={{ padding: 8 }}>Tier</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const rating =
                view === "singles" ? p.singles_rating : p.doubles_rating;

              const wins =
                view === "singles" ? p.singles_wins : p.doubles_wins;

              const losses =
                view === "singles" ? p.singles_losses : p.doubles_losses;

              const games =
                view === "singles" ? p.singles_games : p.doubles_games;

              return (
                <tr key={p.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{i + 1}</td>
                  <td style={{ padding: 8 }}>
                    <Link href={`/players/${p.id}`}>{p.name}</Link>
                  </td>
                  <td style={{ padding: 8, fontWeight: 700 }}>{rating}</td>
                  <td style={{ padding: 8 }}>
                    {wins}–{losses}
                  </td>
                  <td style={{ padding: 8 }}>{games}</td>
                  <td style={{ padding: 8 }}>{p.tier ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
