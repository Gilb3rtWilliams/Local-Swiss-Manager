import { useNavigate } from 'react-router-dom';

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="welcome-screen">
      <div className="welcome-board" aria-hidden="true">
        {Array.from({ length: 64 }).map((_, i) => {
          const row = Math.floor(i / 8), col = i % 8;
          return <div key={i} className={(row + col) % 2 === 0 ? 'sq light' : 'sq dark'} />;
        })}
      </div>
      <div className="welcome-content">
        <div className="welcome-glyph">♞</div>
        <h1 className="welcome-title">Local Swiss Manager</h1>
        <p className="welcome-tagline">Pairings, standings, and results — run entirely on your machine.</p>
        <button className="btn-primary btn-lg" onClick={() => navigate('/dashboard')}>Enter the Hall</button>
        <p className="welcome-credit">by Gilbert Williams</p>
      </div>
    </div>
  );
}
