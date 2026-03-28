/**
 * BTTS Tracker - Picks API Server
 * Stores picks server-side for model improvement
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const PICKS_FILE = path.join(DATA_DIR, 'user-picks.json');

const app = express();
app.use(cors());
app.use(express.json());

// Load picks from file
function loadPicks() {
  try {
    if (fs.existsSync(PICKS_FILE)) {
      return JSON.parse(fs.readFileSync(PICKS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading picks:', e);
  }
  return { picks: [], stats: {}, modelAccuracy: {}, lastUpdated: null };
}

// Save picks to file
function savePicks(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PICKS_FILE, JSON.stringify(data, null, 2));
}

// Calculate stats
function calculateStats(picks) {
  const settled = picks.filter(p => p.status !== 'pending');
  const won = picks.filter(p => p.status === 'won');
  const lost = picks.filter(p => p.status === 'lost');
  const pending = picks.filter(p => p.status === 'pending');
  
  const totalStaked = settled.reduce((sum, p) => sum + (p.stake || 0), 0);
  const totalReturns = won.reduce((sum, p) => sum + ((p.stake || 0) * (p.odds || 0)), 0);
  
  return {
    totalPicks: picks.length,
    won: won.length,
    lost: lost.length,
    pending: pending.length,
    totalStaked,
    totalReturns,
    roi: totalStaked > 0 ? ((totalReturns - totalStaked) / totalStaked * 100).toFixed(1) : 0,
    winRate: settled.length > 0 ? (won.length / settled.length * 100).toFixed(1) : 0
  };
}

// Calculate model accuracy by probability bands
function calculateModelAccuracy(picks) {
  const settled = picks.filter(p => p.status !== 'pending' && p.probability);
  
  // Group by probability bands (40-45%, 45-50%, 50-55%, etc.)
  const bands = {};
  settled.forEach(pick => {
    const prob = pick.probability * 100;
    const band = Math.floor(prob / 5) * 5;
    const bandKey = `${band}-${band + 5}%`;
    
    if (!bands[bandKey]) {
      bands[bandKey] = { total: 0, won: 0, expectedWins: 0 };
    }
    bands[bandKey].total++;
    bands[bandKey].expectedWins += pick.probability;
    if (pick.status === 'won') bands[bandKey].won++;
  });
  
  // Calculate calibration for each band
  Object.keys(bands).forEach(key => {
    const b = bands[key];
    b.actualRate = (b.won / b.total * 100).toFixed(1);
    b.expectedRate = (b.expectedWins / b.total * 100).toFixed(1);
    b.calibrationError = (parseFloat(b.actualRate) - parseFloat(b.expectedRate)).toFixed(1);
  });
  
  // Group by league
  const byLeague = {};
  settled.forEach(pick => {
    const league = pick.league || 'Unknown';
    if (!byLeague[league]) {
      byLeague[league] = { total: 0, won: 0 };
    }
    byLeague[league].total++;
    if (pick.status === 'won') byLeague[league].won++;
  });
  
  Object.keys(byLeague).forEach(key => {
    byLeague[key].winRate = (byLeague[key].won / byLeague[key].total * 100).toFixed(1);
  });
  
  return {
    byProbabilityBand: bands,
    byLeague,
    totalSettled: settled.length
  };
}

// GET all picks
app.get('/api/picks', (req, res) => {
  const data = loadPicks();
  res.json(data);
});

// POST new pick
app.post('/api/picks', (req, res) => {
  const data = loadPicks();
  const pick = {
    id: Date.now(),
    ...req.body,
    pickedAt: new Date().toISOString(),
    status: 'pending'
  };
  
  // Check for duplicates
  if (data.picks.find(p => p.fixtureId === pick.fixtureId)) {
    return res.status(400).json({ error: 'Already picked this fixture' });
  }
  
  data.picks.push(pick);
  data.stats = calculateStats(data.picks);
  savePicks(data);
  
  console.log(`📌 New pick added: ${pick.homeTeam} vs ${pick.awayTeam} (${pick.probability * 100}%)`);
  res.json({ success: true, pick, stats: data.stats });
});

// PUT settle pick
app.put('/api/picks/:id/settle', (req, res) => {
  const data = loadPicks();
  const pickId = parseInt(req.params.id);
  const { won, actualScore } = req.body;
  
  const pick = data.picks.find(p => p.id === pickId);
  if (!pick) {
    return res.status(404).json({ error: 'Pick not found' });
  }
  
  pick.status = won ? 'won' : 'lost';
  pick.result = {
    won,
    actualScore,
    settledAt: new Date().toISOString(),
    bttsResult: won
  };
  
  data.stats = calculateStats(data.picks);
  data.modelAccuracy = calculateModelAccuracy(data.picks);
  savePicks(data);
  
  console.log(`✅ Pick settled: ${pick.homeTeam} vs ${pick.awayTeam} - ${won ? 'WON' : 'LOST'}`);
  res.json({ success: true, pick, stats: data.stats, modelAccuracy: data.modelAccuracy });
});

// DELETE pick
app.delete('/api/picks/:id', (req, res) => {
  const data = loadPicks();
  const pickId = parseInt(req.params.id);
  
  data.picks = data.picks.filter(p => p.id !== pickId);
  data.stats = calculateStats(data.picks);
  savePicks(data);
  
  res.json({ success: true, stats: data.stats });
});

// DELETE all picks (clear)
app.delete('/api/picks', (req, res) => {
  const data = { picks: [], stats: {}, modelAccuracy: {}, lastUpdated: new Date().toISOString() };
  savePicks(data);
  
  console.log('🗑️ All picks cleared');
  res.json({ success: true });
});

// GET model accuracy report
app.get('/api/model-accuracy', (req, res) => {
  const data = loadPicks();
  data.modelAccuracy = calculateModelAccuracy(data.picks);
  savePicks(data);
  res.json(data.modelAccuracy);
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 BTTS Picks API running on http://localhost:${PORT}`);
  console.log(`   GET  /api/picks - Get all picks`);
  console.log(`   POST /api/picks - Add new pick`);
  console.log(`   PUT  /api/picks/:id/settle - Settle a pick`);
  console.log(`   DELETE /api/picks/:id - Remove a pick`);
  console.log(`   DELETE /api/picks - Clear all picks`);
  console.log(`   GET  /api/model-accuracy - Get model accuracy report\n`);
});
