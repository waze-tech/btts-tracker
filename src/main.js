/**
 * BTTS Tracker - Advanced Frontend
 * Displays comprehensive BTTS probability analysis
 */

// Load data from the data folder
async function loadData() {
  try {
    const response = await fetch('/btts-data.json');
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.log('Error loading data:', e);
  }
  
  // Show error state
  document.getElementById('fixturesGrid').innerHTML = `
    <div class="loading">
      <p>⚠️ No data found. Run <code>npm run fetch</code> to generate fixtures.</p>
    </div>
  `;
  return null;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) return `Today ${timeStr}`;
  if (isTomorrow) return `Tomorrow ${timeStr}`;
  
  return date.toLocaleDateString('en-GB', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short' 
  }) + ` ${timeStr}`;
}

function getProbabilityClass(prob) {
  if (prob >= 0.70) return 'high';
  if (prob >= 0.55) return 'medium';
  return 'low';
}

function getConfidenceClass(confidence) {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

function getLeagueClass(league) {
  return 'league-' + league.toLowerCase().replace(' ', '-');
}

function getLeagueColor(league) {
  const colors = {
    'Championship': '#8b5cf6',
    'League One': '#3b82f6',
    'League Two': '#14b8a6',
  };
  return colors[league] || '#22c55e';
}

function renderFormDots(form) {
  if (!form || form.length === 0) return '';
  return form.map((btts, i) => 
    `<span class="form-dot ${btts ? 'btts' : 'no-btts'}" title="Game ${i + 1}: ${btts ? 'BTTS' : 'No BTTS'}"></span>`
  ).join('');
}

function renderModelBreakdown(models) {
  if (!models) return '';
  
  return `
    <div class="model-breakdown">
      <div class="model-row">
        <span class="model-label">Poisson</span>
        <div class="model-bar">
          <div class="model-fill" style="width: ${models.poisson * 100}%"></div>
        </div>
        <span class="model-value">${(models.poisson * 100).toFixed(0)}%</span>
      </div>
      <div class="model-row">
        <span class="model-label">Historic</span>
        <div class="model-bar">
          <div class="model-fill" style="width: ${models.historic * 100}%"></div>
        </div>
        <span class="model-value">${(models.historic * 100).toFixed(0)}%</span>
      </div>
      <div class="model-row">
        <span class="model-label">Form</span>
        <div class="model-bar">
          <div class="model-fill" style="width: ${models.form * 100}%"></div>
        </div>
        <span class="model-value">${(models.form * 100).toFixed(0)}%</span>
      </div>
    </div>
  `;
}

function renderTeamStats(stats, isHome) {
  if (!stats) return '<span class="no-data">No historical data</span>';
  
  const location = isHome ? 'Home' : 'Away';
  
  return `
    <div class="team-detailed-stats">
      <div class="stat-row">
        <span class="stat-label">${location} BTTS Rate</span>
        <span class="stat-value ${stats.bttsRate >= 0.55 ? 'highlight-good' : stats.bttsRate <= 0.45 ? 'highlight-bad' : ''}">${(stats.bttsRate * 100).toFixed(0)}%</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Avg Scored</span>
        <span class="stat-value">${stats.avgScored.toFixed(2)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Avg Conceded</span>
        <span class="stat-value">${stats.avgConceded.toFixed(2)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Clean Sheet %</span>
        <span class="stat-value ${stats.cleanSheetRate >= 0.35 ? 'highlight-bad' : ''}">${(stats.cleanSheetRate * 100).toFixed(0)}%</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Failed to Score %</span>
        <span class="stat-value ${stats.failedToScoreRate >= 0.25 ? 'highlight-bad' : ''}">${(stats.failedToScoreRate * 100).toFixed(0)}%</span>
      </div>
      <div class="stat-row strength">
        <span class="stat-label">Attack Strength</span>
        <span class="stat-value ${stats.attackStrength >= 1.1 ? 'highlight-good' : stats.attackStrength <= 0.9 ? 'highlight-bad' : ''}">${stats.attackStrength.toFixed(2)}</span>
      </div>
      <div class="stat-row strength">
        <span class="stat-label">Defense Strength</span>
        <span class="stat-value ${stats.defenseStrength <= 0.9 ? 'highlight-good' : stats.defenseStrength >= 1.1 ? 'highlight-bad' : ''}">${stats.defenseStrength.toFixed(2)}</span>
      </div>
    </div>
  `;
}

function renderFixture(fixture, showRank = true) {
  const probClass = getProbabilityClass(fixture.probability);
  const confidenceClass = getConfidenceClass(fixture.confidence);
  const leagueClass = getLeagueClass(fixture.league);
  const valueClass = fixture.valueRating > 0 ? 'positive' : 'negative';
  const isTopPick = fixture.rank <= 3;
  const isValueBet = fixture.isValueBet;
  
  return `
    <div class="fixture-wrapper ${isTopPick ? 'top-pick' : ''}" data-fixture-id="${fixture.id}">
      ${showRank && fixture.rank <= 3 ? `<span class="rank-badge">${fixture.rank}</span>` : ''}
      ${isValueBet ? '<span class="value-badge">💎 VALUE</span>' : ''}
      <div class="fixture-card ${leagueClass}" style="--league-color: ${getLeagueColor(fixture.league)}">
        <div class="fixture-header">
          <span class="league-badge">${fixture.league}</span>
          <span class="kick-off">${formatDate(fixture.commenceTime)}</span>
        </div>
        
        <div class="teams">
          <div class="team home">
            <div class="team-name">${fixture.homeTeam}</div>
            <div class="team-location">HOME</div>
            <div class="historic-form" title="Last 5 games BTTS history">${renderFormDots(fixture.stats?.home?.form)}</div>
          </div>
          <div class="match-info">
            <div class="vs">VS</div>
            <div class="expected-goals" title="Expected Goals">
              <span class="xg-home">${fixture.expectedGoals?.home?.toFixed(1) || '-'}</span>
              <span class="xg-divider">-</span>
              <span class="xg-away">${fixture.expectedGoals?.away?.toFixed(1) || '-'}</span>
            </div>
            <div class="xg-label">xG</div>
          </div>
          <div class="team away">
            <div class="team-name">${fixture.awayTeam}</div>
            <div class="team-location">AWAY</div>
            <div class="historic-form" title="Last 5 games BTTS history">${renderFormDots(fixture.stats?.away?.form)}</div>
          </div>
        </div>
        
        <div class="probability-section">
          <div class="main-prob">
            <div class="prob-ring ${probClass}">
              <svg viewBox="0 0 36 36">
                <path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                <path class="ring-fill" stroke-dasharray="${fixture.probability * 100}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
              </svg>
              <div class="prob-center">
                <span class="prob-value">${(fixture.probability * 100).toFixed(0)}%</span>
                <span class="prob-label">BTTS</span>
              </div>
            </div>
          </div>
          
          <div class="prob-details">
            <div class="detail-box">
              <div class="detail-label">Best Odds</div>
              <div class="detail-value odds">${fixture.btts?.yes?.odds?.toFixed(2) || '-'}</div>
              <div class="detail-sub">${fixture.btts?.yes?.bookmaker || 'N/A'}</div>
            </div>
            <div class="detail-box">
              <div class="detail-label">Implied Prob</div>
              <div class="detail-value">${(fixture.impliedProbFromOdds * 100).toFixed(0)}%</div>
              <div class="detail-sub">from odds</div>
            </div>
            <div class="detail-box ${valueClass}">
              <div class="detail-label">Value</div>
              <div class="detail-value value">${fixture.valueRating > 0 ? '+' : ''}${(fixture.valueRating * 100).toFixed(1)}%</div>
              <div class="detail-sub">${fixture.valueRating > 0.03 ? '✓ Good value' : fixture.valueRating > 0 ? 'Fair' : 'Overpriced'}</div>
            </div>
            <div class="detail-box">
              <div class="detail-label">Confidence</div>
              <div class="detail-value confidence ${confidenceClass}">${(fixture.confidence * 100).toFixed(0)}%</div>
              <div class="detail-sub">data quality</div>
            </div>
          </div>
        </div>
        
        <div class="card-actions">
          <button class="expand-btn" onclick="toggleDetails('${fixture.id}')">
            <span class="expand-text">Show Analysis</span>
            <span class="expand-icon">▼</span>
          </button>
          <button class="add-to-slip" onclick="addToSlip('${fixture.id}')" id="slip-btn-${fixture.id}">
            + Add to Slip
          </button>
        </div>
        
        <div class="expanded-details" id="details-${fixture.id}">
          <div class="analysis-section">
            <h4>📊 Model Breakdown</h4>
            ${renderModelBreakdown(fixture.models)}
          </div>
          
          <div class="teams-analysis">
            <div class="team-analysis">
              <h4>${fixture.homeTeam} (Home)</h4>
              ${renderTeamStats(fixture.stats?.home, true)}
            </div>
            <div class="team-analysis">
              <h4>${fixture.awayTeam} (Away)</h4>
              ${renderTeamStats(fixture.stats?.away, false)}
            </div>
          </div>
          
          <div class="analysis-section">
            <h4>📈 Key Insights</h4>
            <ul class="insights">
              ${generateInsights(fixture).map(i => `<li>${i}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateInsights(fixture) {
  const insights = [];
  const home = fixture.stats?.home;
  const away = fixture.stats?.away;
  
  if (!home || !away) {
    insights.push('Limited historical data available for analysis');
    return insights;
  }
  
  // High combined BTTS rate
  const combinedBtts = (home.bttsRate + away.bttsRate) / 2;
  if (combinedBtts >= 0.55) {
    insights.push(`Both teams have high BTTS rates (${(combinedBtts * 100).toFixed(0)}% combined avg)`);
  }
  
  // Attack vs Defense mismatch
  if (home.attackStrength >= 1.15 && away.defenseStrength >= 1.05) {
    insights.push(`${fixture.homeTeam}'s strong attack (${home.attackStrength.toFixed(2)}) vs ${fixture.awayTeam}'s weak defense (${away.defenseStrength.toFixed(2)})`);
  }
  if (away.attackStrength >= 1.15 && home.defenseStrength >= 1.05) {
    insights.push(`${fixture.awayTeam}'s strong attack (${away.attackStrength.toFixed(2)}) vs ${fixture.homeTeam}'s weak defense (${home.defenseStrength.toFixed(2)})`);
  }
  
  // Low clean sheet rates
  if (home.cleanSheetRate <= 0.25 && away.cleanSheetRate <= 0.25) {
    insights.push('Both teams rarely keep clean sheets - goals expected at both ends');
  }
  
  // Low failed to score rates
  if (home.failedToScoreRate <= 0.15 && away.failedToScoreRate <= 0.20) {
    insights.push('Both teams consistently find the net - low blank rates');
  }
  
  // Recent form trend
  const homeFormBtts = home.form?.filter(x => x).length || 0;
  const awayFormBtts = away.form?.filter(x => x).length || 0;
  if (homeFormBtts >= 4 && awayFormBtts >= 4) {
    insights.push(`Hot streak: BTTS in ${homeFormBtts}/5 home games and ${awayFormBtts}/5 away games recently`);
  }
  
  // Expected goals insight
  if (fixture.expectedGoals?.total >= 2.8) {
    insights.push(`High expected goals (${fixture.expectedGoals.total.toFixed(2)} xG) suggests open game`);
  }
  
  // Value insight
  if (fixture.valueRating > 0.05) {
    insights.push(`📈 Strong value bet: ${((fixture.valueRating) * 100).toFixed(1)}% edge over bookmaker odds`);
  }
  
  if (insights.length === 0) {
    insights.push('Balanced fixture with moderate BTTS probability');
  }
  
  return insights.slice(0, 4); // Limit to 4 insights
}

function toggleDetails(fixtureId) {
  const details = document.getElementById(`details-${fixtureId}`);
  const btn = details.previousElementSibling;
  
  if (details.classList.contains('show')) {
    details.classList.remove('show');
    btn.classList.remove('expanded');
    btn.querySelector('.expand-text').textContent = 'Show Analysis';
  } else {
    details.classList.add('show');
    btn.classList.add('expanded');
    btn.querySelector('.expand-text').textContent = 'Hide Analysis';
  }
}

// Make toggleDetails available globally
window.toggleDetails = toggleDetails;

// Store current data for picking
let currentData = null;

// Betslip state
const SLIP_KEY = 'btts_betslip';
let betslip = [];

function loadBetslip() {
  const saved = localStorage.getItem(SLIP_KEY);
  betslip = saved ? JSON.parse(saved) : [];
  return betslip;
}

function saveBetslip() {
  localStorage.setItem(SLIP_KEY, JSON.stringify(betslip));
}

function addToSlip(fixtureId) {
  if (!currentData) return;
  
  const fixture = currentData.fixtures.find(f => f.id === fixtureId);
  if (!fixture) return;
  
  loadBetslip();
  
  // Check if already in slip
  if (betslip.find(s => s.fixtureId === fixtureId)) {
    // Remove from slip
    betslip = betslip.filter(s => s.fixtureId !== fixtureId);
    saveBetslip();
    updateSlipButton(fixtureId, false);
    renderBetslip();
    return;
  }
  
  // Add to slip
  betslip.push({
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    league: fixture.league,
    kickoff: fixture.commenceTime,
    probability: fixture.probability,
    odds: fixture.btts?.yes?.odds || (1 / fixture.probability * 0.92),
  });
  
  saveBetslip();
  updateSlipButton(fixtureId, true);
  renderBetslip();
  
  // Show betslip toggle
  document.getElementById('betslipToggle').style.display = 'flex';
}

function removeFromSlip(fixtureId) {
  loadBetslip();
  betslip = betslip.filter(s => s.fixtureId !== fixtureId);
  saveBetslip();
  updateSlipButton(fixtureId, false);
  renderBetslip();
}

function updateSlipButton(fixtureId, inSlip) {
  const btn = document.getElementById(`slip-btn-${fixtureId}`);
  if (btn) {
    if (inSlip) {
      btn.textContent = '✓ In Slip';
      btn.classList.add('added');
    } else {
      btn.textContent = '+ Add to Slip';
      btn.classList.remove('added');
    }
  }
}

function calculateAccumulatorOdds() {
  if (betslip.length === 0) return 0;
  return betslip.reduce((acc, s) => acc * s.odds, 1);
}

function renderBetslip() {
  loadBetslip();
  
  const content = document.getElementById('betslipContent');
  const footer = document.getElementById('betslipFooter');
  const countEl = document.getElementById('betslipCount');
  const toggle = document.getElementById('betslipToggle');
  
  countEl.textContent = betslip.length;
  
  if (betslip.length === 0) {
    toggle.style.display = 'none';
    document.getElementById('betslipPanel').classList.remove('open');
    content.innerHTML = `
      <div class="betslip-empty">
        <p>No selections yet</p>
        <p style="font-size: 0.85rem; margin-top: 0.5rem;">Click "Add to Slip" on any fixture</p>
      </div>
    `;
    footer.style.display = 'none';
    return;
  }
  
  toggle.style.display = 'flex';
  footer.style.display = 'block';
  
  const combinedOdds = calculateAccumulatorOdds();
  document.getElementById('slipSelections').textContent = betslip.length;
  document.getElementById('slipOdds').textContent = combinedOdds.toFixed(2);
  
  content.innerHTML = betslip.map(s => `
    <div class="betslip-item">
      <button class="remove" onclick="removeFromSlip('${s.fixtureId}')">✕</button>
      <div class="match">${s.homeTeam} vs ${s.awayTeam}</div>
      <div class="league">${s.league} • BTTS Yes</div>
      <div class="odds">@ ${s.odds.toFixed(2)}</div>
    </div>
  `).join('');
  
  updateReturns();
}

function updateReturns() {
  const stake = parseFloat(document.getElementById('stakeInput')?.value) || 0;
  const combinedOdds = calculateAccumulatorOdds();
  const returns = stake * combinedOdds;
  document.getElementById('slipReturns').textContent = `£${returns.toFixed(2)}`;
}

function placeBet() {
  loadBetslip();
  
  if (betslip.length === 0) return;
  
  const stake = parseFloat(document.getElementById('stakeInput')?.value) || 0;
  if (stake <= 0) {
    alert('Please enter a valid stake');
    return;
  }
  
  const combinedOdds = calculateAccumulatorOdds();
  const combinedProb = betslip.reduce((acc, s) => acc * s.probability, 1);
  
  // Save to My Picks
  const PICKS_KEY = 'btts_my_picks';
  const saved = localStorage.getItem(PICKS_KEY);
  const data = saved ? JSON.parse(saved) : { picks: [] };
  
  const accaPick = {
    id: Date.now(),
    type: 'accumulator',
    selections: betslip.map(s => ({
      fixtureId: s.fixtureId,
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      league: s.league,
      kickoff: s.kickoff,
      probability: s.probability,
      odds: s.odds,
    })),
    combinedOdds,
    combinedProbability: combinedProb,
    stake,
    potentialReturns: stake * combinedOdds,
    pickedAt: new Date().toISOString(),
    status: 'pending',
    result: null,
  };
  
  data.picks.push(accaPick);
  localStorage.setItem(PICKS_KEY, JSON.stringify(data));
  
  // Clear betslip
  betslip = [];
  saveBetslip();
  
  // Reset buttons
  accaPick.selections.forEach(s => updateSlipButton(s.fixtureId, false));
  
  // Close panel
  document.getElementById('betslipPanel').classList.remove('open');
  renderBetslip();
  
  // Confirmation
  const selectionsText = accaPick.selections.map(s => `${s.homeTeam} vs ${s.awayTeam}`).join('\n');
  alert(`Accumulator saved!\n\n${accaPick.selections.length} selections:\n${selectionsText}\n\nCombined odds: ${combinedOdds.toFixed(2)}\nStake: £${stake.toFixed(2)}\nPotential returns: £${(stake * combinedOdds).toFixed(2)}`);
}

// Update slip buttons on render
function updateSlipButtons() {
  loadBetslip();
  betslip.forEach(s => updateSlipButton(s.fixtureId, true));
}

// Make functions global
window.addToSlip = addToSlip;
window.removeFromSlip = removeFromSlip;
window.placeBet = placeBet;

function renderStats(data, filteredFixtures) {
  const fixtures = filteredFixtures || data.fixtures;
  const total = fixtures.length;
  const avgProb = fixtures.reduce((sum, f) => sum + f.probability, 0) / total;
  const valueBets = fixtures.filter(f => f.isValueBet).length;
  const highConfidence = fixtures.filter(f => f.confidence >= 0.8).length;
  
  document.getElementById('totalFixtures').textContent = total;
  document.getElementById('avgProbability').textContent = `${(avgProb * 100).toFixed(0)}%`;
  document.getElementById('highValue').textContent = valueBets;
  document.getElementById('highConfidence').textContent = highConfidence;
}

function filterByDate(fixtures, dateFilter) {
  if (dateFilter === 'all') return fixtures;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Get start of current week (Monday)
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekStart.getDate() + 7);
  
  // Next week
  const nextWeekStart = new Date(thisWeekEnd);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 7);
  
  return fixtures.filter(f => {
    const fixtureDate = new Date(f.commenceTime);
    const fixtureDateOnly = new Date(fixtureDate.getFullYear(), fixtureDate.getMonth(), fixtureDate.getDate());
    
    switch (dateFilter) {
      case 'today':
        return fixtureDateOnly.getTime() === today.getTime();
      case 'tomorrow':
        return fixtureDateOnly.getTime() === tomorrow.getTime();
      case 'week':
        return fixtureDate >= thisWeekStart && fixtureDate < thisWeekEnd;
      case 'next-week':
        return fixtureDate >= nextWeekStart && fixtureDate < nextWeekEnd;
      default:
        return true;
    }
  });
}

function renderFixtures(data, filter = 'all', sortBy = 'probability', topN = 'all', dateFilter = 'all') {
  const grid = document.getElementById('fixturesGrid');
  
  let filtered = data.fixtures;
  
  // Apply league filter
  if (filter !== 'all') {
    filtered = filtered.filter(f => f.league === filter);
  }
  
  // Apply date filter
  filtered = filterByDate(filtered, dateFilter);
  
  // Sort options
  if (sortBy === 'value') {
    filtered = [...filtered].sort((a, b) => b.valueRating - a.valueRating);
  } else if (sortBy === 'odds') {
    filtered = [...filtered].sort((a, b) => (b.btts?.yes?.odds || 0) - (a.btts?.yes?.odds || 0));
  } else if (sortBy === 'kickoff') {
    filtered = [...filtered].sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));
  }
  // Default is probability (already sorted)
  
  // Apply top N filter
  if (topN !== 'all') {
    const n = parseInt(topN);
    filtered = filtered.slice(0, n);
  }
  
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="loading"><p>No fixtures available for this filter</p></div>';
    return;
  }
  
  grid.innerHTML = filtered.map(f => renderFixture(f)).join('');
  renderStats(data, filtered);
  
  // Update slip buttons after rendering
  setTimeout(updateSlipButtons, 0);
}

function renderMethodology(data) {
  if (!data.methodology) return '';
  
  const container = document.getElementById('methodology');
  if (!container) return;
  
  container.innerHTML = `
    <h3>📐 Probability Methodology</h3>
    <p>${data.methodology.description}</p>
    <div class="methodology-models">
      ${data.methodology.models.map(m => `
        <div class="method-card">
          <div class="method-weight">${(m.weight * 100)}%</div>
          <div class="method-name">${m.name}</div>
          <div class="method-desc">${m.description}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// Initialize
async function init() {
  const data = await loadData();
  if (!data) return;
  
  // Update header stats
  const lastUpdated = document.getElementById('lastUpdated');
  const fetchedAt = new Date(data.fetchedAt);
  const sourceLabel = data.source === 'live' ? '🔴 Live Data' : data.source === 'historic' ? '📊 Historic Model' : '🎲 Demo Data';
  lastUpdated.textContent = `Last updated: ${fetchedAt.toLocaleString('en-GB')} • ${sourceLabel}`;
  
  // Store data for picking
  currentData = data;
  
  // Render methodology
  renderMethodology(data);
  
  // Render initial fixtures (default to Top 3)
  renderFixtures(data, 'all', 'probability', '3');
  
  // Helper to get current filter state
  const getFilterState = () => ({
    filter: document.querySelector('.filter-btn.active')?.dataset.filter || 'all',
    sort: document.getElementById('sortSelect')?.value || 'probability',
    topN: document.getElementById('topNSelect')?.value || 'all',
    dateFilter: document.getElementById('dateFilter')?.value || 'all',
  });
  
  // Set up filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const state = getFilterState();
      renderFixtures(data, btn.dataset.filter, state.sort, state.topN, state.dateFilter);
    });
  });
  
  // Set up sort select
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      const state = getFilterState();
      renderFixtures(data, state.filter, sortSelect.value, state.topN, state.dateFilter);
    });
  }
  
  // Set up top N select
  const topNSelect = document.getElementById('topNSelect');
  if (topNSelect) {
    topNSelect.addEventListener('change', () => {
      const state = getFilterState();
      renderFixtures(data, state.filter, state.sort, topNSelect.value, state.dateFilter);
    });
  }
  
  // Set up date filter select
  const dateFilter = document.getElementById('dateFilter');
  if (dateFilter) {
    dateFilter.addEventListener('change', () => {
      const state = getFilterState();
      renderFixtures(data, state.filter, state.sort, state.topN, dateFilter.value);
    });
  }
  
  // Set up betslip UI
  const betslipToggle = document.getElementById('betslipToggle');
  const betslipPanel = document.getElementById('betslipPanel');
  const betslipClose = document.getElementById('betslipClose');
  const stakeInput = document.getElementById('stakeInput');
  const placeBetBtn = document.getElementById('placeBetBtn');
  
  if (betslipToggle) {
    betslipToggle.addEventListener('click', () => {
      betslipPanel.classList.toggle('open');
    });
  }
  
  if (betslipClose) {
    betslipClose.addEventListener('click', () => {
      betslipPanel.classList.remove('open');
    });
  }
  
  if (stakeInput) {
    stakeInput.addEventListener('input', updateReturns);
  }
  
  if (placeBetBtn) {
    placeBetBtn.addEventListener('click', placeBet);
  }
  
  // Stake presets
  document.querySelectorAll('.stake-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('stakeInput').value = btn.dataset.stake;
      updateReturns();
    });
  });
  
  // Initial betslip render
  renderBetslip();
}

init();
