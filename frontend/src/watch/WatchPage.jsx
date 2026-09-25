// WatchPage.jsx  (web -- public viewer, e.g. route /watch/:tournamentId)
// ─────────────────────────────────────────────────────────────────────────
// Renders a published tournament and keeps it live via Socket.IO, matching
// exactly what PublishToggle.jsx's shareable link points to
// ($PUBLIC_WEB_ORIGIN/watch/:serverTournamentId in main.js).
//
// USAGE (React Router):
//   <Route path="/watch/:tournamentId" element={<WatchPage />} />
//
// CONNECTION HANDLING, the part worth reading closely:
//   - On first load: GET the snapshot (current state), THEN connect the
//     socket and join the room. Snapshot first avoids a race where an event
//     arrives before we know the starting state to apply it to.
//   - On any reconnect (not the first connect): the socket may have missed
//     events while disconnected, so we pull GET .../events?since=<last seen
//     id> and replay them through the exact same applyLiveEvent() reducer
//     the live path uses, before resuming live updates. This is what makes
//     "phone lost wifi for 10 seconds" invisible to the viewer instead of a
//     silent gap in the game.
//   - A 404 on the snapshot (never published, or unpublished) and a live
//     'visibility' event with visible:false are handled identically -- one
//     "this tournament isn't available" state, not two different UIs for
//     what's the same situation from the viewer's perspective.
//
// ASSUMPTIONS: uses React Router's useParams for the id; adjust if you're on
// a different router. API_BASE defaults to same-origin (empty string) --
// set it to your actual API host if the public site and the API are on
// different domains/subdomains.

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { applyLiveEvent } from "./applyLiveEvent";
import ReadOnlyBoard from "./ReadOnlyBoard";

const API_BASE = process.env.REACT_APP_API_BASE || "";

export default function WatchPage() {
  const { tournamentId } = useParams();
  const [tournament, setTournament] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [connection, setConnection] = useState("connecting"); // "connecting" | "live" | "reconnecting"
  const [unavailable, setUnavailable] = useState(false);
  const lastEventId = useRef(0);
  const hasConnectedBefore = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let socket;

    async function catchUp() {
      const res = await fetch(
        `${API_BASE}/api/public/tournaments/${tournamentId}/events?since=${lastEventId.current}`,
      );
      if (!res.ok) return; // tournament vanished mid-reconnect -- the next snapshot load (if any) will catch it
      const body = await res.json();
      if (cancelled) return;
      setRounds((prev) => {
        let next = prev;
        for (const event of body.events) next = applyLiveEvent(next, event);
        return next;
      });
      lastEventId.current = body.nextSince;
    }

    async function start() {
      try {
        const res = await fetch(
          `${API_BASE}/api/public/tournaments/${tournamentId}`,
        );
        if (res.status === 404) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        if (!res.ok) throw new Error(`Unexpected status ${res.status}`);
        const body = await res.json();
        if (cancelled) return;

        setTournament(body.tournament);
        setRounds(body.rounds);
        lastEventId.current = body.tournament.lastEventSeq;

        socket = io(API_BASE || undefined, { transports: ["websocket"] });
        socket.on("connect", () => {
          if (cancelled) return;
          socket.emit("join", tournamentId);
          if (hasConnectedBefore.current) {
            catchUp(); // reconnect -- fill whatever gap the disconnect left
          }
          hasConnectedBefore.current = true;
          setConnection("live");
        });
        socket.on("disconnect", (reason) => {
          if (!cancelled) setConnection("reconnecting");
          // socket.io-client auto-reconnects after a NETWORK-level drop
          // (dropped wifi, ping timeout, etc.) but deliberately does NOT
          // auto-reconnect when the SERVER explicitly disconnected the
          // socket ("io server disconnect") -- which happens during a
          // routine server restart/redeploy, not just an intentional kick.
          // Without this, every viewer would silently strand on the next
          // deploy and need a manual page refresh mid-tournament.
          if (reason === "io server disconnect" && !cancelled) {
            socket.connect();
          }
        });
        socket.on("event", (event) => {
          if (cancelled) return;
          setRounds((prev) => applyLiveEvent(prev, event));
          lastEventId.current = event.id;
        });
        socket.on("visibility", ({ visible }) => {
          if (cancelled) return;
          if (!visible) {
            setUnavailable(true);
            socket.disconnect();
          }
        });
      } catch (err) {
        if (!cancelled) setUnavailable(true);
      }
    }

    start();
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [tournamentId]);

  if (unavailable) {
    return (
      <div style={styles.centered}>
        <p style={styles.unavailableText}>This tournament isn't available.</p>
      </div>
    );
  }
  if (!tournament) {
    return (
      <div style={styles.centered}>
        <p style={styles.loadingText}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>{tournament.name}</h1>
        <span
          style={{
            ...styles.connBadge,
            ...(connection === "live"
              ? styles.connLive
              : styles.connReconnecting),
          }}
        >
          {connection === "live" ? "Live" : "Reconnecting…"}
        </span>
      </header>

      {rounds.map((round) => (
        <section key={round.roundNumber} style={styles.round}>
          <h2 style={styles.roundTitle}>Round {round.roundNumber}</h2>
          <div style={styles.boardGrid}>
            {round.games.map((game) => (
              <div key={game.boardNumber} style={styles.gameCard}>
                <ReadOnlyBoard
                  startFen={game.startFen}
                  moves={game.moves}
                  lastMove={game.lastMove}
                  size={280}
                />
                <div style={styles.gameMeta}>
                  <span>{game.whiteName || "White"}</span>
                  <span style={styles.resultOrStatus}>
                    {game.result ||
                      (game.status?.kind === "check" ? "Check" : "")}
                  </span>
                  <span>{game.blackName || "Black"}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 960,
    margin: "0 auto",
    padding: 24,
    fontFamily: "system-ui, sans-serif",
  },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 24 },
  title: { margin: 0, fontSize: 24 },
  connBadge: {
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
  },
  connLive: { background: "#e6f4ea", color: "#1a7f37" },
  connReconnecting: { background: "#fdf3e3", color: "#a66a00" },
  round: { marginBottom: 32 },
  roundTitle: { fontSize: 16, color: "#555", marginBottom: 12 },
  boardGrid: { display: "flex", flexWrap: "wrap", gap: 20 },
  gameCard: { width: 280 },
  gameMeta: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 8,
    fontSize: 13,
    color: "#333",
  },
  resultOrStatus: { fontWeight: 600, color: "#a33" },
  centered: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "60vh",
  },
  unavailableText: { color: "#888", fontSize: 15 },
  loadingText: { color: "#888", fontSize: 15 },
};
