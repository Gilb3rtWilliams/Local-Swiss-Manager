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
};
