import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../../api.js";
import "../../css/Overview.css";

const VARIANT_LABEL = {
  standard: "Standard team match",
  bughouse: "Bughouse",
  league: "League (Team A vs Team B)",
};
const SYSTEM_LABEL = {
  swiss: "Swiss",
  round_robin: "Round Robin",
  double_round_robin: "Double Round Robin",
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
};
const AVAILABLE_TIEBREAKS = [
  { id: "buchholz_cut1", label: "Buchholz Cut 1" },
  { id: "buchholz", label: "Buchholz" },
  { id: "sonneborn_berger", label: "Sonneborn-Berger" },
  { id: "direct_encounter", label: "Direct Encounter" },
];
const CATEGORIES = ["Open", "U18", "Women", "Seniors"];
const RATING_TYPES = [
  { value: "standard", label: "Standard" },
  { value: "rapid", label: "Rapid" },
  { value: "blitz", label: "Blitz" },
];
const SCORING_SYSTEMS = [
  { value: "standard", label: "Standard (1/2/0)" },
  { value: "3-1-0", label: "3-1-0" },
  { value: "double_round", label: "Double Round" },
];

let uidCounter = 0;
function rowId() {
  return `row-${++uidCounter}`;
}
function emptyPlayer() {
  return { key: rowId(), name: "", rating: "" };
}
function emptyTeam() {
  return { key: rowId(), name: "", players: [emptyPlayer(), emptyPlayer()] };
}

function SegmentedToggle({ name, value, onChange, options }) {
  return (
    <div className="nt-toggle">
      {options.map((opt) => (
        <label
          key={String(opt.value)}
          className={value === opt.value ? "checked" : ""}
        >
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export default function Overview() {
  const { t, refresh } = useOutletContext();
  const navigate = useNavigate();
  const isTeam = t.format === "team";
  const isElimination =
    t.system === "single_elimination" || t.system === "double_elimination";
  const editableRoster = t.currentRound === 0 && t.status === "setup";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pubBusy, setPubBusy] = useState(false);
  const [pubError, setPubError] = useState("");
  const [pubCopied, setPubCopied] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("Open");
  const [editVenue, setEditVenue] = useState("");
  const [editFederation, setEditFederation] = useState("");
  const [editOrganizerName, setEditOrganizerName] = useState("");
  const [editOrganizerContact, setEditOrganizerContact] = useState("");
  const [editChiefArbiter, setEditChiefArbiter] = useState("");
  const [editDeputyChiefArbiter, setEditDeputyChiefArbiter] = useState("");
  const [editDateFrom, setEditDateFrom] = useState("");
  const [editDateTo, setEditDateTo] = useState("");
  const [editFideRated, setEditFideRated] = useState(false);
  const [editRatingType, setEditRatingType] = useState("standard");
  const [editIsTest, setEditIsTest] = useState(false);
  const [editChess960, setEditChess960] = useState(false);
  const [editTimeControl, setEditTimeControl] = useState("");
  const [editVariant, setEditVariant] = useState("standard");
  const [editScoringSystem, setEditScoringSystem] = useState("standard");
  const [editTiebreaks, setEditTiebreaks] = useState(
    AVAILABLE_TIEBREAKS.map((t) => t.id),
  );
  const [editMaxHalfPointByes, setEditMaxHalfPointByes] = useState(2);
  const [editByeCutoffRound, setEditByeCutoffRound] = useState("");
  const [editTotalRounds, setEditTotalRounds] = useState(1);
  const [editPlayers, setEditPlayers] = useState([
    emptyPlayer(),
    emptyPlayer(),
  ]);
  const [editTeams, setEditTeams] = useState([emptyTeam(), emptyTeam()]);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const registrationEligible =
    !isElimination &&
    t.system !== "round_robin" &&
    t.system !== "double_round_robin" &&
    t.currentRound <= 1;

  const registrationLink = t.registrationToken
    ? `${window.location.origin}/register/${t.registrationToken}`
    : null;
  const publicResultsLink = t.publicViewToken
    ? `${window.location.origin}/results/${t.publicViewToken}`
    : null;

  function buildTeamRows() {
    return t.teams.map((team) => ({
      key: rowId(),
      name: team.name,
      players: t.players
        .filter((p) => p.teamId === team.id)
        .map((p) => ({
          key: rowId(),
          name: p.name,
          rating: p.rating ?? "",
        })),
    }));
  }

  function openEdit() {
    setEditName(t.name || "");
    setEditDescription(t.description || "");
    setEditCategory(t.category || "Open");
    setEditVenue(t.venue || "");
    setEditFederation(t.federation || "");
    setEditOrganizerName(t.organizerName || "");
    setEditOrganizerContact(t.organizerContact || "");
    setEditChiefArbiter(t.chiefArbiter || "");
    setEditDeputyChiefArbiter(t.deputyChiefArbiter || "");
    setEditDateFrom(t.dateFrom || "");
    setEditDateTo(t.dateTo || "");
    setEditFideRated(Boolean(t.fideRated));
    setEditRatingType(t.ratingType || "standard");
    setEditIsTest(Boolean(t.isTest));
    setEditChess960(Boolean(t.chess960));
    setEditTimeControl(t.timeControl || "");
    setEditVariant(t.variant || "standard");
    setEditScoringSystem(t.scoringSystem || "standard");
    setEditTiebreaks(Array.isArray(t.tiebreaks) ? t.tiebreaks : []);
    setEditMaxHalfPointByes(t.maxHalfPointByes ?? 2);
    setEditByeCutoffRound(t.byeCutoffRound ?? "");
    setEditTotalRounds(t.totalRounds || 1);

    if (isTeam) {
      setEditTeams(buildTeamRows());
    } else {
      setEditPlayers(
        t.players.map((p) => ({
          key: rowId(),
          name: p.name,
          rating: p.rating ?? "",
        })),
      );
    }
    setEditError("");
    setEditOpen(true);
  }

  function updateEditPlayer(idx, field, value) {
    setEditPlayers((prev) =>
      prev.map((player, index) =>
        index === idx ? { ...player, [field]: value } : player,
      ),
    );
  }

  function addEditPlayerRow() {
    setEditPlayers((prev) => [...prev, emptyPlayer()]);
  }

  function removeEditPlayerRow(idx) {
    setEditPlayers((prev) => prev.filter((_, index) => index !== idx));
  }

  function updateEditTeamName(teamIdx, value) {
    setEditTeams((prev) =>
      prev.map((team, index) =>
        index === teamIdx ? { ...team, name: value } : team,
      ),
    );
  }

  function updateEditTeamPlayer(teamIdx, playerIdx, field, value) {
    setEditTeams((prev) =>
      prev.map((team, tIndex) =>
        tIndex !== teamIdx
          ? team
          : {
              ...team,
              players: team.players.map((player, pIndex) =>
                pIndex === playerIdx ? { ...player, [field]: value } : player,
              ),
            },
      ),
    );
  }

  function addEditTeam() {
    setEditTeams((prev) => [...prev, emptyTeam()]);
  }

  function removeEditTeam(teamIdx) {
    setEditTeams((prev) => prev.filter((_, index) => index !== teamIdx));
  }

  function addEditTeamPlayer(teamIdx) {
    setEditTeams((prev) =>
      prev.map((team, index) =>
        index === teamIdx
          ? { ...team, players: [...team.players, emptyPlayer()] }
          : team,
      ),
    );
  }

  function removeEditTeamPlayer(teamIdx, playerIdx) {
    setEditTeams((prev) =>
      prev.map((team, index) =>
        index !== teamIdx
          ? team
          : {
              ...team,
              players: team.players.filter((_, pIndex) => pIndex !== playerIdx),
            },
      ),
    );
  }

  function toggleEditTiebreak(id) {
    setEditTiebreaks((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setEditError("");

    if (!editName.trim()) {
      setEditError("Name is required.");
      return;
    }

    if (editableRoster) {
      if (isTeam) {
        if (editTeams.length < 2) {
          setEditError("Add at least 2 teams.");
          return;
        }
        for (const team of editTeams) {
          if (!team.name.trim()) {
            setEditError("Every team needs a name.");
            return;
          }
          const validPlayers = team.players.filter((p) => p.name.trim());
          if (validPlayers.length === 0) {
            setEditError(`Team "${team.name}" needs at least 1 player.`);
            return;
          }
          if (t.variant === "bughouse" && validPlayers.length !== 2) {
            setEditError(
              `Bughouse teams must have exactly 2 players: "${team.name}".`,
            );
            return;
          }
        }
      } else {
        const validPlayers = editPlayers.filter((p) => p.name.trim());
        if (validPlayers.length < 2) {
          setEditError("Add at least 2 players.");
          return;
        }
      }
    }

    setEditBusy(true);
    try {
      const updates = {
        name: editName.trim(),
        description: editDescription.trim(),
        category: editCategory,
        venue: editVenue.trim(),
        federation: editFederation,
        organizerName: editOrganizerName.trim(),
        organizerContact: editOrganizerContact.trim(),
        chiefArbiter: editChiefArbiter.trim(),
        deputyChiefArbiter: editDeputyChiefArbiter.trim(),
        dateFrom: editDateFrom || null,
        dateTo: editDateTo || null,
        fideRated: editFideRated,
        ratingType: editRatingType,
        isTest: editIsTest,
        chess960: editChess960,
        timeControl: editTimeControl.trim(),
        variant: editVariant,
        scoringSystem: editScoringSystem,
        tiebreaks: editTiebreaks,
        maxHalfPointByes: Number(editMaxHalfPointByes) || 0,
        byeCutoffRound: editByeCutoffRound ? Number(editByeCutoffRound) : null,
      };

      if (
        t.status !== "finished" &&
        !isElimination &&
        t.system !== "round_robin" &&
        t.system !== "double_round_robin"
      ) {
        updates.totalRounds = Number(editTotalRounds);
      }

      if (editableRoster) {
        if (isTeam) {
          updates.teams = editTeams.map((team) => ({
            name: team.name.trim(),
            players: team.players
              .filter((p) => p.name.trim())
              .map((p) => ({
                name: p.name.trim(),
                rating: p.rating,
              })),
          }));
        } else {
          updates.players = editPlayers
            .filter((p) => p.name.trim())
            .map((p) => ({ name: p.name.trim(), rating: p.rating }));
        }
      }

      await api.updateTournamentDetails(t.id, updates);
      setEditOpen(false);
      refresh();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditBusy(false);
    }
  }

  async function handleToggleRegistration() {
    setRegBusy(true);
    setRegError("");
    try {
      if (t.registrationOpen) {
        await api.disableRegistration(t.id);
      } else {
        await api.enableRegistration(t.id);
      }
      refresh();
    } catch (e) {
      setRegError(e.message);
    } finally {
      setRegBusy(false);
    }
  }

  function handleCopyLink() {
    if (!registrationLink) return;
    navigator.clipboard.writeText(registrationLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  async function handleTogglePublicView() {
    setPubBusy(true);
    setPubError("");
    try {
      if (t.publicViewOpen) {
        await api.disablePublicView(t.id);
      } else {
        await api.enablePublicView(t.id);
      }
      refresh();
    } catch (e) {
      setPubError(e.message);
    } finally {
      setPubBusy(false);
    }
  }

  function handleCopyPublicLink() {
    if (!publicResultsLink) return;
    navigator.clipboard.writeText(publicResultsLink).then(() => {
      setPubCopied(true);
      setTimeout(() => setPubCopied(false), 1800);
    });
  }

  async function handleGenerateRound() {
    setBusy(true);
    setError("");
    try {
      await api.generateRound(t.id);
      refresh();
      navigate(`/tournament/${t.id}/pairings`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExtend() {
    setBusy(true);
    setError("");
    try {
      await api.extendTournament(t.id);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ov-root ambient-bg">
      <div className="card">
        <div className="section-header">
          <h2>Tournament Details</h2>
          <button className="btn-secondary btn-sm" onClick={openEdit}>
            ✎ Edit Details
          </button>
        </div>

        <div className="info-bar">
          <div>
            {isTeam ? "Teams" : "Players"}:{" "}
            <span>{isTeam ? t.teams.length : t.players.length}</span>
          </div>
          <div>
            System: <span>{SYSTEM_LABEL[t.system] || t.system}</span>
          </div>
          {isElimination ? (
            <>
              {t.bracket && (
                <div>
                  Bracket size: <span>{t.bracket.size}</span>
                </div>
              )}
              {t.bracket?.champion && (
                <div>
                  Champion: <span>{t.bracket.champion.name}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                Total rounds: <span>{t.totalRounds}</span>
              </div>
              <div>
                Current round: <span>{t.currentRound}</span>
              </div>
            </>
          )}
          <div>
            Status: <span>{t.status}</span>
          </div>
          {isTeam && (
            <div>
              Variant: <span>{VARIANT_LABEL[t.variant] || t.variant}</span>
            </div>
          )}
        </div>

        {error && <div className="banner-error">{error}</div>}

        {editOpen && (
          <form onSubmit={handleSaveEdit} style={{ marginTop: 14 }}>
            <div className="form-grid">
              <label className="field">
                <span>Name</span>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Category</span>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Federation / Club</span>
                <input
                  type="text"
                  value={editFederation}
                  onChange={(e) => setEditFederation(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Venue</span>
                <input
                  type="text"
                  value={editVenue}
                  onChange={(e) => setEditVenue(e.target.value)}
                />
              </label>

              <label className="field field-full">
                <span>Rules &amp; Announcements</span>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Organizer</span>
                <input
                  type="text"
                  value={editOrganizerName}
                  onChange={(e) => setEditOrganizerName(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Contact Info</span>
                <input
                  type="text"
                  value={editOrganizerContact}
                  onChange={(e) => setEditOrganizerContact(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Chief Arbiter</span>
                <input
                  type="text"
                  value={editChiefArbiter}
                  onChange={(e) => setEditChiefArbiter(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Deputy Arbiter</span>
                <input
                  type="text"
                  value={editDeputyChiefArbiter}
                  onChange={(e) => setEditDeputyChiefArbiter(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Date From</span>
                <input
                  type="date"
                  value={editDateFrom}
                  onChange={(e) => setEditDateFrom(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Date To</span>
                <input
                  type="date"
                  value={editDateTo}
                  min={editDateFrom || undefined}
                  onChange={(e) => setEditDateTo(e.target.value)}
                />
              </label>

              <label className="field">
                <span>FIDE Rated</span>
                <SegmentedToggle
                  name="fideRated"
                  value={editFideRated}
                  onChange={setEditFideRated}
                  options={[
                    { value: true, label: "Yes" },
                    { value: false, label: "No" },
                  ]}
                />
              </label>

              <label className="field">
                <span>Rating Type</span>
                <select
                  value={editRatingType}
                  onChange={(e) => setEditRatingType(e.target.value)}
                >
                  {RATING_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Tournament Type</span>
                <SegmentedToggle
                  name="isTest"
                  value={editIsTest}
                  onChange={setEditIsTest}
                  options={[
                    { value: false, label: "Real" },
                    { value: true, label: "Test" },
                  ]}
                />
              </label>

              <label className="field">
                <span>Chess960</span>
                <SegmentedToggle
                  name="chess960"
                  value={editChess960}
                  onChange={setEditChess960}
                  options={[
                    { value: true, label: "Yes" },
                    { value: false, label: "No" },
                  ]}
                />
              </label>

              <label className="field">
                <span>Time Control</span>
                <input
                  type="text"
                  value={editTimeControl}
                  onChange={(e) => setEditTimeControl(e.target.value)}
                />
              </label>

              {isTeam && (
                <label className="field">
                  <span>Variant</span>
                  <select
                    value={editVariant}
                    onChange={(e) => setEditVariant(e.target.value)}
                  >
                    <option value="league">League (Team A vs Team B)</option>
                    <option value="bughouse">Bughouse</option>
                    <option value="standard">Standard team match</option>
                  </select>
                </label>
              )}

              <label className="field">
                <span>Scoring System</span>
                <select
                  value={editScoringSystem}
                  onChange={(e) => setEditScoringSystem(e.target.value)}
                >
                  {SCORING_SYSTEMS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field field-full">
                <span>Tiebreaks</span>
                <div className="checkbox-grid">
                  {AVAILABLE_TIEBREAKS.map((option) => (
                    <label key={option.id} className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={editTiebreaks.includes(option.id)}
                        onChange={() => toggleEditTiebreak(option.id)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </label>

              <label className="field">
                <span>Max Half-Point Byes</span>
                <input
                  type="number"
                  min={0}
                  value={editMaxHalfPointByes}
                  onChange={(e) =>
                    setEditMaxHalfPointByes(Number(e.target.value) || 0)
                  }
                />
              </label>

              <label className="field">
                <span>Bye Cutoff Round</span>
                <input
                  type="number"
                  min={0}
                  value={editByeCutoffRound}
                  onChange={(e) => setEditByeCutoffRound(e.target.value)}
                />
              </label>

              {!isElimination &&
                t.system !== "round_robin" &&
                t.system !== "double_round_robin" && (
                  <label className="field">
                    <span>Total Rounds</span>
                    <input
                      type="number"
                      min={t.currentRound || 1}
                      value={editTotalRounds}
                      disabled={t.status === "finished"}
                      onChange={(e) => setEditTotalRounds(e.target.value)}
                    />
                    {t.status === "finished" && (
                      <span className="hint">
                        Finished — use "Add Extra Round" instead.
                      </span>
                    )}
                  </label>
                )}
            </div>

            {editableRoster && (
              <div className="roster-editor">
                <h3>Roster</h3>
                {isTeam ? (
                  <>
                    {editTeams.map((team, teamIdx) => (
                      <div key={team.key} className="team-box">
                        <div className="team-header">
                          <label className="field field-flex">
                            <span>Team Name</span>
                            <input
                              type="text"
                              value={team.name}
                              onChange={(e) =>
                                updateEditTeamName(teamIdx, e.target.value)
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => removeEditTeam(teamIdx)}
                          >
                            Remove team
                          </button>
                        </div>
                        <div className="team-player-grid">
                          {team.players.map((player, playerIdx) => (
                            <div key={player.key} className="player-row">
                              <label className="field">
                                <span>Player</span>
                                <input
                                  type="text"
                                  value={player.name}
                                  onChange={(e) =>
                                    updateEditTeamPlayer(
                                      teamIdx,
                                      playerIdx,
                                      "name",
                                      e.target.value,
                                    )
                                  }
                                />
                              </label>
                              <label className="field">
                                <span>Rating</span>
                                <input
                                  type="number"
                                  value={player.rating}
                                  onChange={(e) =>
                                    updateEditTeamPlayer(
                                      teamIdx,
                                      playerIdx,
                                      "rating",
                                      e.target.value,
                                    )
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() =>
                                  removeEditTeamPlayer(teamIdx, playerIdx)
                                }
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => addEditTeamPlayer(teamIdx)}
                          >
                            Add player
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={addEditTeam}
                    >
                      Add team
                    </button>
                  </>
                ) : (
                  <>
                    {editPlayers.map((player, idx) => (
                      <div key={player.key} className="player-row">
                        <label className="field">
                          <span>Player</span>
                          <input
                            type="text"
                            value={player.name}
                            onChange={(e) =>
                              updateEditPlayer(idx, "name", e.target.value)
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Rating</span>
                          <input
                            type="number"
                            value={player.rating}
                            onChange={(e) =>
                              updateEditPlayer(idx, "rating", e.target.value)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => removeEditPlayerRow(idx)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={addEditPlayerRow}
                    >
                      Add player
                    </button>
                  </>
                )}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                marginTop: 18,
                flexWrap: "wrap",
              }}
            >
              <button className="btn-primary" disabled={editBusy}>
                {editBusy ? "Saving…" : "Save Changes"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </button>
              {editError && <span className="inline-error">{editError}</span>}
            </div>
          </form>
        )}
      </div>

      {registrationEligible && (
        <div className="card ov-registration-card">
          <div className="section-header">
            <h2>Registration Link</h2>
            <button
              className={
                t.registrationOpen
                  ? "btn-secondary btn-sm"
                  : "btn-primary btn-sm"
              }
              disabled={regBusy}
              onClick={handleToggleRegistration}
            >
              {regBusy
                ? "Working…"
                : t.registrationOpen
                  ? "Close Registration"
                  : "Enable Registration Link"}
            </button>
          </div>
          <p className="muted" style={{ marginBottom: 10 }}>
            {t.registrationOpen
              ? isTeam
                ? "Share this link so team captains can register their own team before Round 1."
                : "Share this link so players can add themselves before Round 1."
              : "Enable a link players can use to register themselves, instead of typing every entry in by hand. Only available before Round 1 starts."}
          </p>
          {t.registrationOpen && registrationLink && (
            <div className="share-link-row">
              <input
                type="text"
                readOnly
                value={registrationLink}
                onClick={(e) => e.target.select()}
              />
              <button className="btn-secondary btn-sm" onClick={handleCopyLink}>
                {copied ? "Copied ✓" : "Copy Link"}
              </button>
            </div>
          )}
          {regError && <div className="inline-error">{regError}</div>}
        </div>
      )}

      <div className="card ov-registration-card">
        <div className="section-header">
          <h2>
            {isElimination ? "Bracket Link" : "Pairings & Standings Link"}
          </h2>
          <button
            className={
              t.publicViewOpen ? "btn-secondary btn-sm" : "btn-primary btn-sm"
            }
            disabled={pubBusy}
            onClick={handleTogglePublicView}
          >
            {pubBusy
              ? "Working…"
              : t.publicViewOpen
                ? "Turn Off Public Link"
                : "Enable Public Link"}
          </button>
        </div>
        <p className="muted" style={{ marginBottom: 10 }}>
          {t.publicViewOpen
            ? isElimination
              ? "Anyone with this link can follow the live bracket and standings — read-only, no sign-in needed."
              : "Anyone with this link can browse pairings for every round and current standings — read-only, no sign-in needed."
            : isElimination
              ? "Turn this on to share a read-only link where players and spectators can follow the bracket live, any time during the event."
              : "Turn this on to share a read-only link where players and spectators can check pairings and standings themselves, any time during the event."}
        </p>
        {t.publicViewOpen && publicResultsLink && (
          <div className="share-link-row">
            <input
              type="text"
              readOnly
              value={publicResultsLink}
              onClick={(e) => e.target.select()}
            />
            <button
              className="btn-secondary btn-sm"
              onClick={handleCopyPublicLink}
            >
              {pubCopied ? "Copied ✓" : "Copy Link"}
            </button>
          </div>
        )}
        {pubError && <div className="inline-error">{pubError}</div>}
      </div>

      {isElimination ? (
        <div className="card">
          <h2>{t.bracket?.champion ? "🏆 Bracket Complete" : "Bracket"}</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            {t.bracket?.champion
              ? `Congratulations, ${t.bracket.champion.name}!`
              : t.system === "double_elimination"
                ? "The full winners and losers bracket was drawn when this tournament was created. Enter results match by match as they finish."
                : "The full bracket was drawn when this tournament was created. Enter results match by match as they finish."}
          </p>
          <button
            className="btn-primary"
            onClick={() => navigate(`/tournament/${t.id}/module`)}
          >
            View Bracket →
          </button>
        </div>
      ) : (
        <>
          {t.status === "finished" && (
            <div className="card finished-banner">
              <h2>🏆 Tournament Complete!</h2>
              <p>
                {t.winner
                  ? `Congratulations, ${t.winner}!`
                  : "Final standings are ready."}
              </p>
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={handleExtend}
              >
                + Add Extra Round (e.g. playoff / tiebreak)
              </button>
            </div>
          )}

          {t.status !== "finished" && !t.currentPairings && (
            <div className="card">
              <h2>
                {t.currentRound === 0
                  ? "Ready to begin"
                  : `Round ${t.currentRound + 1}`}
              </h2>
              <p className="muted" style={{ marginBottom: 12 }}>
                {t.currentRound === 0
                  ? "Generate Round 1 pairings to start the tournament."
                  : "Generate pairings for the next round."}
              </p>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={handleGenerateRound}
              >
                {busy
                  ? "Generating…"
                  : `Generate ${
                      t.currentRound === 0
                        ? "Round 1"
                        : `Round ${t.currentRound + 1}`
                    } Pairings`}
              </button>
            </div>
          )}

          {t.currentPairings && (
            <div className="card">
              <p className="muted">
                Round {t.currentRound} is in progress — head to the{" "}
                <strong>Pairings</strong> tab to enter results.
              </p>
              <button
                className="btn-secondary btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => navigate(`/tournament/${t.id}/pairings`)}
              >
                Go to Pairings →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
