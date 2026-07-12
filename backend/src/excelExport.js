// ─── Excel standings export ──────────────────────────────────────────────
// Pure formatter, same spirit as roundRobin.js/bracket.js: takes data that's
// already been computed elsewhere (the same serializeTournament() output the
// frontend gets) and turns it into a workbook. Doesn't touch scoring logic,
// doesn't know about the tournament store — just data in, .xlsx buffer out.

const ExcelJS = require("exceljs");

const FELT = "FF24483A";
const BRASS = "FFB8863A";
const PARCHMENT = "FFF4EFE2";

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FELT } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  row.height = 20;
}

function addTitleBlock(sheet, t, subtitle) {
  sheet.mergeCells(1, 1, 1, 6);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = t.name;
  titleCell.font = { bold: true, size: 14, color: { argb: FELT } };

  const metaParts = [
    t.federation,
    t.timeControl,
    t.dateFrom
      ? `${t.dateFrom}${t.dateTo && t.dateTo !== t.dateFrom ? ` – ${t.dateTo}` : ""}`
      : null,
    subtitle,
  ].filter(Boolean);
  sheet.mergeCells(2, 1, 2, 6);
  const metaCell = sheet.getCell(2, 1);
  metaCell.value = metaParts.join("   ·   ");
  metaCell.font = { italic: true, size: 10, color: { argb: "FF6B665A" } };

  sheet.addRow([]); // spacer before the header row
}

function autoFitColumn(sheet, colIndex, header, minWidth = 10) {
  let max = header.length;
  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum <= 3) return; // skip title/meta/spacer rows
    const val = row.getCell(colIndex).value;
    if (val != null) max = Math.max(max, String(val).length);
  });
  sheet.getColumn(colIndex).width = Math.max(minWidth, max + 2);
}

function addIndividualStandingsSheet(wb, t) {
  const sheet = wb.addWorksheet("Standings");
  addTitleBlock(sheet, t, `${t.standings.length} players`);

  const headers = ["Rank", "Name", "Rating", "Score", "Buchholz", "SB"];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  t.standings.forEach((s, i) => {
    sheet.addRow([
      i + 1,
      s.name,
      s.rating || "",
      parseFloat(s.score),
      s.buchholz != null ? parseFloat(s.buchholz) : "",
      s.sb != null ? parseFloat(s.sb) : "",
    ]);
  });

  sheet.views = [{ state: "frozen", ySplit: 4 }];
  headers.forEach((h, i) => autoFitColumn(sheet, i + 1, h));
  sheet.getColumn(1).alignment = { horizontal: "center" };
}

function addTeamStandingsSheet(wb, t) {
  const sheet = wb.addWorksheet("Team Standings");
  addTitleBlock(sheet, t, `${t.teamStandings.length} teams`);

  const headers = ["Rank", "Team", "Players", "Score", "Buchholz", "SB"];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  t.teamStandings.forEach((s, i) => {
    sheet.addRow([
      i + 1,
      s.name,
      s.playerCount,
      parseFloat(s.score),
      s.buchholz != null ? parseFloat(s.buchholz) : "",
      s.sb != null ? parseFloat(s.sb) : "",
    ]);
  });

  sheet.views = [{ state: "frozen", ySplit: 4 }];
  headers.forEach((h, i) => autoFitColumn(sheet, i + 1, h));
  sheet.getColumn(1).alignment = { horizontal: "center" };
}

function addBoardStandingsSheet(wb, t) {
  const sheet = wb.addWorksheet("Board Standings");
  addTitleBlock(sheet, t, `${t.standings.length} players`);

  const headers = ["Rank", "Name", "Team", "Rating", "Score"];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  t.standings.forEach((s, i) => {
    sheet.addRow([
      i + 1,
      s.name,
      s.teamName,
      s.rating || "",
      parseFloat(s.score),
    ]);
  });

  sheet.views = [{ state: "frozen", ySplit: 4 }];
  headers.forEach((h, i) => autoFitColumn(sheet, i + 1, h));
  sheet.getColumn(1).alignment = { horizontal: "center" };
}

function addCrossTableSheet(wb, t) {
  if (!t.crossTable || t.crossTable.length === 0) return;
  const sheet = wb.addWorksheet("Cross-Table");
  addTitleBlock(sheet, t, "Round-by-round results");

  // Columns: Rank, Name, Score, then one column per competitor (by rank).
  const headers = ["Rank", "Name", "Score", ...t.crossTable.map((c) => c.rank)];
  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);

  t.crossTable.forEach((row) => {
    const cells = [
      row.rank,
      row.name,
      parseFloat(row.score),
      ...row.results.map((r) => (r.self ? "•" : r.value)),
    ];
    sheet.addRow(cells);
  });

  sheet.views = [{ state: "frozen", xSplit: 3, ySplit: 4 }];
  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 10;
  for (let i = 4; i <= headers.length; i++) {
    sheet.getColumn(i).width = 5;
    sheet.getColumn(i).alignment = { horizontal: "center" };
  }
}

// t is a serializeTournament() output (the same shape the frontend gets).
async function buildStandingsWorkbook(t) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Swiss Manager";
  wb.created = new Date();

  if (t.format === "team") {
    addTeamStandingsSheet(wb, t);
    addBoardStandingsSheet(wb, t);
  } else {
    addIndividualStandingsSheet(wb, t);
  }
  addCrossTableSheet(wb, t);

  return wb.xlsx.writeBuffer();
}

module.exports = { buildStandingsWorkbook };
