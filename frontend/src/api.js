const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  login: (password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  getAuthStatus: () => request("/auth/me"),

  // Not a JSON body — multipart upload, handled separately from request().
  uploadImage: async (file) => {
    const form = new FormData();
    form.append("image", file);
    const res = await fetch(`${BASE}/uploads/image`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },

  listTournaments: () => request("/tournaments"),
  listPublicTournaments: () => request("/tournaments/public"),
  getTournament: (id) => request(`/tournaments/${id}`),
  createTournament: (body) =>
    request("/tournaments", { method: "POST", body: JSON.stringify(body) }),
  deleteTournament: (id) => request(`/tournaments/${id}`, { method: "DELETE" }),
  updateTournamentDetails: (id, updates) =>
    request(`/tournaments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  generateRound: (id, body) =>
    request(`/tournaments/${id}/round`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),
  submitResults: (id, results) =>
    request(`/tournaments/${id}/results`, {
      method: "POST",
      body: JSON.stringify({ results }),
    }),
  editResult: (id, round, payload) =>
    request(`/tournaments/${id}/rounds/${round}/results`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteRound: (id, round) =>
    request(`/tournaments/${id}/rounds/${round}`, { method: "DELETE" }),
  generateNextRound: (id, body) =>
    request(`/tournaments/${id}/round`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),
  generateManualRound: (id, payload) =>
    request(`/tournaments/${id}/round/manual`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  addLatePlayer: (id, body) =>
    request(`/tournaments/${id}/players`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deletePlayer: (id, playerId) =>
    request(`/tournaments/${id}/players/${playerId}`, { method: "DELETE" }),
  getPlayerProfile: (id, playerId) =>
    request(`/tournaments/${id}/players/${playerId}/profile`),
  getTeamProfile: (id, teamId) =>
    request(`/tournaments/${id}/teams/${teamId}/profile`),
  extendTournament: (id) =>
    request(`/tournaments/${id}/extend`, { method: "POST" }),
  getStandingsAtRound: (id, round) =>
    request(`/tournaments/${id}/standings/${round}`),

  getBracket: (id) => request(`/tournaments/${id}/bracket`),
  submitBracketResult: (id, matchId, payload) =>
    request(`/tournaments/${id}/bracket/matches/${matchId}/result`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  validateBughouseTeams: (id) =>
    request(`/tournaments/${id}/bughouse/validate`),

  // ─── Cage Match (1 vs 1 match format) ──────────────────────────────────
  recordCageMatchMove: (id, sectionId, gameId, move) =>
    request(
      `/tournaments/${id}/cagematch/sections/${sectionId}/games/${gameId}/move`,
      { method: "POST", body: JSON.stringify({ move }) },
    ),
  undoCageMatchMove: (id, sectionId, gameId) =>
    request(
      `/tournaments/${id}/cagematch/sections/${sectionId}/games/${gameId}/move`,
      { method: "DELETE" },
    ),
  setCageMatchGameResult: (id, sectionId, gameId, result) =>
    request(
      `/tournaments/${id}/cagematch/sections/${sectionId}/games/${gameId}/result`,
      { method: "POST", body: JSON.stringify({ result }) },
    ),
  clearCageMatchGameResult: (id, sectionId, gameId) =>
    request(
      `/tournaments/${id}/cagematch/sections/${sectionId}/games/${gameId}/result`,
      { method: "DELETE" },
    ),
  startCageMatchTiebreak: (id) =>
    request(`/tournaments/${id}/cagematch/tiebreak/start`, {
      method: "POST",
    }),
  recordCageMatchTiebreakResult: (id, gameId, result) =>
    request(`/tournaments/${id}/cagematch/tiebreak/result`, {
      method: "POST",
      body: JSON.stringify({ gameId, result }),
    }),
  recordCageMatchArmageddonBids: (id, bidA, bidB) =>
    request(`/tournaments/${id}/cagematch/tiebreak/armageddon/bids`, {
      method: "POST",
      body: JSON.stringify({ bidA, bidB }),
    }),
  recordCageMatchArmageddonResult: (id, result) =>
    request(`/tournaments/${id}/cagematch/tiebreak/armageddon/result`, {
      method: "POST",
      body: JSON.stringify({ result }),
    }),
  getCageMatchHistory: (id) => request(`/tournaments/${id}/cagematch/history`),
  getCageMatchSectionPerformance: (id) =>
    request(`/tournaments/${id}/cagematch/performance`),
  setCageMatchCompetitorPicture: (id, side, pictureUrl) =>
    request(`/tournaments/${id}/cagematch/competitors/${side}/picture`, {
      method: "POST",
      body: JSON.stringify({ pictureUrl }),
    }),
  updateCageMatchCompetitorDetails: (id, side, payload) =>
    request(`/tournaments/${id}/cagematch/competitors/${side}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  startDecider: (id, payload) =>
    request(`/tournaments/${id}/decider/start`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  recordDeciderResult: (id, payload) =>
    request(`/tournaments/${id}/decider/result`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  cancelDecider: (id) =>
    request(`/tournaments/${id}/decider/cancel`, { method: "POST" }),
  resolveDeciderManually: (id, winnerId) =>
    request(`/tournaments/${id}/decider/resolve`, {
      method: "POST",
      body: JSON.stringify({ winnerId }),
    }),

  enableRegistration: (id) =>
    request(`/tournaments/${id}/registration/enable`, { method: "POST" }),
  disableRegistration: (id) =>
    request(`/tournaments/${id}/registration/disable`, { method: "POST" }),
  getPublicRegistration: (token) => request(`/tournaments/register/${token}`),
  submitPublicRegistration: (token, payload) =>
    request(`/tournaments/register/${token}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getPublicResults: (token) => request(`/tournaments/public-view/${token}`),
  getPublicStandingsAtRound: (token, round) =>
    request(`/tournaments/public-view/${token}/standings/${round}`),
  getPublicPlayerProfile: (token, playerId) =>
    request(`/tournaments/public-view/${token}/players/${playerId}/profile`),
  getPublicTeamProfile: (token, teamId) =>
    request(`/tournaments/public-view/${token}/teams/${teamId}/profile`),
  getPublicCageMatchHistory: (token) =>
    request(`/tournaments/public-view/${token}/cagematch/history`),
  getPublicCageMatchSectionPerformance: (token) =>
    request(`/tournaments/public-view/${token}/cagematch/performance`),
  enablePublicView: (id) =>
    request(`/tournaments/${id}/public-view/enable`, { method: "POST" }),
  disablePublicView: (id) =>
    request(`/tournaments/${id}/public-view/disable`, { method: "POST" }),

  // Binary downloads — can't go through request() since that assumes a JSON
  // body. Fetch as a blob and trigger a browser save directly.
  downloadStandingsExport: (id) =>
    downloadFile(`/tournaments/${id}/standings/export`),
  downloadPairingsExport: (id) =>
    downloadFile(`/tournaments/${id}/pairings/export`),

  listReviews: () => request("/reviews"),
  submitReview: (payload) =>
    request("/reviews", { method: "POST", body: JSON.stringify(payload) }),
  deleteReview: (id) => request(`/reviews/${id}`, { method: "DELETE" }),
};

async function downloadFile(path) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : "download.xlsx";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
