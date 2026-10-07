// Rank number with a gold / silver / bronze medal beside it for places 1–3.
// Shared by StandingsTable and TeamStandingsTable.
const MEDALS = {
  1: { icon: "🥇", label: "Gold medal" },
  2: { icon: "🥈", label: "Silver medal" },
  3: { icon: "🥉", label: "Bronze medal" },
};

export default function RankCell({ rank }) {
  const medal = MEDALS[rank];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      {medal && (
        <span role="img" aria-label={medal.label} title={medal.label}>
          {medal.icon}
        </span>
      )}
      {rank}
    </span>
  );
}
