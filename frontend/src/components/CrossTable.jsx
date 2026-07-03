export default function CrossTable({ crossTable }) {
  if (!crossTable || crossTable.length === 0) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="cross-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            {crossTable.map((_, i) => <th key={i}>{i + 1}</th>)}
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {crossTable.map((row) => (
            <tr key={row.id}>
              <td>{row.rank}</td>
              <td className="name-cell">{row.name}</td>
              {row.results.map((cell, ci) => (
                <td key={ci} className={cell.self ? 'self-cell' : cell.raw === 1 ? 'res-w' : cell.raw === 0 ? 'res-l' : cell.value === '½' ? 'res-d' : ''}>
                  {cell.self ? '—' : cell.value}
                </td>
              ))}
              <td><strong>{row.score}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
