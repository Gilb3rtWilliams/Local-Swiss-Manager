import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import PairingsIndividual from '../../components/PairingsIndividual.jsx';
import PairingsTeam from '../../components/PairingsTeam.jsx';

export default function Pairings() {
  const { t, refresh } = useOutletContext();
  const navigate = useNavigate();
  const isTeam = t.format === 'team';

  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [lateOpen, setLateOpen] = useState(false);
  const [lateName, setLateName] = useState('');
  const [lateRating, setLateRating] = useState('');
  const [lateTeam, setLateTeam] = useState('');
  const [lateError, setLateError] = useState('');

  if (!t.currentPairings) {
    return (
      <div className="card">
        <p className="muted">No round is currently open.</p>
        <button className="btn-primary" style={{ marginTop: 10 }} onClick={() => navigate(`/tournament/${t.id}/overview`)}>
          Go generate the next round →
        </button>
      </div>
    );
  }

  function setIndividualResult(pairIdx, result) {
    setResults(r => ({ ...r, [pairIdx]: result }));
  }
  function setBoardResult(pairIdx, boardNum, result) {
    setResults(r => ({ ...r, [`${pairIdx}-${boardNum}`]: result }));
  }

  const activeGames = t.currentPairings.filter(p => p.type !== 'bye');
  const totalDecisions = isTeam
    ? activeGames.reduce((sum, p) => sum + p.boards.filter(b => !b.sitOut).length, 0)
    : activeGames.length;
  const decidedCount = isTeam
    ? activeGames.reduce((sum, p) => sum + p.boards.filter(b => !b.sitOut && results[`${p.idx}-${b.boardNum}`]).length, 0)
    : activeGames.filter(p => results[p.idx]).length;
  const allSet = totalDecisions === decidedCount;

  async function handleSubmitResults() {
    setBusy(true); setError('');
    try {
      const payload = isTeam
        ? Object.entries(results).map(([key, result]) => {
            const [pairIndex, boardNum] = key.split('-').map(Number);
            return { pairIndex, boardNum, result };
          })
        : Object.entries(results).map(([pairIndex, result]) => ({ pairIndex: Number(pairIndex), result }));
      await api.submitResults(t.id, payload);
      setResults({});
      refresh();
      navigate(`/tournament/${t.id}/standings`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function handleAddLate(e) {
    e.preventDefault();
    setLateError('');
    if (!lateName.trim()) { setLateError('Enter a name.'); return; }
    if (isTeam && !lateTeam) { setLateError('Choose a team.'); return; }
    try {
      await api.addLatePlayer(t.id, { name: lateName, rating: lateRating, teamId: isTeam ? lateTeam : undefined });
      setLateName(''); setLateRating('');
      refresh();
    } catch (err) { setLateError(err.message); }
  }

  return (
    <div>
      <div className="card">
        <div className="section-header">
          <h2>Round {t.currentRound} Pairings</h2>
          <span className="round-badge">Round {t.currentRound} / {t.totalRounds}</span>
        </div>

        {error && <div className="banner-error">{error}</div>}

        {isTeam
          ? <PairingsTeam pairings={t.currentPairings} results={results} onSetBoardResult={setBoardResult} />
          : <PairingsIndividual pairings={t.currentPairings} results={results} onSetResult={setIndividualResult} />
        }

        <div style={{ marginTop: 16 }}>
          <button className="btn-primary" disabled={!allSet || busy} onClick={handleSubmitResults}>
            {busy ? 'Submitting…' : t.currentRound === t.totalRounds ? 'Finish Tournament' : 'Submit & Pair Next Round'}
          </button>
        </div>
      </div>

      {t.currentRound <= 1 && t.status !== 'finished' && (
        <div className="card">
          <div className="section-header" style={{ cursor: 'pointer' }} onClick={() => setLateOpen(o => !o)}>
            <h2 style={{ color: 'var(--muted)', fontSize: '1rem' }}>Late Registration</h2>
            <button type="button" className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setLateOpen(o => !o); }}>
              {lateOpen ? '− Late Registration' : '+ Late Registration'}
            </button>
          </div>
          {lateOpen && (
            <form onSubmit={handleAddLate}>
              <p className="muted" style={{ marginBottom: 12, fontSize: '0.88rem' }}>
                Add a competitor who missed the start. They receive a BYE (+1) if Round 1 is already open, and join from the next round onward.
              </p>
              <div className="player-row" style={{ marginBottom: 10 }}>
                <input type="text" placeholder="Player name" value={lateName} onChange={e => setLateName(e.target.value)} />
                <input type="number" placeholder="Rating" min="0" max="3500" value={lateRating} onChange={e => setLateRating(e.target.value)} />
                {isTeam && (
                  <select value={lateTeam} onChange={e => setLateTeam(e.target.value)}>
                    <option value="">Choose team…</option>
                    {t.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="btn-secondary">Add Late Joiner</button>
                {lateError && <span className="inline-error">{lateError}</span>}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
