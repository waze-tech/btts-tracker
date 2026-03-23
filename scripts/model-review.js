/**
 * BTTS Tracker - Weekly Model Review
 * 
 * Analyzes prediction accuracy and proposes model improvements.
 * Run every Thursday via cron to continuously optimize the model.
 * 
 * Analyzes:
 * 1. Overall accuracy by model component
 * 2. Performance by probability band
 * 3. League-specific patterns
 * 4. Value bet performance (ROI)
 * 5. Calibration (predicted vs actual probabilities)
 * 
 * Outputs:
 * - Proposed weight adjustments
 * - Specific team/league insights
 * - Model improvement recommendations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'results-history.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'model-reviews.json');

// Current model weights (should match fetch-data.js)
const CURRENT_WEIGHTS = {
  xgPoisson: 0.45,
  historicBtts: 0.25,
  scoringPatterns: 0.15,
  recentForm: 0.15,
};

function loadResultsHistory() {
  if (fs.existsSync(RESULTS_FILE)) {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
  }
  return null;
}

function loadReviewHistory() {
  if (fs.existsSync(REVIEWS_FILE)) {
    return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
  }
  return { reviews: [] };
}

function saveReview(review) {
  const history = loadReviewHistory();
  history.reviews.push(review);
  // Keep last 52 reviews (1 year of weekly reviews)
  if (history.reviews.length > 52) {
    history.reviews = history.reviews.slice(-52);
  }
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(history, null, 2));
}

/**
 * Analyze calibration - how well do predicted probabilities match actual outcomes?
 */
function analyzeCalibration(predictions) {
  const buckets = {};
  
  // Group predictions into 10% buckets
  predictions.forEach(p => {
    const bucket = Math.floor(p.probability * 10) * 10; // 0, 10, 20, ..., 90
    const key = `${bucket}-${bucket + 10}`;
    
    if (!buckets[key]) {
      buckets[key] = { total: 0, bttsYes: 0, avgPredicted: 0 };
    }
    
    buckets[key].total++;
    if (p.bttsActual) buckets[key].bttsYes++;
    buckets[key].avgPredicted += p.probability;
  });
  
  // Calculate actual rate vs predicted for each bucket
  const calibration = Object.entries(buckets).map(([range, data]) => ({
    range,
    count: data.total,
    predictedRate: data.avgPredicted / data.total,
    actualRate: data.bttsYes / data.total,
    error: (data.avgPredicted / data.total) - (data.bttsYes / data.total),
  })).sort((a, b) => parseInt(a.range) - parseInt(b.range));
  
  return calibration;
}

/**
 * Analyze performance by individual model components
 * (Using the model breakdown stored in predictions)
 */
function analyzeModelComponents(predictions) {
  // For predictions where we stored individual model scores
  const analysis = {
    xgPoisson: { totalError: 0, count: 0 },
    historic: { totalError: 0, count: 0 },
    form: { totalError: 0, count: 0 },
  };
  
  predictions.forEach(p => {
    const actual = p.bttsActual ? 1 : 0;
    
    // If we have model breakdown data
    if (p.models) {
      if (p.models.poisson !== undefined) {
        analysis.xgPoisson.totalError += Math.abs(p.models.poisson - actual);
        analysis.xgPoisson.count++;
      }
      if (p.models.historic !== undefined) {
        analysis.historic.totalError += Math.abs(p.models.historic - actual);
        analysis.historic.count++;
      }
      if (p.models.form !== undefined) {
        analysis.form.totalError += Math.abs(p.models.form - actual);
        analysis.form.count++;
      }
    }
  });
  
  return {
    xgPoisson: analysis.xgPoisson.count > 0 
      ? { mae: analysis.xgPoisson.totalError / analysis.xgPoisson.count, n: analysis.xgPoisson.count }
      : null,
    historic: analysis.historic.count > 0 
      ? { mae: analysis.historic.totalError / analysis.historic.count, n: analysis.historic.count }
      : null,
    form: analysis.form.count > 0 
      ? { mae: analysis.form.totalError / analysis.form.count, n: analysis.form.count }
      : null,
  };
}

/**
 * Analyze ROI if betting on predictions
 */
function analyzeROI(predictions) {
  let totalStaked = 0;
  let totalReturns = 0;
  let valueBetsStaked = 0;
  let valueBetsReturns = 0;
  let top3Staked = 0;
  let top3Returns = 0;
  
  predictions.forEach(p => {
    if (!p.odds) return;
    
    const stake = 1; // Unit stake
    
    // All predictions where we predicted BTTS
    if (p.predictedBtts) {
      totalStaked += stake;
      if (p.bttsActual) {
        totalReturns += stake * p.odds;
      }
    }
    
    // Value bets only
    if (p.valueRating > 0.03 && p.predictedBtts) {
      valueBetsStaked += stake;
      if (p.bttsActual) {
        valueBetsReturns += stake * p.odds;
      }
    }
    
    // Top 3 picks only
    if (p.isTop3 && p.predictedBtts) {
      top3Staked += stake;
      if (p.bttsActual) {
        top3Returns += stake * p.odds;
      }
    }
  });
  
  return {
    overall: {
      staked: totalStaked,
      returns: totalReturns,
      profit: totalReturns - totalStaked,
      roi: totalStaked > 0 ? ((totalReturns - totalStaked) / totalStaked * 100).toFixed(1) : 0,
    },
    valueBets: {
      staked: valueBetsStaked,
      returns: valueBetsReturns,
      profit: valueBetsReturns - valueBetsStaked,
      roi: valueBetsStaked > 0 ? ((valueBetsReturns - valueBetsStaked) / valueBetsStaked * 100).toFixed(1) : 0,
    },
    top3: {
      staked: top3Staked,
      returns: top3Returns,
      profit: top3Returns - top3Staked,
      roi: top3Staked > 0 ? ((top3Returns - top3Staked) / top3Staked * 100).toFixed(1) : 0,
    },
  };
}

/**
 * Propose weight adjustments based on analysis
 */
function proposeWeightAdjustments(analysis) {
  const proposals = [];
  const newWeights = { ...CURRENT_WEIGHTS };
  
  // Analyze calibration - are we over or under predicting?
  const calibration = analysis.calibration;
  const avgError = calibration.reduce((sum, b) => sum + b.error, 0) / calibration.length;
  
  if (avgError > 0.05) {
    proposals.push({
      issue: 'Model over-predicting BTTS probability',
      suggestion: 'Consider reducing xG Poisson weight or adjusting league baseline rates',
      severity: 'medium',
    });
  } else if (avgError < -0.05) {
    proposals.push({
      issue: 'Model under-predicting BTTS probability',
      suggestion: 'Consider increasing xG Poisson weight or checking for missing high-scoring team data',
      severity: 'medium',
    });
  }
  
  // Analyze component performance
  const components = analysis.modelComponents;
  if (components.xgPoisson && components.historic && components.form) {
    const errors = [
      { name: 'xgPoisson', mae: components.xgPoisson.mae },
      { name: 'historic', mae: components.historic.mae },
      { name: 'form', mae: components.form.mae },
    ].sort((a, b) => a.mae - b.mae);
    
    // Best performing model should potentially get more weight
    const best = errors[0];
    const worst = errors[errors.length - 1];
    
    if (best.mae < worst.mae - 0.1) {
      proposals.push({
        issue: `${best.name} model outperforming ${worst.name} by significant margin`,
        suggestion: `Consider increasing ${best.name} weight by 5% and reducing ${worst.name} by 5%`,
        severity: 'low',
        adjustment: {
          increase: best.name,
          decrease: worst.name,
          amount: 0.05,
        },
      });
      
      // Apply proposed adjustment
      if (best.name === 'xgPoisson') newWeights.xgPoisson += 0.05;
      if (best.name === 'historic') newWeights.historicBtts += 0.05;
      if (worst.name === 'form') newWeights.recentForm = Math.max(0.05, newWeights.recentForm - 0.05);
    }
  }
  
  // Analyze ROI
  const roi = analysis.roi;
  if (roi.top3.roi > 10) {
    proposals.push({
      issue: 'Top 3 picks showing strong positive ROI',
      suggestion: 'Model is performing well - maintain current strategy',
      severity: 'positive',
    });
  } else if (roi.top3.roi < -15) {
    proposals.push({
      issue: 'Top 3 picks showing negative ROI',
      suggestion: 'Review high-probability picks - may need stricter confidence threshold',
      severity: 'high',
    });
  }
  
  // Analyze league performance
  const leagueStats = analysis.byLeague;
  Object.entries(leagueStats).forEach(([league, stats]) => {
    const accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
    if (stats.total >= 5 && accuracy < 0.45) {
      proposals.push({
        issue: `${league} accuracy below 45%`,
        suggestion: `Review ${league} team data - may need updated stats or different league baseline`,
        severity: 'medium',
      });
    } else if (stats.total >= 5 && accuracy > 0.70) {
      proposals.push({
        issue: `${league} showing excellent accuracy (${(accuracy * 100).toFixed(0)}%)`,
        suggestion: `Consider increasing focus on ${league} picks`,
        severity: 'positive',
      });
    }
  });
  
  // Normalize new weights to sum to 1
  const totalWeight = Object.values(newWeights).reduce((sum, w) => sum + w, 0);
  Object.keys(newWeights).forEach(k => {
    newWeights[k] = parseFloat((newWeights[k] / totalWeight).toFixed(2));
  });
  
  return {
    currentWeights: CURRENT_WEIGHTS,
    proposedWeights: newWeights,
    proposals,
    weightChanged: JSON.stringify(CURRENT_WEIGHTS) !== JSON.stringify(newWeights),
  };
}

/**
 * Main analysis function
 */
function runModelReview() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 BTTS TRACKER - WEEKLY MODEL REVIEW');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log('');
  
  const results = loadResultsHistory();
  
  if (!results || results.predictions.length < 10) {
    console.log('⚠️  Insufficient data for meaningful analysis (need at least 10 results)');
    console.log('   Record more results with: node scripts/record-results.js record <id> <home> <away>');
    return null;
  }
  
  const predictions = results.predictions;
  const lastWeekPredictions = predictions.filter(p => {
    const date = new Date(p.date);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return date >= weekAgo;
  });
  
  console.log(`Total predictions analyzed: ${predictions.length}`);
  console.log(`Last 7 days: ${lastWeekPredictions.length}`);
  console.log('');
  
  // Run all analyses
  const analysis = {
    date: new Date().toISOString(),
    totalPredictions: predictions.length,
    lastWeekCount: lastWeekPredictions.length,
    overallAccuracy: results.stats.total > 0 ? results.stats.correct / results.stats.total : 0,
    top3Accuracy: results.stats.top3Total > 0 ? results.stats.top3Correct / results.stats.top3Total : 0,
    byLeague: results.stats.byLeague,
    byProbabilityBand: results.stats.byProbabilityBand,
    calibration: analyzeCalibration(predictions),
    modelComponents: analyzeModelComponents(predictions),
    roi: analyzeROI(predictions),
  };
  
  // Generate proposals
  const proposals = proposeWeightAdjustments(analysis);
  
  // Print results
  console.log('📈 ACCURACY SUMMARY');
  console.log('───────────────────────────────────────');
  console.log(`Overall:     ${(analysis.overallAccuracy * 100).toFixed(1)}%`);
  console.log(`Top 3 Picks: ${(analysis.top3Accuracy * 100).toFixed(1)}%`);
  console.log('');
  
  console.log('By Probability Band:');
  Object.entries(analysis.byProbabilityBand).forEach(([band, stats]) => {
    const acc = stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(1) : '-';
    console.log(`  ${band.padEnd(8)}: ${acc}% (${stats.correct}/${stats.total})`);
  });
  console.log('');
  
  console.log('By League:');
  Object.entries(analysis.byLeague).forEach(([league, stats]) => {
    const acc = stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(1) : '-';
    console.log(`  ${league.padEnd(15)}: ${acc}% (${stats.correct}/${stats.total})`);
  });
  console.log('');
  
  console.log('📊 CALIBRATION (Predicted vs Actual)');
  console.log('───────────────────────────────────────');
  analysis.calibration.forEach(b => {
    if (b.count >= 3) {
      const bar = b.error > 0 ? '▲'.repeat(Math.min(5, Math.round(Math.abs(b.error) * 20))) 
                              : '▼'.repeat(Math.min(5, Math.round(Math.abs(b.error) * 20)));
      const direction = b.error > 0 ? 'over' : 'under';
      console.log(`  ${b.range}%: Pred ${(b.predictedRate * 100).toFixed(0)}% | Actual ${(b.actualRate * 100).toFixed(0)}% | ${bar} ${direction}`);
    }
  });
  console.log('');
  
  console.log('💰 ROI ANALYSIS (if betting £1 per pick)');
  console.log('───────────────────────────────────────');
  console.log(`Overall:    ROI ${analysis.roi.overall.roi}% (£${analysis.roi.overall.profit.toFixed(2)} from £${analysis.roi.overall.staked})`);
  console.log(`Value Bets: ROI ${analysis.roi.valueBets.roi}% (£${analysis.roi.valueBets.profit.toFixed(2)} from £${analysis.roi.valueBets.staked})`);
  console.log(`Top 3:      ROI ${analysis.roi.top3.roi}% (£${analysis.roi.top3.profit.toFixed(2)} from £${analysis.roi.top3.staked})`);
  console.log('');
  
  console.log('🔧 MODEL IMPROVEMENT PROPOSALS');
  console.log('───────────────────────────────────────');
  if (proposals.proposals.length === 0) {
    console.log('  ✓ No significant issues detected - model performing within expected parameters');
  } else {
    proposals.proposals.forEach((p, i) => {
      const icon = p.severity === 'positive' ? '✅' : p.severity === 'high' ? '🔴' : p.severity === 'medium' ? '🟡' : '🔵';
      console.log(`\n  ${icon} ${p.issue}`);
      console.log(`     → ${p.suggestion}`);
    });
  }
  console.log('');
  
  if (proposals.weightChanged) {
    console.log('📐 PROPOSED WEIGHT ADJUSTMENTS');
    console.log('───────────────────────────────────────');
    console.log('Current weights:');
    Object.entries(proposals.currentWeights).forEach(([k, v]) => {
      console.log(`  ${k.padEnd(15)}: ${(v * 100).toFixed(0)}%`);
    });
    console.log('\nProposed weights:');
    Object.entries(proposals.proposedWeights).forEach(([k, v]) => {
      const current = proposals.currentWeights[k];
      const diff = v - current;
      const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
      console.log(`  ${k.padEnd(15)}: ${(v * 100).toFixed(0)}% ${arrow}`);
    });
  }
  console.log('');
  
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Save review
  const review = {
    ...analysis,
    proposals: proposals.proposals,
    currentWeights: proposals.currentWeights,
    proposedWeights: proposals.proposedWeights,
  };
  
  saveReview(review);
  console.log(`\n💾 Review saved to ${REVIEWS_FILE}`);
  
  return review;
}

// Run if called directly
runModelReview();

export { runModelReview };
