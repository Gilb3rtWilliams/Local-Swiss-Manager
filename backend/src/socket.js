// socket.js
// ─────────────────────────────────────────────────────────────────────────
// Read-only pub/sub for viewers. Anyone can join a tournament's room -- no
// auth, since watching a published tournament is the whole point. Nothing
// is ever received FROM a viewer socket; publish.js is the only writer,
// and it reaches this same `io` instance to broadcast (see server.js).

const { Server } = require("socket.io");

function isUuid(s) {
  return typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
}

function setupSocket(httpServer, { corsOrigin } = {}) {
  const io = new Server(httpServer, {
    cors: corsOrigin ? { origin: corsOrigin } : undefined,
  });

  io.on("connection", (socket) => {
    let joinedRoom = null;

    socket.on("join", (tournamentId) => {
      if (!isUuid(tournamentId)) return;
      if (joinedRoom) socket.leave(joinedRoom);
      joinedRoom = `tournament:${tournamentId}`;
      socket.join(joinedRoom);
    });

    socket.on("leave", () => {
      if (joinedRoom) socket.leave(joinedRoom);
      joinedRoom = null;
    });
  });

  return io;
}

module.exports = { setupSocket };
