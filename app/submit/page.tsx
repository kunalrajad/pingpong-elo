"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { expectedScore } from "@/lib/elo";
import Link from "next/link";

type Player = {
  id: string;
  name: string;
  singles_rating: number;
  doubles_rating: number;
};

export default function Submit() {
  const [players, setPlayers] = useState<Player[]>([]);

  const [matchType, setMatchType] = useState<"singles" | "doubles">("singles");

  // Singles + doubles anchors
  const [playerAId, setPlayerAId] = useState("");
  const [playerBId, setPlayerBId] = useState("");

  // Singles winner
  const [winnerId, setWinnerId] = useState("");

  // Doubles teammates + winner team
  const [teammateAId, setTeammateAId] = useState("");
  const [teammateBId, setTeammateBId] = useState("");
  const [winnerTeam, setWinnerTeam] = useState<"A" | "B" | "">("");

  // K-factor (you can keep this editable or hardcode later)
  const [kFactor, setKFactor] = useState(32);

  // Optional scores (team scores for doubles)
  const [scoreA, setScoreA] = useState<string>("");
  const [scoreB, setScoreB] = useState<string>("");

  const [status, setStatus] = useState<string>("");

  async function loadPlayers() {
    const { data } = await supabase
      .from("players")
      .select("id,name,singles_rating,doubles_rating")
      .order("name");
    setPlayers(data ?? []);
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  // When switching modes, clear incompatible fields
  useEffect(() => {
    setStatus("");
    setWinnerId("");
    setWinnerTeam("");
    setTeammateAId("");
    setTeammateBId("");
    setScoreA("");
    setScoreB("");

    // Nice defaults: doubles a bit less swingy
    setKFactor(matchType === "doubles" ? 24 : 32);
  }, [matchType]);

  const a1 = useMemo(() => players.find((p) => p.id === playerAId), [players, playerAId]);
  const b1 = useMemo(() => players.find((p) => p.id === playerBId), [players, playerBId]);
  const a2 = useMemo(() => players.find((p) => p.id === teammateAId), [players, teammateAId]);
  const b2 = useMemo(() => players.find((p) => p.id === teammateBId), [players, teammateBId]);

  // Odds: singles uses singles_rating; doubles uses average doubles_rating for each team
  const probs = useMemo(() => {
    if (!a1 || !b1) return null;

    if (matchType === "singles") {
      const pA = expectedScore(a1.singles_rating, b1.singles_rating);
      return { pA, pB: 1 - pA };
    }

    // doubles
    if (!a2 || !b2) return null;
    const teamA = (a1.doubles_rating + a2.doubles_rating) / 2;
    const teamB = (b1.doubles_rating + b2.doubles_rating) / 2;
    const pA = expectedScore(teamA, teamB);
    return { pA, pB: 1 - pA };
  }, [matchType, a1, a2, b1, b2]);

  async function submit() {
    setStatus("");

    // Basic checks
    if (!playerAId || !playerBId) {
      setStatus("Pick Player A and Player B.");
      return;
    }
    if (playerAId === playerBId) {
      setStatus("Players must be different.");
      return;
    }

    // Score parsing (optional)
    const hasScoreA = scoreA.trim() !== "";
    const hasScoreB = scoreB.trim() !== "";
    const useScores = hasScoreA && hasScoreB;

    let sA: number | null = null;
    let sB: number | null = null;

    if (useScores) {
      sA = Number(scoreA);
      sB = Number(scoreB);
      if (!Number.isInteger(sA) || !Number.isInteger(sB) || sA < 0 || sB < 0) {
        setStatus("Scores must be non-negative integers.");
        return;
      }
      if (sA === sB) {
        setStatus("Scores can’t be tied.");
        return;
      }
    } else if (hasScoreA || hasScoreB) {
      setStatus("Enter both scores (or leave both blank).");
      return;
    }

    // Build payload based on match type
    let payload: any = { matchType, playerAId, playerBId, kFactor };

    if (matchType === "singles") {
      if (!winnerId) {
        setStatus("Pick a winner.");
        return;
      }
      if (winnerId !== playerAId && winnerId !== playerBId) {
        setStatus("Winner must be Player A or Player B.");
        return;
      }

      // If score given, winner must match score
      if (useScores) {
        const aWonByScore = (sA as number) > (sB as number);
        const aWonByWinner = winnerId === playerAId;
        if (aWonByScore !== aWonByWinner) {
          setStatus("Winner does not match the submitted score.");
          return;
        }
      }

      payload.winnerId = winnerId;
    } else {
      // doubles
      if (!teammateAId || !teammateBId) {
        setStatus("Pick both teammates for doubles.");
        return;
      }
      if (!winnerTeam) {
        setStatus("Pick the winning team (A or B).");
        return;
      }

      const ids = [playerAId, teammateAId, playerBId, teammateBId];
      if (new Set(ids).size !== 4) {
        setStatus("All four players must be different in doubles.");
        return;
      }

      // If score given, winnerTeam must match score
      if (useScores) {
        const aTeamWonByScore = (sA as number) > (sB as number);
        const aTeamWonByWinner = winnerTeam === "A";
        if (aTeamWonByScore !== aTeamWonByWinner) {
          setStatus("Winner team does not match the submitted score.");
          return;
        }
      }

      payload.teammateAId = teammateAId;
      payload.teammateBId = teammateBId;
      payload.winnerTeam = winnerTeam;
    }

    if (useScores) {
      payload.scoreA = sA;
      payload.scoreB = sB;
    }

    const res = await fetch("/api/submit-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      setStatus(json.error ?? "Error submitting match");
      return;
    }

    setStatus(
      matchType === "doubles"
        ? useScores
          ? "✅ Doubles match recorded (score-based)!"
          : "✅ Doubles match recorded!"
        : useScores
          ? "✅ Singles match recorded (score-based)!"
          : "✅ Singles match recorded!"
    );

    // Reset fields
    setPlayerAId("");
    setPlayerBId("");
    setWinnerId("");
    setTeammateAId("");
    setTeammateBId("");
    setWinnerTeam("");
    setScoreA("");
    setScoreB("");
  }

  async function addPlayer(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("players").insert({ name: trimmed });
    if (error) {
      setStatus("Could not add player (name might already exist).");
    } else {
      setStatus(`Added ${trimmed}.`);
      loadPlayers();
    }
  }

  const ratingLabel = (p: Player) =>
    matchType === "doubles" ? p.doubles_rating : p.singles_rating;

  return (
    <main style={{ maxWidth: 700, margin: "24px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Submit Match</h1>
      <p>
        <Link href="/">← Back to leaderboard</Link>
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          Match type
          <select
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as any)}
            style={{ width: "100%", padding: 10 }}
          >
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
          </select>
        </label>

        <label>
          Player A
          <select
            value={playerAId}
            onChange={(e) => setPlayerAId(e.target.value)}
            style={{ width: "100%", padding: 10 }}
          >
            <option value="">Select…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({ratingLabel(p)})
              </option>
            ))}
          </select>
        </label>

        {matchType === "doubles" && (
          <label>
            Teammate (Team A)
            <select
              value={teammateAId}
              onChange={(e) => setTeammateAId(e.target.value)}
              style={{ width: "100%", padding: 10 }}
            >
              <option value="">Select…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.doubles_rating})
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Player B
          <select
            value={playerBId}
            onChange={(e) => setPlayerBId(e.target.value)}
            style={{ width: "100%", padding: 10 }}
          >
            <option value="">Select…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({ratingLabel(p)})
              </option>
            ))}
          </select>
        </label>

        {matchType === "doubles" && (
          <label>
            Teammate (Team B)
            <select
              value={teammateBId}
              onChange={(e) => setTeammateBId(e.target.value)}
              style={{ width: "100%", padding: 10 }}
            >
              <option value="">Select…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.doubles_rating})
                </option>
              ))}
            </select>
          </label>
        )}

        {matchType === "singles" ? (
          <label>
            Winner
            <select
              value={winnerId}
              onChange={(e) => setWinnerId(e.target.value)}
              style={{ width: "100%", padding: 10 }}
            >
              <option value="">Select…</option>
              {a1 && <option value={a1.id}>🏆 {a1.name}</option>}
              {b1 && <option value={b1.id}>🏆 {b1.name}</option>}
            </select>
          </label>
        ) : (
          <label>
            Winning team
            <select
              value={winnerTeam}
              onChange={(e) => setWinnerTeam(e.target.value as any)}
              style={{ width: "100%", padding: 10 }}
            >
              <option value="">Select…</option>
              <option value="A">🏆 Team A</option>
              <option value="B">🏆 Team B</option>
            </select>
          </label>
        )}

        {probs && (
          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Match odds</div>
            <div style={{ opacity: 0.85 }}>
              Team/Player A: <b>{Math.round(probs.pA * 100)}%</b> &nbsp; • &nbsp;
              Team/Player B: <b>{Math.round(probs.pB * 100)}%</b>
            </div>
            <div style={{ opacity: 0.6, marginTop: 6, fontSize: 13 }}>
              Based on current Elo ratings
            </div>
          </div>
        )}

        {/* Optional score inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            Score (A {matchType === "doubles" ? "team" : "player"})
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={scoreA}
              onChange={(e) => setScoreA(e.target.value)}
              placeholder="Leave blank if not used"
              style={{ width: "100%", padding: 10 }}
            />
          </label>

          <label>
            Score (B {matchType === "doubles" ? "team" : "player"})
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={scoreB}
              onChange={(e) => setScoreB(e.target.value)}
              placeholder="Leave blank if not used"
              style={{ width: "100%", padding: 10 }}
            />
          </label>
        </div>

        <label>
          K-factor (how swingy ratings are)
          <input
            type="number"
            value={kFactor}
            onChange={(e) => setKFactor(parseInt(e.target.value || "32", 10))}
            style={{ width: "100%", padding: 10 }}
          />
        </label>

        <button onClick={submit} style={{ padding: 12, fontWeight: 700 }}>
          Record Match
        </button>

        <NewPlayer onAdd={addPlayer} />
        {status && <p style={{ marginTop: 8 }}>{status}</p>}
      </div>
    </main>
  );
}

function NewPlayer({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 8 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700 }}>Add a new player</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          style={{ flex: 1, padding: 10 }}
        />
        <button
          onClick={() => {
            onAdd(name);
            setName("");
          }}
          style={{ padding: 10, fontWeight: 700 }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
