/**
 * BTTS Tracker - Results Recording
 * 
 * Records actual match results to track prediction accuracy over time.
 * Run after matches complete: node scripts/record-results.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'results-history.json');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'btts-data.json');

// Load or initialize results history
function loadResultsHistory() {
  if (fs.existsSync(RESULTS_FILE)) {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
  }
  return {
    predictions: [],
    stats: {
      total: 0,
      correct: 0,
      top3Total: 0,
      top3Correct: 0,
      byLeague: {},
      byProbabilityBand: {
        high: { total: 0, correct: 0 },    // >= 65%
        medium: { total: 0, correct: 0 },  // 50-65%
        low: { total: 0, correct: 0 },     // < 50%
      },
      dailyAccuracy: [],
      weeklyAccuracy: [],
    },
  };
}

function saveResultsHistory(history) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(history, null, 2));
}

/**
 * Record a single match result
 * @param {string} fixtureId - The fixture ID from predictions
 * @param {number} homeGoals - Goals scored by home team
 * @param {number} awayGoals - Goals scored by away team
 */
function recordResult(fixtureId, homeGoals, awayGoals) {
  const history = loadResultsHistory();
  const predictions = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
  
  const fixture = predictions.fixtures.find(f => f.id === fixtureId);
  if (!fixture) {
    console.log(`⚠️ Fixture ${fixtureId} not found in predictions`);
    return;
  }
  
  const bttsActual = homeGoals > 0 && awayGoals > 0;
  const bttsPredicrected = fixture.probability >= 0.5;
  const isCorrect = bttsActual === bttsPredicrected;
  const isTop3 = fixture.rank <= 3;
  
  // Probability band
  let band = 'low';
  if (fixture.probability >= 0.65) band = 'high';
  else if (fixture.probability >= 0.50) band = 'medium';
  
  const result = {
    fixtureId,
    date: fixture.commenceTime,
    recordedAt: new Date().toISOString(),
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    league: fixture.league,
    homeGoals,
    awayGoals,
    bttsActual,
    probability: fixture.probability,
    rank: fixture.rank,
    isTop3,
    predictedBtts: bttsPredicrected,
    isCorrect,
    band,
    valueRating: fixture.valueRating,
    odds: fixture.btts?.yes?.odds,
  };
  
  history.predictions.push(result);
  
  // Update stats
  history.stats.total++;
  if (isCorrect) history.stats.correct++;
  
  if (isTop3) {
    history.stats.top3Total++;
    if (isCorrect) history.stats.top3Correct++;
  }
  
  // League stats
  if (!history.stats.byLeague[fixture.league]) {
    history.stats.byLeague[fixture.league] = { total: 0, correct: 0 };
  }
  history.stats.byLeague[fixture.league].total++;
  if (isCorrect) history.stats.byLeague[fixture.league].correct++;
  
  // Band stats
  history.stats.byProbabilityBand[band].total++;
  if (isCorrect) history.stats.byProbabilityBand[band].correct++;
  
  saveResultsHistory(history);
  
  console.log(`✅ Recorded: ${fixture.homeTeam} ${homeGoals}-${awayGoals} ${fixture.awayTeam}`);
  console.log(`   BTTS: ${bttsActual ? 'YES' : 'NO'} | Predicted: ${(fixture.probability * 100).toFixed(0)}% | ${isCorrect ? '✓ CORRECT' : '✗ WRONG'}`);
  
  return result;
}

/**
 * Bulk record results from an array
 * Format: [{ fixtureId, homeGoals, awayGoals }, ...]
 */
function recordBulkResults(results) {
  results.forEach(r => recordResult(r.fixtureId, r.homeGoals, r.awayGoals));
  
  const history = loadResultsHistory();
  updateDailyStats(history);
  saveResultsHistory(history);
  
  printSummary();
}

/**
 * Update daily/weekly aggregated stats
 */
function updateDailyStats(history) {
  // Group predictions by date
  const byDate = {};
  history.predictions.forEach(p => {
    const date = p.date.split('T')[0];
    if (!byDate[date]) byDate[date] = { total: 0, correct: 0, top3Total: 0, top3Correct: 0 };
    byDate[date].total++;
    if (p.isCorrect) byDate[date].correct++;
    if (p.isTop3) {
      byDate[date].top3Total++;
      if (p.isCorrect) byDate[date].top3Correct++;
    }
  });
  
  history.stats.dailyAccuracy = Object.entries(byDate)
    .map(([date, stats]) => ({
      date,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
      top3Accuracy: stats.top3Total > 0 ? stats.top3Correct / stats.top3Total : null,
      total: stats.total,
      top3Total: stats.top3Total,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  // Weekly aggregation
  const byWeek = {};
  history.predictions.forEach(p => {
    const date = new Date(p.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!byWeek[weekKey]) byWeek[weekKey] = { total: 0, correct: 0, top3Total: 0, top3Correct: 0 };
    byWeek[weekKey].total++;
    if (p.isCorrect) byWeek[weekKey].correct++;
    if (p.isTop3) {
      byWeek[weekKey].top3Total++;
      if (p.isCorrect) byWeek[weekKey].top3Correct++;
    }
  });
  
  history.stats.weeklyAccuracy = Object.entries(byWeek)
    .map(([week, stats]) => ({
      week,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
      top3Accuracy: stats.top3Total > 0 ? stats.top3Correct / stats.top3Total : null,
      total: stats.total,
      top3Total: stats.top3Total,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

function printSummary() {
  const history = loadResultsHistory();
  const s = history.stats;
  
  console.log('\n📊 ACCURACY SUMMARY\n');
  console.log('═══════════════════════════════════════════');
  console.log(`Overall:     ${s.correct}/${s.total} = ${s.total > 0 ? ((s.correct/s.total)*100).toFixed(1) : 0}%`);
  console.log(`Top 3 Picks: ${s.top3Correct}/${s.top3Total} = ${s.top3Total > 0 ? ((s.top3Correct/s.top3Total)*100).toFixed(1) : 0}%`);
  console.log('═══════════════════════════════════════════');
  
  console.log('\nBy Probability Band:');
  Object.entries(s.byProbabilityBand).forEach(([band, stats]) => {
    const acc = stats.total > 0 ? ((stats.correct/stats.total)*100).toFixed(1) : '-';
    console.log(`  ${band.padEnd(8)}: ${stats.correct}/${stats.total} = ${acc}%`);
  });
  
  console.log('\nBy League:');
  Object.entries(s.byLeague).forEach(([league, stats]) => {
    const acc = stats.total > 0 ? ((stats.correct/stats.total)*100).toFixed(1) : '-';
    console.log(`  ${league.padEnd(15)}: ${stats.correct}/${stats.total} = ${acc}%`);
  });
  
  if (s.weeklyAccuracy.length > 0) {
    console.log('\nWeekly Trend:');
    s.weeklyAccuracy.slice(-5).forEach(w => {
      const bar = '█'.repeat(Math.round(w.accuracy * 20));
      console.log(`  ${w.week}: ${bar} ${(w.accuracy*100).toFixed(0)}% (${w.total} games)`);
    });
  }
}

// Generate sample historical data for demo
function generateSampleHistory() {
  const history = loadResultsHistory();
  
  // Generate 8 weeks of sample data
  const sampleResults = [];
  const teams = [
    ['Leeds United', 'Sheffield United', 'Championship'],
    ['Norwich City', 'Coventry City', 'Championship'],
    ['Birmingham City', 'Wrexham', 'League One'],
    ['Peterborough United', 'Lincoln City', 'League One'],
    ['Doncaster Rovers', 'MK Dons', 'League Two'],
  ];
  
  for (let week = 8; week >= 1; week--) {
    const weekDate = new Date();
    weekDate.setDate(weekDate.getDate() - (week * 7));
    
    teams.forEach((team, idx) => {
      const prob = 0.45 + Math.random() * 0.35; // 45-80%
      const isTop3 = idx < 3;
      const rank = idx + 1;
      
      // Simulate outcomes - higher probability = higher chance of being correct
      // Top 3 picks should have slightly higher accuracy
      const baseAccuracy = prob * 0.85 + (isTop3 ? 0.08 : 0);
      const bttsActual = Math.random() < (prob + (Math.random() * 0.2 - 0.1));
      const predictedBtts = prob >= 0.5;
      const isCorrect = bttsActual === predictedBtts;
      
      // Generate realistic scorelines
      let homeGoals, awayGoals;
      if (bttsActual) {
        homeGoals = 1 + Math.floor(Math.random() * 3);
        awayGoals = 1 + Math.floor(Math.random() * 2);
      } else {
        if (Math.random() > 0.5) {
          homeGoals = Math.floor(Math.random() * 3);
          awayGoals = 0;
        } else {
          homeGoals = 0;
          awayGoals = Math.floor(Math.random() * 3);
        }
      }
      
      let band = 'low';
      if (prob >= 0.65) band = 'high';
      else if (prob >= 0.50) band = 'medium';
      
      sampleResults.push({
        fixtureId: `sample-w${week}-${idx}`,
        date: weekDate.toISOString(),
        recordedAt: new Date().toISOString(),
        homeTeam: team[0],
        awayTeam: team[1],
        league: team[2],
        homeGoals,
        awayGoals,
        bttsActual,
        probability: prob,
        rank,
        isTop3,
        predictedBtts,
        isCorrect,
        band,
        valueRating: Math.random() * 0.1 - 0.05,
        odds: (1 / prob) * (0.92 + Math.random() * 0.08),
      });
    });
  }
  
  history.predictions = sampleResults;
  
  // Recalculate all stats
  history.stats = {
    total: 0,
    correct: 0,
    top3Total: 0,
    top3Correct: 0,
    byLeague: {},
    byProbabilityBand: {
      high: { total: 0, correct: 0 },
      medium: { total: 0, correct: 0 },
      low: { total: 0, correct: 0 },
    },
    dailyAccuracy: [],
    weeklyAccuracy: [],
  };
  
  sampleResults.forEach(r => {
    history.stats.total++;
    if (r.isCorrect) history.stats.correct++;
    
    if (r.isTop3) {
      history.stats.top3Total++;
      if (r.isCorrect) history.stats.top3Correct++;
    }
    
    if (!history.stats.byLeague[r.league]) {
      history.stats.byLeague[r.league] = { total: 0, correct: 0 };
    }
    history.stats.byLeague[r.league].total++;
    if (r.isCorrect) history.stats.byLeague[r.league].correct++;
    
    history.stats.byProbabilityBand[r.band].total++;
    if (r.isCorrect) history.stats.byProbabilityBand[r.band].correct++;
  });
  
  updateDailyStats(history);
  saveResultsHistory(history);
  
  console.log('📈 Generated sample historical data (8 weeks)');
  printSummary();
}

// CLI interface
const args = process.argv.slice(2);
const command = args[0];

if (command === 'sample') {
  generateSampleHistory();
} else if (command === 'summary') {
  printSummary();
} else if (command === 'record' && args.length === 4) {
  // node scripts/record-results.js record <fixtureId> <homeGoals> <awayGoals>
  recordResult(args[1], parseInt(args[2]), parseInt(args[3]));
} else {
  console.log(`
BTTS Results Tracker

Commands:
  node scripts/record-results.js sample          Generate sample history for demo
  node scripts/record-results.js summary         Show accuracy summary
  node scripts/record-results.js record <id> <home> <away>   Record a result

Example:
  node scripts/record-results.js record soccer_efl_champ-0 2 1
  `);
}

export { recordResult, recordBulkResults, loadResultsHistory, printSummary, generateSampleHistory };
