"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

type Player = {
  id: string;
  name: string;
  singles_rating: number;
  doubles_rating: number;
  games_played: number;
  wins: number;
  losses: number;
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
      .select("id,name,singles_rating,doubles_rating,games_played,wins,losses,tier")
      .order(orderCol, { ascending: false })
      .order("games_played", { ascending: false });

    if (!error && data) setPlayers(data as Player[]);
    setLoading(false);
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel("players-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => load())
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
            padding: "8px 12px",
            fontWeight: 700,
            border: "1px solid #ddd",
            borderRadius: 10,
            background: view === "singles" ? "#eee" : "white",
          }}
        >
          Singles
        </button>
        <button
          onClick={() => setView("doubles")}
          style={{
            padding: "8px 12px",
            fontWeight: 700,
            border: "1px solid #ddd",
            borderRadius: 10,
            background: view === "doubles" ? "#eee" : "white",
          }}
        >
          Doubles
        </button>

        <div style={{ marginLeft: "auto", opacity: 0.85 }}>
          <Link href="/submit">Submit a match →</Link>
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
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const rating = view === "singles" ? p.singles_rating : p.doubles_rating;

              return (
                <tr key={p.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{i + 1}</td>
                  <td style={{ padding: 8 }}>
                    <Link href={`/players/${p.id}`}>{p.name}</Link>
                  </td>
                  <td style={{ padding: 8, fontWeight: 700 }}>{rating}</td>
                  <td style={{ padding: 8 }}>
                    {p.wins}–{p.losses}
                  </td>
                  <td style={{ padding: 8 }}>{p.games_played}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
