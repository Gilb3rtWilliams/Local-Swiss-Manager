import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

function suggestedRounds(n) {
  if (n < 2) return 1;
  return Math.ceil(Math.log2(n));
}

let uidCounter = 0;
function rowId() { return `row-${++uidCounter}`; }

function emptyPlayer() { return { key: rowId(), name: '', rating: '' }; }
function emptyTeam() { return { key: rowId(), name: '', players: [emptyPlayer(), emptyPlayer()] }; }

export default function NewTournament() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [federation, setFederation] = useState('');
  const [format, setFormat] = useState('individual');
  const [variant, setVariant] = useState('standard');
  const [timeControl, setTimeControl] = useState('');
  const [autoRounds, setAutoRounds] = useState(true);
  const [totalRounds, setTotalRounds] = useState(5);

  const [players, setPlayers] = useState([emptyPlayer(), emptyPlayer(), emptyPlayer(), emptyPlayer()]);
  const [teams, setTeams] = useState([emptyTeam(), emptyTeam()]);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const competitorCount = format === 'team' ? teams.length : players.filter(p => p.name.trim()).length;
  const rounds = autoRounds ? suggestedRounds(Math.max(competitorCount, 2)) : totalRounds;

  function updatePlayer(idx, field, value) {
    setPlayers(ps => ps.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }
  function addPlayerRow() { setPlayers(ps => [...ps, emptyPlayer()]); }
  function removePlayerRow(idx) { setPlayers(ps => ps.filter((_, i) => i !== idx)); }

  function updateTeamName(tIdx, value) {
    setTeams(ts => ts.map((t, i) => i === tIdx ? { ...t, name: value } : t));
  }
  function addTeam() { setTeams(ts => [...ts, emptyTeam()]); }
  function removeTeam(tIdx) { setTeams(ts => ts.filter((_, i) => i !== tIdx)); }
  function updateTeamPlayer(tIdx, pIdx, field, value) {
    setTeams(ts => ts.map((t, i) => i !== tIdx ? t : {
      ...t, players: t.players.map((p, j) => j === pIdx ? { ...p, [field]: value } : p)
    }));
  }
  function addTeamPlayer(tIdx) {
    setTeams(ts => ts.map((t, i) => i === tIdx ? { ...t, players: [...t.players, emptyPlayer()] } : t));
  }
  function removeTeamPlayer(tIdx, pIdx) {
    setTeams(ts => ts.map((t, i) => i === tIdx ? { ...t, players: t.players.filter((_, j) => j !== pIdx) } : t));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!name.trim()) { setError('Tournament name is required.'); return; }

    const payload = {
      name, federation, format, variant, timeControl,
      totalRounds: autoRounds ? undefined : Number(totalRounds),
    };

    if (format === 'team') {
      const cleanTeams = teams
        .map(t => ({ name: t.name.trim(), players: t.players.filter(p => p.name.trim()).map(p => ({ name: p.name.trim(), rating: p.rating })) }))
        .filter(t => t.name);
      if (cleanTeams.length < 2) { setError('Add at least 2 teams (with names).'); return; }
      if (cleanTeams.some(t => t.players.length === 0)) { setError('Every team needs at least 1 player.'); return; }
      payload.teams = cleanTeams;
    } else {
      const cleanPlayers = players.filter(p => p.name.trim()).map(p => ({ name: p.name.trim(), rating: p.rating }));
      if (cleanPlayers.length < 2) { setError('Add at least 2 players.'); return; }
      payload.players = cleanPlayers;
    }

    setSubmitting(true);
    try {
      const t = await api.createTournament(payload);
      navigate(`/tournament/${t.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">New Tournament</h1>
      <p className="page-subtitle">Set the details, add competitors, and generate Round 1.</p>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h2>Tournament Details</h2>
          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nyeri Spring Open" />
            </label>
            <label className="field">
              <span>Federation / Club</span>
              <input type="text" value={federation} onChange={e => setFederation(e.target.value)} placeholder="Kenya Chess Federation" />
            </label>
            <label className="field">
              <span>Time Control</span>
              <input type="text" value={timeControl} onChange={e => setTimeControl(e.target.value)} placeholder="90+30" />
            </label>
            <label className="field">
              <span>Format</span>
              <select value={format} onChange={e => setFormat(e.target.value)}>
                <option value="individual">Individual</option>
                <option value="team">Team (league, bughouse, etc.)</option>
              </select>
            </label>
            {format === 'team' && (
              <label className="field">
                <span>Variant</span>
                <select value={variant} onChange={e => setVariant(e.target.value)}>
                  <option value="league">League (Team A vs Team B)</option>
                  <option value="bughouse">Bughouse</option>
                  <option value="standard">Standard team match</option>
                </select>
              </label>
            )}
            <label className="field">
              <span>Rounds</span>
              <div className="rounds-row">
                <input
                  type="number" min="1" value={rounds} disabled={autoRounds}
                  onChange={e => setTotalRounds(e.target.value)}
                />
                <label className="checkbox-inline">
                  <input type="checkbox" checked={autoRounds} onChange={e => setAutoRounds(e.target.checked)} />
                  Auto (Swiss formula)
                </label>
              </div>
              <span className="hint">No maximum — set any number, or add extra rounds later.</span>
            </label>
          </div>
        </div>

        {format === 'individual' ? (
          <div className="card">
            <div className="section-header">
              <h2>Players</h2>
              <button type="button" className="btn-secondary btn-sm" onClick={addPlayerRow}>+ Add Player</button>
            </div>
            <div id="player-list">
              {players.map((p, idx) => (
                <div className="player-row" key={p.key}>
                  <input type="text" placeholder="Player name" value={p.name} onChange={e => updatePlayer(idx, 'name', e.target.value)} />
                  <input type="number" placeholder="Rating" min="0" max="3500" value={p.rating} onChange={e => updatePlayer(idx, 'rating', e.target.value)} />
                  <button type="button" className="btn-sm btn-del" onClick={() => removePlayerRow(idx)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="section-header">
              <h2>Teams</h2>
              <button type="button" className="btn-secondary btn-sm" onClick={addTeam}>+ Add Team</button>
            </div>
            {teams.map((t, tIdx) => (
              <div className="team-block" key={t.key}>
                <div className="team-block-header">
                  <input type="text" className="team-name-input" placeholder={`Team ${tIdx + 1} name`} value={t.name} onChange={e => updateTeamName(tIdx, e.target.value)} />
                  <button type="button" className="btn-sm btn-del" onClick={() => removeTeam(tIdx)}>✕ Remove team</button>
                </div>
                {t.players.map((p, pIdx) => (
                  <div className="player-row" key={p.key}>
                    <input type="text" placeholder="Player name" value={p.name} onChange={e => updateTeamPlayer(tIdx, pIdx, 'name', e.target.value)} />
                    <input type="number" placeholder="Rating" min="0" max="3500" value={p.rating} onChange={e => updateTeamPlayer(tIdx, pIdx, 'rating', e.target.value)} />
                    <button type="button" className="btn-sm btn-del" onClick={() => removeTeamPlayer(tIdx, pIdx)}>✕</button>
                  </div>
                ))}
                <button type="button" className="btn-secondary btn-sm" onClick={() => addTeamPlayer(tIdx)}>+ Add Player to {t.name || `Team ${tIdx + 1}`}</button>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <button className="btn-primary" disabled={submitting}>{submitting ? 'Creating…' : 'Done — Generate Round 1'}</button>
          {error && <span className="inline-error">{error}</span>}
        </div>
      </form>
    </div>
  );
}
