/**
 * BTTS Data Fetcher
 * Fetches fixtures and odds from The Odds API
 * Fetches historical stats from API-Football
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

// API Keys (set these in your environment)
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

// Sport keys for The Odds API
const LEAGUES = [
  { key: 'soccer_efl_champ', name: 'Championship', apiFootballId: 40 },
  { key: 'soccer_england_league1', name: 'League One', apiFootballId: 41 },
  { key: 'soccer_england_league2', name: 'League Two', apiFootballId: 42 },
];

/**
 * Fetch BTTS odds from The Odds API
 */
async function fetchBTTSOdds(sportKey) {
  if (!ODDS_API_KEY) {
    console.log(`⚠️  No ODDS_API_KEY set, using mock data for ${sportKey}`);
    return null;
  }

  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds`;
  const params = {
    apiKey: ODDS_API_KEY,
    regions: 'uk',
    markets: 'btts',
    oddsFormat: 'decimal',
  };

  try {
    const response = await axios.get(url, { params });
    console.log(`✅ Fetched ${response.data.length} fixtures from ${sportKey}`);
    console.log(`   Remaining requests: ${response.headers['x-requests-remaining']}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error fetching ${sportKey}:`, error.message);
    return null;
  }
}

/**
 * Fetch team stats from API-Football for BTTS analysis
 */
async function fetchTeamStats(leagueId, season = 2025) {
  if (!API_FOOTBALL_KEY) {
    console.log(`⚠️  No API_FOOTBALL_KEY set, using mock data for league ${leagueId}`);
    return null;
  }

  const url = 'https://v3.football.api-sports.io/teams/statistics';
  
  // Get teams first
  const teamsUrl = 'https://v3.football.api-sports.io/teams';
  
  try {
    const teamsResponse = await axios.get(teamsUrl, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      params: { league: leagueId, season }
    });
    
    console.log(`✅ Fetched ${teamsResponse.data.response.length} teams from league ${leagueId}`);
    return teamsResponse.data.response;
  } catch (error) {
    console.error(`❌ Error fetching teams for league ${leagueId}:`, error.message);
    return null;
  }
}

/**
 * Fetch recent fixtures with scores for historical analysis
 */
async function fetchRecentFixtures(leagueId, season = 2025) {
  if (!API_FOOTBALL_KEY) {
    return null;
  }

  const url = 'https://v3.football.api-sports.io/fixtures';
  
  try {
    const response = await axios.get(url, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      params: { 
        league: leagueId, 
        season,
        last: 50  // Last 50 fixtures
      }
    });
    
    console.log(`✅ Fetched ${response.data.response.length} recent fixtures from league ${leagueId}`);
    return response.data.response;
  } catch (error) {
    console.error(`❌ Error fetching fixtures for league ${leagueId}:`, error.message);
    return null;
  }
}

/**
 * Calculate BTTS probability from historical data
 */
function calculateBTTSProbability(teamFixtures) {
  if (!teamFixtures || teamFixtures.length === 0) return 0.5;
  
  let bttsCount = 0;
  teamFixtures.forEach(fixture => {
    const homeGoals = fixture.goals?.home || 0;
    const awayGoals = fixture.goals?.away || 0;
    if (homeGoals > 0 && awayGoals > 0) {
      bttsCount++;
    }
  });
  
  return bttsCount / teamFixtures.length;
}

/**
 * Generate mock data for testing without API keys
 */
function generateMockData() {
  const teams = {
    'Championship': [
      'Leeds United', 'Sheffield United', 'Burnley', 'Sunderland', 'West Bromwich Albion',
      'Middlesbrough', 'Norwich City', 'Coventry City', 'Bristol City', 'Hull City',
      'Blackburn Rovers', 'Stoke City', 'Watford', 'Millwall', 'Swansea City'
    ],
    'League One': [
      'Birmingham City', 'Wrexham', 'Huddersfield Town', 'Reading', 'Bolton Wanderers',
      'Barnsley', 'Leyton Orient', 'Charlton Athletic', 'Peterborough United', 'Lincoln City'
    ],
    'League Two': [
      'Stockport County', 'Doncaster Rovers', 'MK Dons', 'Chesterfield', 'Crewe Alexandra',
      'Notts County', 'Walsall', 'Gillingham', 'Bradford City', 'Accrington Stanley'
    ]
  };

  const fixtures = [];
  
  Object.entries(teams).forEach(([league, teamList]) => {
    // Generate 5 fixtures per league
    for (let i = 0; i < 5; i++) {
      const homeIdx = (i * 2) % teamList.length;
      const awayIdx = (i * 2 + 1) % teamList.length;
      
      const homeTeam = teamList[homeIdx];
      const awayTeam = teamList[awayIdx];
      
      // Generate realistic BTTS odds (typically 1.60 - 2.20)
      const bttsYesOdds = (1.6 + Math.random() * 0.6).toFixed(2);
      const bttsNoOdds = (1.8 + Math.random() * 0.4).toFixed(2);
      
      // Generate historical BTTS rates (50-80%)
      const homeBttsRate = 0.5 + Math.random() * 0.3;
      const awayBttsRate = 0.5 + Math.random() * 0.3;
      
      // Calculate combined probability
      const combinedProb = (homeBttsRate + awayBttsRate) / 2;
      
      // Generate mock recent form
      const homeRecentScored = Math.floor(3 + Math.random() * 3);
      const awayRecentScored = Math.floor(3 + Math.random() * 3);
      const homeRecentConceded = Math.floor(2 + Math.random() * 4);
      const awayRecentConceded = Math.floor(2 + Math.random() * 4);
      
      fixtures.push({
        id: `${league.toLowerCase().replace(' ', '-')}-${i}`,
        league,
        homeTeam,
        awayTeam,
        commenceTime: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
        btts: {
          yes: { odds: parseFloat(bttsYesOdds), bookmaker: 'Paddy Power' },
          no: { odds: parseFloat(bttsNoOdds), bookmaker: 'Paddy Power' },
        },
        stats: {
          home: {
            bttsRate: homeBttsRate,
            recentScored: homeRecentScored,
            recentConceded: homeRecentConceded,
            lastBttsGame: Math.floor(Math.random() * 3) + 1,
            gamesAnalyzed: 10,
          },
          away: {
            bttsRate: awayBttsRate,
            recentScored: awayRecentScored,
            recentConceded: awayRecentConceded,
            lastBttsGame: Math.floor(Math.random() * 3) + 1,
            gamesAnalyzed: 10,
          },
        },
        probability: combinedProb,
        impliedProbFromOdds: 1 / parseFloat(bttsYesOdds),
        valueRating: combinedProb - (1 / parseFloat(bttsYesOdds)),
      });
    }
  });
  
  // Sort by probability descending
  fixtures.sort((a, b) => b.probability - a.probability);
  
  return {
    fetchedAt: new Date().toISOString(),
    source: 'mock',
    fixtures,
  };
}

/**
 * Main function
 */
async function main() {
  console.log('🏈 BTTS Tracker - Fetching data...\n');
  
  let allData = {
    fetchedAt: new Date().toISOString(),
    fixtures: [],
  };
  
  if (!ODDS_API_KEY && !API_FOOTBALL_KEY) {
    console.log('⚠️  No API keys set. Generating mock data for demo...\n');
    allData = generateMockData();
  } else {
    // Fetch real data
    for (const league of LEAGUES) {
      console.log(`\n📊 Fetching ${league.name}...`);
      
      const odds = await fetchBTTSOdds(league.key);
      const fixtures = await fetchRecentFixtures(league.apiFootballId);
      
      // Process and combine data
      if (odds) {
        odds.forEach(event => {
          const bttsMarket = event.bookmakers?.[0]?.markets?.find(m => m.key === 'btts');
          if (bttsMarket) {
            const yesOdds = bttsMarket.outcomes.find(o => o.name === 'Yes')?.price;
            const noOdds = bttsMarket.outcomes.find(o => o.name === 'No')?.price;
            
            allData.fixtures.push({
              id: event.id,
              league: league.name,
              homeTeam: event.home_team,
              awayTeam: event.away_team,
              commenceTime: event.commence_time,
              btts: {
                yes: { odds: yesOdds, bookmaker: event.bookmakers[0].title },
                no: { odds: noOdds, bookmaker: event.bookmakers[0].title },
              },
              probability: 0.5, // Will be calculated from historical data
              impliedProbFromOdds: yesOdds ? 1 / yesOdds : 0,
            });
          }
        });
      }
    }
    
    // Sort by implied probability
    allData.fixtures.sort((a, b) => b.impliedProbFromOdds - a.impliedProbFromOdds);
  }
  
  // Save data
  const outputPath = path.join(DATA_DIR, 'btts-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(allData, null, 2));
  console.log(`\n💾 Data saved to ${outputPath}`);
  console.log(`📈 Total fixtures: ${allData.fixtures.length}`);
}

main().catch(console.error);
