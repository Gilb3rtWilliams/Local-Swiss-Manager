const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  listTournaments: () => request("/tournaments"),
  getTournament: (id) => request(`/tournaments/${id}`),
  createTournament: (body) =>
    request("/tournaments", { method: "POST", body: JSON.stringify(body) }),
  deleteTournament: (id) => request(`/tournaments/${id}`, { method: "DELETE" }),
  updateTournamentDetails: (id, updates) =>
    request(`/tournaments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  generateRound: (id) =>
    request(`/tournaments/${id}/round`, { method: "POST" }),
  submitResults: (id, results) =>
    request(`/tournaments/${id}/results`, {
      method: "POST",
      body: JSON.stringify({ results }),
    }),
  addLatePlayer: (id, body) =>
    request(`/tournaments/${id}/players`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  extendTournament: (id) =>
    request(`/tournaments/${id}/extend`, { method: "POST" }),

  getBracket: (id) => request(`/tournaments/${id}/bracket`),
  submitBracketResult: (id, matchId, payload) =>
    request(`/tournaments/${id}/bracket/matches/${matchId}/result`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  validateBughouseTeams: (id) =>
    request(`/tournaments/${id}/bughouse/validate`),

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
};

async function downloadFile(path) {
  const res = await fetch(`${BASE}${path}`);
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
