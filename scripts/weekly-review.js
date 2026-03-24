#!/usr/bin/env node
/**
 * BTTS Tracker - Weekly Review (Thursday Cron Job)
 * 
 * Comprehensive weekly review that:
 * 1. Runs model accuracy analysis (existing model-review.js)
 * 2. Audits all pages for consistency
 * 3. Checks data freshness
 * 4. Validates navigation and features
 * 5. Generates improvement recommendations
 * 
 * Run every Thursday 10am via cron:
 * 0 10 * * 4 cd ~/projects/btts-tracker && node scripts/weekly-review.js >> logs/weekly-review.log 2>&1
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

// Expected pages and their features
const PAGES = {
  'index.html': {
    name: 'Predictions',
    expectedFeatures: [
      'nav links (5 tabs)',
      'filter buttons (All Leagues, Championship, League One, League Two)',
      'date filter dropdown',
      'Top N filter (Top 3, 6, 9, 15)',
      'sort options',
      'fixture cards with Add to Slip',
      'floating betslip',
      'methodology section',
    ],
    navLinks: ['/', '/accuracy.html', '/my-picks.html', '/model-history.html', '/how-it-works.html'],
  },
  'accuracy.html': {
    name: 'Accuracy Dashboard',
    expectedFeatures: [
      'nav links (5 tabs)',
      'filter buttons (All Leagues, Championship, League One, League Two)',
      'Top N filter (Top 3, 6, 9)',
      'Top 3/6/9/Overall stat cards',
      'accuracy over time chart',
      'probability band breakdown',
      'league breakdown',
      'recent results table with rank badges',
    ],
    navLinks: ['/', '/accuracy.html', '/my-picks.html', '/model-history.html', '/how-it-works.html'],
  },
  'my-picks.html': {
    name: 'My Picks',
    expectedFeatures: [
      'nav links (5 tabs)',
      'stat cards (P&L, Win Rate, Pending, Avg Odds)',
      'weekly P&L chart',
      'filter tabs (All Time, This Week, Pending, Settled)',
      'picks table with accumulator support',
      'recommendations section',
    ],
    navLinks: ['/', '/accuracy.html', '/my-picks.html', '/model-history.html', '/how-it-works.html'],
  },
  'model-history.html': {
    name: 'Model History',
    expectedFeatures: [
      'nav links (5 tabs)',
      'current version display',
      'current weights breakdown',
      'pending proposals section',
      'changelog timeline',
      'approval/rejection badges',
    ],
    navLinks: ['/', '/accuracy.html', '/my-picks.html', '/model-history.html', '/how-it-works.html'],
  },
  'how-it-works.html': {
    name: 'How It Works',
    expectedFeatures: [
      'nav links (5 tabs)',
      'overview section',
      'model weights explanation',
      'xG Poisson methodology',
      'confidence score explanation',
      'value bet detection',
      'data sources table',
      'model improvement process',
    ],
    navLinks: ['/', '/accuracy.html', '/my-picks.html', '/model-history.html', '/how-it-works.html'],
  },
};

// Check if a page contains expected nav links
function auditNavLinks(content, pageName, expected) {
  const issues = [];
  expected.forEach(link => {
    const linkPattern = new RegExp(`href=["']${link.replace(/\//g, '\\/')}["']`);
    if (!linkPattern.test(content)) {
      issues.push(`Missing nav link: ${link}`);
    }
  });
  return issues;
}

// Check for common features in HTML
function auditPageFeatures(content, features) {
  const checks = {
    'nav links (5 tabs)': /<nav[\s\S]*?<\/nav>/i,
    'filter buttons': /filter-btn/,
    'stat cards': /stat-card|stat-value/,
    'chart': /canvas|Chart\.js|chart\.js/i,
    'table': /<table/,
    'betslip': /betslip/i,
    'methodology': /methodology/i,
    'recommendations': /recommendation/i,
    'changelog': /changelog/i,
    'approval': /approv/i,
    'weights': /weight/i,
    'xG': /xG|expected goals/i,
    'Poisson': /poisson/i,
    'dropdown': /<select/,
    'Top N filter': /topNSelect|Show: Top/,
    'accumulator': /accumulator/i,
  };
  
  const found = [];
  const missing = [];
  
  features.forEach(feature => {
    const featureLower = feature.toLowerCase();
    let isFound = false;
    
    // Check against patterns
    for (const [key, pattern] of Object.entries(checks)) {
      if (featureLower.includes(key.toLowerCase()) || key.toLowerCase().includes(featureLower.split(' ')[0])) {
        if (pattern.test(content)) {
          isFound = true;
          break;
        }
      }
    }
    
    // Generic keyword check
    if (!isFound) {
      const keywords = feature.toLowerCase().split(/[,\s()]+/).filter(k => k.length > 3);
      isFound = keywords.some(kw => content.toLowerCase().includes(kw));
    }
    
    if (isFound) {
      found.push(feature);
    } else {
      missing.push(feature);
    }
  });
  
  return { found, missing };
}

// Check data freshness
function auditData() {
  const issues = [];
  const now = new Date();
  
  // Check btts-data.json
  const bttsDataPath = path.join(DATA_DIR, 'btts-data.json');
  if (fs.existsSync(bttsDataPath)) {
    const stat = fs.statSync(bttsDataPath);
    const hoursSinceUpdate = (now - stat.mtime) / (1000 * 60 * 60);
    if (hoursSinceUpdate > 24) {
      issues.push(`btts-data.json is ${Math.round(hoursSinceUpdate)} hours old (should update daily)`);
    }
  } else {
    issues.push('btts-data.json not found');
  }
  
  // Check model-changelog.json
  const changelogPath = path.join(DATA_DIR, 'model-changelog.json');
  if (fs.existsSync(changelogPath)) {
    const changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf8'));
    if (changelog.pendingProposals?.filter(p => p.status === 'pending').length > 0) {
      issues.push(`${changelog.pendingProposals.filter(p => p.status === 'pending').length} pending model proposals awaiting review`);
    }
  }
  
  // Check results-history.json
  const resultsPath = path.join(DATA_DIR, 'results-history.json');
  if (fs.existsSync(resultsPath)) {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    if (results.predictions?.length > 0) {
      const lastResult = results.predictions[results.predictions.length - 1];
      const lastDate = new Date(lastResult.kickoff || lastResult.settledAt);
      const daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);
      if (daysSince > 7) {
        issues.push(`Results history last updated ${Math.round(daysSince)} days ago`);
      }
    }
  } else {
    issues.push('results-history.json not found - no accuracy data');
  }
  
  return issues;
}

// Main audit function
function runWeeklyReview() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         📋 BTTS TRACKER - WEEKLY REVIEW');
  console.log(`         ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  const allIssues = [];
  const recommendations = [];
  
  // 1. Audit all pages
  console.log('📄 PAGE AUDIT');
  console.log('───────────────────────────────────────');
  
  for (const [filename, config] of Object.entries(PAGES)) {
    const filepath = path.join(PROJECT_ROOT, filename);
    
    if (!fs.existsSync(filepath)) {
      console.log(`❌ ${config.name} (${filename}): FILE MISSING`);
      allIssues.push(`Missing page: ${filename}`);
      continue;
    }
    
    const content = fs.readFileSync(filepath, 'utf8');
    
    // Check nav links
    const navIssues = auditNavLinks(content, config.name, config.navLinks);
    
    // Check features
    const { found, missing } = auditPageFeatures(content, config.expectedFeatures);
    
    if (navIssues.length === 0 && missing.length === 0) {
      console.log(`✅ ${config.name} (${filename}): All checks passed`);
    } else {
      console.log(`⚠️  ${config.name} (${filename}):`);
      navIssues.forEach(issue => {
        console.log(`   - ${issue}`);
        allIssues.push(`${config.name}: ${issue}`);
      });
      missing.forEach(feature => {
        console.log(`   - Missing: ${feature}`);
        allIssues.push(`${config.name}: Missing ${feature}`);
      });
    }
  }
  
  console.log('');
  
  // 2. Check data freshness
  console.log('📊 DATA FRESHNESS');
  console.log('───────────────────────────────────────');
  
  const dataIssues = auditData();
  if (dataIssues.length === 0) {
    console.log('✅ All data files up to date');
  } else {
    dataIssues.forEach(issue => {
      console.log(`⚠️  ${issue}`);
      allIssues.push(issue);
    });
  }
  
  console.log('');
  
  // 3. Run model review
  console.log('🤖 MODEL ANALYSIS');
  console.log('───────────────────────────────────────');
  
  try {
    const modelReviewOutput = execSync('node scripts/model-review.js 2>&1', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 60000,
    });
    console.log(modelReviewOutput);
    
    // Check for proposals
    if (modelReviewOutput.includes('PROPOSED WEIGHT ADJUSTMENTS')) {
      recommendations.push('Review and approve/reject pending model weight proposals');
    }
  } catch (error) {
    console.log(`⚠️  Model review failed: ${error.message}`);
    allIssues.push('Model review script failed');
  }
  
  // 4. Generate recommendations
  console.log('');
  console.log('💡 RECOMMENDATIONS');
  console.log('───────────────────────────────────────');
  
  // Add context-specific recommendations
  if (allIssues.some(i => i.includes('nav link'))) {
    recommendations.push('Update navigation links to ensure consistency across all pages');
  }
  
  if (allIssues.some(i => i.includes('results-history'))) {
    recommendations.push('Set up auto-record cron job: 0 23 * * * node scripts/auto-record.js');
  }
  
  if (allIssues.some(i => i.includes('btts-data.json'))) {
    recommendations.push('Verify daily data fetch cron job is running');
  }
  
  // Check filter alignment
  const indexContent = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
  const accuracyContent = fs.readFileSync(path.join(PROJECT_ROOT, 'accuracy.html'), 'utf8');
  
  const indexTopN = indexContent.match(/Show: Top \d+/g) || [];
  const accuracyTopN = accuracyContent.match(/Show: Top \d+/g) || [];
  
  if (indexTopN.join(',') !== accuracyTopN.join(',')) {
    recommendations.push('Align Top N filter options between Predictions and Accuracy pages');
  }
  
  if (recommendations.length === 0) {
    console.log('✅ No action items - everything looks good!');
  } else {
    recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });
  }
  
  // 5. Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Pages audited: ${Object.keys(PAGES).length}`);
  console.log(`Issues found: ${allIssues.length}`);
  console.log(`Recommendations: ${recommendations.length}`);
  console.log('');
  
  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    issues: allIssues,
    recommendations,
    pagesAudited: Object.keys(PAGES),
  };
  
  const reportsDir = path.join(DATA_DIR, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const reportFile = path.join(reportsDir, `weekly-review-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`📝 Report saved to: ${reportFile}`);
  
  return report;
}

// CLI
const args = process.argv.slice(2);
if (args[0] === 'help' || args[0] === '--help') {
  console.log(`
BTTS Tracker - Weekly Review

Runs comprehensive review of:
- All pages (navigation, features, consistency)
- Data freshness
- Model analysis and proposals
- Generates recommendations

Usage:
  node scripts/weekly-review.js          Run full review
  node scripts/weekly-review.js --help   Show this help

Cron setup (Thursday 10am):
  0 10 * * 4 cd ~/projects/btts-tracker && node scripts/weekly-review.js
  `);
} else {
  runWeeklyReview();
}
