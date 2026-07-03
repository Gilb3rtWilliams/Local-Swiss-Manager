const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'tournaments.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// competitor.opponents is a Set at runtime; must be array on disk.
function replacer(key, value) {
  if (value instanceof Set) return { __set: true, values: [...value] };
  return value;
}

function reviver(key, value) {
  if (value && typeof value === 'object' && value.__set) return new Set(value.values);
  return value;
}

function load() {
  if (!fs.existsSync(DATA_FILE)) return { tournaments: {} };
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    if (!raw.trim()) return { tournaments: {} };
    return JSON.parse(raw, reviver);
  } catch (err) {
    console.error('Failed to load data file, starting fresh:', err.message);
    return { tournaments: {} };
  }
}

function save(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, replacer, 2), 'utf-8');
}

module.exports = { load, save };
