/**
 * BTTS Tracker - Results Tracker
 * 
 * 1. Records all predictions before games
 * 2. Fetches results after games finish
 * 3. Calculates model accuracy
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'btts-data.json');
const RESULTS_FILE = path.join(DATA_DIR, 'results-history.json');

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// League mappings for scores API
const LEAGUE_KEYS = {
  'Championship': 'soccer_efl_champ',
  'League One': 'soccer_england_league1',
  'League Two': 'soccer_england_league2',
};

function loadResults() {
  try {
    if (fs.existsSync(RESULTS_FILE)) {
      return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { predictions: [], lastUpdated: null, stats: {} };
}

function saveResults(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2));
}

function loadPredictions() {
  try {
    if (fs.existsSync(PREDICTIONS_FILE)) {
      return JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { fixtures: [] };
}

function getProbabilityBand(prob) {
  if (prob >= 0.60) return 'high';
  if (prob >= 0.50) return 'medium';
  return 'low';
}

// Record all current predictions (run before games kick off)
async function recordPredictions() {
  const predictions = loadPredictions();
  const results = loadResults();
  
  const now = new Date();
  let added = 0;
  
  for (const fixture of predictions.fixtures) {
    const kickoff = new Date(fixture.commenceTime);
    
    // Only record predictions for games that haven't started yet
    if (kickoff > now) {
      // Check if already recorded
      const existing = results.predictions.find(p => p.fixtureId === fixture.id);
      if (existing) continue;
      
      results.predictions.push({
        fixtureId: fixture.id,
        date: fixture.commenceTime,
        recordedAt: now.toISOString(),
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        league: fixture.league,
        sportKey: fixture.sportKey,
        probability: fixture.probability,
        rank: fixture.rank,
        isTop3: fixture.rank <= 3,
        isTop6: fixture.rank <= 6,
        band: getProbabilityBand(fixture.probability),
        odds: fixture.btts?.yes?.odds,
        valueRating: fixture.valueRating,
        models: fixture.models,
        // To be filled after game
        homeGoals: null,
        awayGoals: null,
        bttsActual: null,
        isCorrect: null,
        settledAt: null,
      });
      added++;
    }
  }
  
  saveResults(results);
  console.log(`📝 Recorded ${added} new predictions (${results.predictions.length} total)`);
  return added;
}

// Fetch scores from API
async function fetchScores(sportKey) {
  if (!ODDS_API_KEY) {
    console.log('⚠️ No API key - cannot fetch scores');
    return [];
  }
  
  try {
    const response = await axios.get(`${ODDS_API_BASE}/sports/${sportKey}/scores`, {
      params: {
        apiKey: ODDS_API_KEY,
        daysFrom: 3,
      }
    });
    return response.data || [];
  } catch (e) {
    console.error(`Error fetching scores for ${sportKey}:`, e.message);
    return [];
  }
}

// Settle predictions with actual results
async function settleResults() {
  const results = loadResults();
  const now = new Date();
  
  // Get unique sport keys from unsettled predictions
  const unsettled = results.predictions.filter(p => p.bttsActual === null);
  const sportKeys = [...new Set(unsettled.map(p => p.sportKey).filter(Boolean))];
  
  if (unsettled.length === 0) {
    console.log('✅ All predictions already settled');
    return;
  }
  
  console.log(`🔍 Checking ${unsettled.length} unsettled predictions...`);
  
  // Fetch scores for each league
  const allScores = [];
  for (const sportKey of sportKeys) {
    const scores = await fetchScores(sportKey);
    allScores.push(...scores);
    console.log(`  ${sportKey}: ${scores.length} games`);
  }
  
  let settled = 0;
  
  for (const prediction of unsettled) {
    const kickoff = new Date(prediction.date);
    
    // Only settle if game should be finished (kickoff + 2.5 hours)
    if (now < new Date(kickoff.getTime() + 2.5 * 60 * 60 * 1000)) {
      continue;
    }
    
    // Find matching score
    const score = allScores.find(s => {
      const homeMatch = s.home_team?.toLowerCase().includes(prediction.homeTeam.toLowerCase().split(' ')[0]) ||
                        prediction.homeTeam.toLowerCase().includes(s.home_team?.toLowerCase().split(' ')[0]);
      const awayMatch = s.away_team?.toLowerCase().includes(prediction.awayTeam.toLowerCase().split(' ')[0]) ||
                        prediction.awayTeam.toLowerCase().includes(s.away_team?.toLowerCase().split(' ')[0]);
      return homeMatch && awayMatch && s.completed;
    });
    
    if (score && score.scores) {
      const homeScore = score.scores.find(s => s.name === score.home_team);
      const awayScore = score.scores.find(s => s.name === score.away_team);
      
      if (homeScore && awayScore) {
        prediction.homeGoals = parseInt(homeScore.score);
        prediction.awayGoals = parseInt(awayScore.score);
        prediction.bttsActual = prediction.homeGoals > 0 && prediction.awayGoals > 0;
        prediction.predictedBtts = prediction.probability >= 0.5;
        prediction.isCorrect = prediction.predictedBtts === prediction.bttsActual;
        prediction.settledAt = now.toISOString();
        settled++;
        
        const result = prediction.isCorrect ? '✅' : '❌';
        console.log(`  ${result} ${prediction.homeTeam} ${prediction.homeGoals}-${prediction.awayGoals} ${prediction.awayTeam} (pred: ${(prediction.probability * 100).toFixed(0)}%)`);
      }
    }
  }
  
  // Calculate stats
  const settledPreds = results.predictions.filter(p => p.bttsActual !== null);
  const correct = settledPreds.filter(p => p.isCorrect).length;
  
  results.stats = {
    total: settledPreds.length,
    correct: correct,
    accuracy: settledPreds.length > 0 ? (correct / settledPreds.length * 100).toFixed(1) : 0,
    pending: results.predictions.length - settledPreds.length,
    byBand: {
      high: calculateBandStats(settledPreds, 'high'),
      medium: calculateBandStats(settledPreds, 'medium'),
      low: calculateBandStats(settledPreds, 'low'),
    },
    byLeague: calculateLeagueStats(settledPreds),
    top3Accuracy: calculateRankAccuracy(settledPreds, 3),
    top6Accuracy: calculateRankAccuracy(settledPreds, 6),
  };
  
  saveResults(results);
  console.log(`\n📊 Settled ${settled} predictions`);
  console.log(`   Overall: ${results.stats.accuracy}% (${correct}/${settledPreds.length})`);
}

function calculateBandStats(predictions, band) {
  const bandPreds = predictions.filter(p => p.band === band);
  const correct = bandPreds.filter(p => p.isCorrect).length;
  return {
    total: bandPreds.length,
    correct: correct,
    accuracy: bandPreds.length > 0 ? (correct / bandPreds.length * 100).toFixed(1) : 0,
  };
}

function calculateLeagueStats(predictions) {
  const byLeague = {};
  for (const p of predictions) {
    if (!byLeague[p.league]) {
      byLeague[p.league] = { total: 0, correct: 0 };
    }
    byLeague[p.league].total++;
    if (p.isCorrect) byLeague[p.league].correct++;
  }
  
  for (const league in byLeague) {
    byLeague[league].accuracy = (byLeague[league].correct / byLeague[league].total * 100).toFixed(1);
  }
  return byLeague;
}

function calculateRankAccuracy(predictions, topN) {
  const topPreds = predictions.filter(p => p.rank <= topN);
  const correct = topPreds.filter(p => p.isCorrect).length;
  return {
    total: topPreds.length,
    correct: correct,
    accuracy: topPreds.length > 0 ? (correct / topPreds.length * 100).toFixed(1) : 0,
  };
}

// Main
const command = process.argv[2] || 'both';

console.log('🏈 BTTS Results Tracker\n');

if (command === 'record' || command === 'both') {
  await recordPredictions();
}

if (command === 'settle' || command === 'both') {
  await settleResults();
}

const results = loadResults();
console.log(`\n📈 Total predictions: ${results.predictions.length}`);
console.log(`   Pending: ${results.predictions.filter(p => p.bttsActual === null).length}`);
console.log(`   Settled: ${results.predictions.filter(p => p.bttsActual !== null).length}`);
