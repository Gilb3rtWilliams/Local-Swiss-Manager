const express = require('express');
const cors = require('cors');
const path = require('path');
const tournamentsRouter = require('./src/routes/tournaments');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/tournaments', tournamentsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the built React app in production (after `npm run build` in /frontend).
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`Local Swiss Manager backend running at http://localhost:${PORT}`);
});
