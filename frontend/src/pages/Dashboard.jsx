import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const FORMAT_LABEL = { individual: 'Individual', team: 'Team' };
const VARIANT_LABEL = { standard: 'Standard', bughouse: 'Bughouse', league: 'League' };

export default function Dashboard() {
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => { refresh(); }, []);

  function refresh() {
    api.listTournaments().then(setTournaments).catch(e => setError(e.message));
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this tournament? This cannot be undone.')) return;
    await api.deleteTournament(id);
    refresh();
  }

  return (
    <div className="container">
      <div className="dash-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Every tournament you've run, in one place.</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/new')}>+ New Tournament</button>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {tournaments === null && <p className="muted">Loading…</p>}

      {tournaments && tournaments.length === 0 && (
        <div className="card empty-state">
          <div className="empty-glyph">♟</div>
          <h2>No tournaments yet</h2>
          <p className="muted">Create your first tournament to generate Round 1 pairings.</p>
          <button className="btn-primary" onClick={() => navigate('/new')}>+ New Tournament</button>
        </div>
      )}

      {tournaments && tournaments.length > 0 && (
        <div className="tourney-grid">
          {tournaments.map(t => (
            <div key={t.id} className="card tourney-card" onClick={() => navigate(`/tournament/${t.id}`)}>
              <div className="tourney-card-top">
                <span className={`status-pill status-${t.status}`}>{t.status}</span>
                <button className="btn-del btn-sm" onClick={(e) => handleDelete(e, t.id)} title="Delete">✕</button>
              </div>
              <h3 className="tourney-name">{t.name}</h3>
              <div className="tourney-meta">
                <span>{FORMAT_LABEL[t.format]}{t.variant && t.variant !== 'standard' ? ` · ${VARIANT_LABEL[t.variant] || t.variant}` : ''}</span>
                {t.federation && <span>{t.federation}</span>}
                {t.timeControl && <span>{t.timeControl}</span>}
              </div>
              <div className="tourney-progress">
                Round {t.currentRound} / {t.totalRounds} · {t.competitorCount} {t.format === 'team' ? 'teams' : 'players'}
              </div>
              {t.status === 'finished' && t.winner && (
                <div className="tourney-winner">🏆 {t.winner}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
