/**
 * BTTS Tracker - Auto Record Results
 * 
 * Automatically fetches completed match results and records them.
 * Uses football-data.org API (free tier: 10 requests/minute)
 * 
 * Usage: 
 *   node scripts/auto-record.js           # Record yesterday's results
 *   node scripts/auto-record.js today     # Record today's completed matches
 *   node scripts/auto-record.js 2026-03-20  # Record specific date
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'results-history.json');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'btts-data.json');

// API-Football or football-data.org for results
// Using The Odds API scores endpoint (same API we use for odds)
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// League mappings
const LEAGUES = {
  'soccer_efl_champ': 'Championship',
  'soccer_england_league1': 'League One', 
  'soccer_england_league2': 'League Two',
};

// Team name normalization
function normalizeTeamName(name) {
  const mappings = {
    'Leeds': 'Leeds United',
    'Sheffield Utd': 'Sheffield United',
    'Norwich': 'Norwich City',
    'Coventry': 'Coventry City',
    'Birmingham': 'Birmingham City',
    'Peterborough': 'Peterborough United',
    'Bristol City': 'Bristol City',
    'Hull': 'Hull City',
    'Huddersfield': 'Huddersfield Town',
    'Stockport': 'Stockport County',
    'Doncaster': 'Doncaster Rovers',
    'Crewe': 'Crewe Alexandra',
    'Bradford': 'Bradford City',
    'Bolton': 'Bolton Wanderers',
    'Plymouth': 'Plymouth Argyle',
    'West Brom': 'West Bromwich Albion',
    'West Bromwich': 'West Bromwich Albion',
    'Blackburn': 'Blackburn Rovers',
    'Preston': 'Preston North End',
    'Stoke': 'Stoke City',
    'Cardiff': 'Cardiff City',
    'Swansea': 'Swansea City',
    'Luton': 'Luton Town',
    'Derby': 'Derby County',
    'Rotherham': 'Rotherham United',
    'Reading': 'Reading',
    'Wigan': 'Wigan Athletic',
  };
  
  return mappings[name] || name;
}

/**
 * Fetch completed match scores from The Odds API
 */
async function fetchScores(sportKey, daysFrom = 1) {
  if (!ODDS_API_KEY) {
    console.log('⚠️  No ODDS_API_KEY set - using fallback method');
    return null;
  }
  
  const url = `${ODDS_API_BASE}/sports/${sportKey}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=${daysFrom}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.filter(match => match.completed);
    
  } catch (error) {
    console.error(`❌ Error fetching scores: ${error.message}`);
    return null;
  }
}

/**
 * Fallback: Scrape BBC Sport for results
 */
async function fetchBBCScores(date) {
  const dateStr = date.toISOString().split('T')[0];
  const url = `https://www.bbc.co.uk/sport/football/scores-fixtures/${dateStr}`;
  
  console.log(`📰 Fetching from BBC Sport: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const results = [];
    
    // Parse Championship, League One, League Two sections
    const leaguePatterns = [
      { pattern: /Championship[\s\S]*?(?=League One|League Two|$)/i, league: 'Championship' },
      { pattern: /League One[\s\S]*?(?=League Two|Championship|$)/i, league: 'League One' },
      { pattern: /League Two[\s\S]*?(?=Championship|League One|$)/i, league: 'League Two' },
    ];
    
    // Simplified score extraction - BBC uses specific markup
    // Match pattern: TeamA X - Y TeamB
    const scoreRegex = /data-home="([^"]+)"[^>]*>[\s\S]*?(\d+)\s*-\s*(\d+)[\s\S]*?data-away="([^"]+)"/g;
    
    let match;
    while ((match = scoreRegex.exec(html)) !== null) {
      results.push({
        homeTeam: normalizeTeamName(match[1]),
        awayTeam: normalizeTeamName(match[4]),
        homeScore: parseInt(match[2]),
        awayScore: parseInt(match[3]),
        date: dateStr,
      });
    }
    
    return results;
    
  } catch (error) {
    console.error(`❌ Error fetching BBC scores: ${error.message}`);
    return [];
  }
}

/**
 * Load results history
 */
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
      top6Total: 0,
      top6Correct: 0,
      top9Total: 0,
      top9Correct: 0,
      byLeague: {},
      byProbabilityBand: {
        high: { total: 0, correct: 0 },
        medium: { total: 0, correct: 0 },
        low: { total: 0, correct: 0 },
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
 * Load predictions to match against
 */
function loadPredictions() {
  if (fs.existsSync(PREDICTIONS_FILE)) {
    return JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
  }
  return { fixtures: [] };
}

/**
 * Match a result to our prediction
 */
function findPrediction(predictions, homeTeam, awayTeam) {
  return predictions.fixtures.find(f => 
    (f.homeTeam === homeTeam || normalizeTeamName(f.homeTeam) === homeTeam) &&
    (f.awayTeam === awayTeam || normalizeTeamName(f.awayTeam) === awayTeam)
  );
}

/**
 * Record a single result
 */
function recordResult(history, prediction, homeGoals, awayGoals, matchDate) {
  // Check if already recorded
  const existing = history.predictions.find(p => 
    p.homeTeam === prediction.homeTeam && 
    p.awayTeam === prediction.awayTeam &&
    p.date?.split('T')[0] === matchDate
  );
  
  if (existing) {
    return null; // Already recorded
  }
  
  const bttsActual = homeGoals > 0 && awayGoals > 0;
  const predictedBtts = prediction.probability >= 0.5;
  const isCorrect = bttsActual === predictedBtts;
  
  let band = 'low';
  if (prediction.probability >= 0.65) band = 'high';
  else if (prediction.probability >= 0.50) band = 'medium';
  
  const result = {
    fixtureId: prediction.id,
    date: prediction.commenceTime || matchDate,
    recordedAt: new Date().toISOString(),
    homeTeam: prediction.homeTeam,
    awayTeam: prediction.awayTeam,
    league: prediction.league,
    homeGoals,
    awayGoals,
    bttsActual,
    probability: prediction.probability,
    rank: prediction.rank,
    isTop3: prediction.rank <= 3,
    isTop6: prediction.rank <= 6,
    isTop9: prediction.rank <= 9,
    predictedBtts,
    isCorrect,
    band,
    valueRating: prediction.valueRating,
    odds: prediction.btts?.yes?.odds,
    autoRecorded: true,
  };
  
  history.predictions.push(result);
  
  // Update stats
  history.stats.total++;
  if (isCorrect) history.stats.correct++;
  
  if (result.isTop3) {
    history.stats.top3Total++;
    if (isCorrect) history.stats.top3Correct++;
  }
  
  if (result.isTop6) {
    history.stats.top6Total++;
    if (isCorrect) history.stats.top6Correct++;
  }
  
  if (result.isTop9) {
    history.stats.top9Total++;
    if (isCorrect) history.stats.top9Correct++;
  }
  
  // League stats
  if (!history.stats.byLeague[prediction.league]) {
    history.stats.byLeague[prediction.league] = { total: 0, correct: 0 };
  }
  history.stats.byLeague[prediction.league].total++;
  if (isCorrect) history.stats.byLeague[prediction.league].correct++;
  
  // Band stats
  history.stats.byProbabilityBand[band].total++;
  if (isCorrect) history.stats.byProbabilityBand[band].correct++;
  
  return result;
}

/**
 * Update daily/weekly aggregated stats
 */
function updateAggregatedStats(history) {
  // Group predictions by date
  const byDate = {};
  history.predictions.forEach(p => {
    const date = (p.date || '').split('T')[0];
    if (!date) return;
    
    if (!byDate[date]) byDate[date] = { 
      total: 0, correct: 0, 
      top3Total: 0, top3Correct: 0,
      top6Total: 0, top6Correct: 0,
      top9Total: 0, top9Correct: 0,
    };
    byDate[date].total++;
    if (p.isCorrect) byDate[date].correct++;
    if (p.isTop3) {
      byDate[date].top3Total++;
      if (p.isCorrect) byDate[date].top3Correct++;
    }
    if (p.isTop6) {
      byDate[date].top6Total++;
      if (p.isCorrect) byDate[date].top6Correct++;
    }
    if (p.isTop9) {
      byDate[date].top9Total++;
      if (p.isCorrect) byDate[date].top9Correct++;
    }
  });
  
  history.stats.dailyAccuracy = Object.entries(byDate)
    .map(([date, stats]) => ({
      date,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
      top3Accuracy: stats.top3Total > 0 ? stats.top3Correct / stats.top3Total : null,
      top6Accuracy: stats.top6Total > 0 ? stats.top6Correct / stats.top6Total : null,
      top9Accuracy: stats.top9Total > 0 ? stats.top9Correct / stats.top9Total : null,
      total: stats.total,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  // Weekly aggregation
  const byWeek = {};
  history.predictions.forEach(p => {
    const date = new Date(p.date);
    if (isNaN(date)) return;
    
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!byWeek[weekKey]) byWeek[weekKey] = { 
      total: 0, correct: 0, 
      top3Total: 0, top3Correct: 0,
      top6Total: 0, top6Correct: 0,
      top9Total: 0, top9Correct: 0,
    };
    byWeek[weekKey].total++;
    if (p.isCorrect) byWeek[weekKey].correct++;
    if (p.isTop3) {
      byWeek[weekKey].top3Total++;
      if (p.isCorrect) byWeek[weekKey].top3Correct++;
    }
    if (p.isTop6) {
      byWeek[weekKey].top6Total++;
      if (p.isCorrect) byWeek[weekKey].top6Correct++;
    }
    if (p.isTop9) {
      byWeek[weekKey].top9Total++;
      if (p.isCorrect) byWeek[weekKey].top9Correct++;
    }
  });
  
  history.stats.weeklyAccuracy = Object.entries(byWeek)
    .map(([week, stats]) => ({
      week,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
      top3Accuracy: stats.top3Total > 0 ? stats.top3Correct / stats.top3Total : null,
      top6Accuracy: stats.top6Total > 0 ? stats.top6Correct / stats.top6Total : null,
      top9Accuracy: stats.top9Total > 0 ? stats.top9Correct / stats.top9Total : null,
      total: stats.total,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Main function
 */
async function autoRecordResults(dateArg) {
  console.log('🎯 BTTS Tracker - Auto Record Results\n');
  console.log('═══════════════════════════════════════════\n');
  
  // Determine date
  let targetDate;
  if (dateArg === 'today') {
    targetDate = new Date();
  } else if (dateArg && dateArg.match(/^\d{4}-\d{2}-\d{2}$/)) {
    targetDate = new Date(dateArg);
  } else {
    // Default: yesterday
    targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);
  }
  
  const dateStr = targetDate.toISOString().split('T')[0];
  console.log(`📅 Recording results for: ${dateStr}\n`);
  
  const history = loadResultsHistory();
  const predictions = loadPredictions();
  
  let recorded = 0;
  let skipped = 0;
  let notFound = 0;
  
  // Try Odds API first
  if (ODDS_API_KEY) {
    for (const sportKey of Object.keys(LEAGUES)) {
      console.log(`🔍 Checking ${LEAGUES[sportKey]}...`);
      
      const scores = await fetchScores(sportKey, 3); // Last 3 days
      
      if (scores) {
        for (const match of scores) {
          const homeTeam = normalizeTeamName(match.home_team);
          const awayTeam = normalizeTeamName(match.away_team);
          
          // Find scores
          const homeScore = match.scores?.find(s => s.name === match.home_team)?.score;
          const awayScore = match.scores?.find(s => s.name === match.away_team)?.score;
          
          if (homeScore === undefined || awayScore === undefined) continue;
          
          const prediction = findPrediction(predictions, homeTeam, awayTeam);
          
          if (prediction) {
            const result = recordResult(history, prediction, parseInt(homeScore), parseInt(awayScore), dateStr);
            if (result) {
              console.log(`  ✅ ${homeTeam} ${homeScore}-${awayScore} ${awayTeam} | BTTS: ${result.bttsActual ? 'YES' : 'NO'} | ${result.isCorrect ? '✓' : '✗'}`);
              recorded++;
            } else {
              skipped++;
            }
          } else {
            notFound++;
          }
        }
      }
    }
  } else {
    // Fallback to BBC
    const bbcResults = await fetchBBCScores(targetDate);
    
    for (const match of bbcResults) {
      const prediction = findPrediction(predictions, match.homeTeam, match.awayTeam);
      
      if (prediction) {
        const result = recordResult(history, prediction, match.homeScore, match.awayScore, dateStr);
        if (result) {
          console.log(`  ✅ ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam} | BTTS: ${result.bttsActual ? 'YES' : 'NO'} | ${result.isCorrect ? '✓' : '✗'}`);
          recorded++;
        } else {
          skipped++;
        }
      } else {
        notFound++;
      }
    }
  }
  
  // Update aggregated stats
  updateAggregatedStats(history);
  saveResultsHistory(history);
  
  console.log('\n═══════════════════════════════════════════');
  console.log(`📊 Summary:`);
  console.log(`   Recorded: ${recorded}`);
  console.log(`   Skipped (already recorded): ${skipped}`);
  console.log(`   Not in predictions: ${notFound}`);
  
  if (recorded > 0) {
    const s = history.stats;
    console.log(`\n📈 Updated Accuracy:`);
    console.log(`   Overall: ${s.total > 0 ? ((s.correct/s.total)*100).toFixed(1) : 0}%`);
    console.log(`   Top 3:   ${s.top3Total > 0 ? ((s.top3Correct/s.top3Total)*100).toFixed(1) : 0}%`);
    console.log(`   Top 6:   ${s.top6Total > 0 ? ((s.top6Correct/s.top6Total)*100).toFixed(1) : 0}%`);
    console.log(`   Top 9:   ${s.top9Total > 0 ? ((s.top9Correct/s.top9Total)*100).toFixed(1) : 0}%`);
  }
  
  console.log(`\n💾 Saved to ${RESULTS_FILE}`);
}

// CLI
const args = process.argv.slice(2);
autoRecordResults(args[0]);

export { autoRecordResults };
