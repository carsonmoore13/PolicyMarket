const express = require('express');
const cors = require('cors');

const {
  localities,
  nationalCandidates,
  stateCandidates
} = require('./data');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Health check (used by curl /api/health)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'policymarket-api' });
});

// List all localities (for dropdown + map)
app.get('/api/localities', (req, res) => {
  const list = localities.map(({ id, name, center, zoom }) => ({
    id,
    name,
    center,
    zoom
  }));
  res.json(list);
});

// Get candidates for a specific locality (local races)
app.get('/api/localities/:id/candidates', (req, res) => {
  const loc = localities.find((l) => l.id === req.params.id);
  if (!loc) {
    return res.status(404).json({ error: 'Locality not found' });
  }
  res.json({
    localityId: loc.id,
    name: loc.name,
    candidates: loc.candidates || []
  });
});

// Federal candidates
app.get('/api/candidates/national', (req, res) => {
  res.json(nationalCandidates);
});

// State candidates (Texas)
app.get('/api/candidates/state', (req, res) => {
  res.json(stateCandidates);
});

app.listen(PORT, () => {
  console.log(`PolicyMarket API running at http://localhost:${PORT}`);
});

