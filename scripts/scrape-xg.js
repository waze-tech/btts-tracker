/**
 * BTTS Tracker - xG Data Scraper
 * 
 * Scrapes real xG data from Understat for EFL Championship teams.
 * Run weekly to keep data fresh.
 * 
 * Usage: node scripts/scrape-xg.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const XG_FILE = path.join(DATA_DIR, 'xg-data.json');

// FBref has xG data for Championship, League One, and League Two
const FBREF_BASE = 'https://fbref.com/en/comps';

// Team name mapping: Understat name -> Our name
const TEAM_MAP = {
  'Leeds': 'Leeds United',
  'Sheffield United': 'Sheffield United',
  'Burnley': 'Burnley',
  'Sunderland': 'Sunderland',
  'Norwich': 'Norwich City',
  'West Brom': 'West Bromwich Albion',
  'Middlesbrough': 'Middlesbrough',
  'Coventry': 'Coventry City',
  'Bristol City': 'Bristol City',
  'Watford': 'Watford',
  'Blackburn': 'Blackburn Rovers',
  'Hull': 'Hull City',
  'Millwall': 'Millwall',
  'Sheffield Wednesday': 'Sheffield Wednesday',
  'Preston': 'Preston North End',
  'Stoke': 'Stoke City',
  'QPR': 'QPR',
  'Swansea': 'Swansea City',
  'Derby': 'Derby County',
  'Luton': 'Luton Town',
  'Cardiff': 'Cardiff City',
  'Portsmouth': 'Portsmouth',
  'Plymouth': 'Plymouth Argyle',
  'Oxford United': 'Oxford United',
};

/**
 * Fetch and parse xG data from FBref
 * FBref has xG data for Championship, League One, and League Two
 */
async function scrapeFBref(leagueId, leagueName) {
  const url = `${FBREF_BASE}/${leagueId}/stats/${leagueName.replace(/ /g, '-')}-Stats`;
  console.log(`📊 Fetching xG data from FBref for ${leagueName}...`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const xgData = {};
    
    // FBref format: look for the squad stats table
    // The table has teams with xG and xGA in specific columns
    
    // Find all table rows with team stats
    // Pattern: <tr><th data-stat="team"><a href="...">Team Name</a></th>...<td data-stat="xg">X.XX</td>...<td data-stat="xg_against">X.XX</td>
    
    const teamRegex = /<tr[^>]*>[\s\S]*?<th[^>]*data-stat="team"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<td[^>]*data-stat="games"[^>]*>(\d+)<[\s\S]*?<td[^>]*data-stat="xg"[^>]*>([0-9.]+)<[\s\S]*?<td[^>]*data-stat="xg_against"[^>]*>([0-9.]+)</g;
    
    let match;
    while ((match = teamRegex.exec(html)) !== null) {
      const teamName = TEAM_MAP[match[1].trim()] || match[1].trim();
      const gamesPlayed = parseInt(match[2]);
      const totalXG = parseFloat(match[3]);
      const totalXGA = parseFloat(match[4]);
      
      if (gamesPlayed > 0) {
        xgData[teamName] = {
          source: 'fbref',
          league: leagueName,
          gamesPlayed,
          xG: parseFloat((totalXG / gamesPlayed).toFixed(2)),
          xGA: parseFloat((totalXGA / gamesPlayed).toFixed(2)),
          // FBref doesn't split by home/away easily, estimate
          xGHome: parseFloat(((totalXG / gamesPlayed) * 1.08).toFixed(2)),
          xGAway: parseFloat(((totalXG / gamesPlayed) * 0.92).toFixed(2)),
          xGAHome: parseFloat(((totalXGA / gamesPlayed) * 0.94).toFixed(2)),
          xGAAway: parseFloat(((totalXGA / gamesPlayed) * 1.06).toFixed(2)),
          lastUpdated: new Date().toISOString(),
        };
      }
    }
    
    return xgData;
    
  } catch (error) {
    console.error(`❌ Error scraping FBref for ${leagueName}: ${error.message}`);
    return {};
  }
}

/**
 * Scrape xG from FBref for League One/Two (Understat doesn't cover these)
 * FBref has xG for lower leagues
 */
async function scrapeFBrefLeague(leagueUrl, leagueName) {
  console.log(`📊 Fetching xG data from FBref for ${leagueName}...`);
  
  try {
    const response = await fetch(leagueUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // FBref uses HTML tables - parse team stats table
    // This is a simplified parser - FBref tables can be complex
    const xgData = {};
    
    // Look for the stats table with xG data
    // Format varies but typically: Team, MP, W, D, L, GF, GA, xG, xGA
    const tableMatch = html.match(/<table[^>]*id="results[^"]*overall"[^>]*>[\s\S]*?<\/table>/i);
    
    if (!tableMatch) {
      console.log(`⚠️  Could not find stats table for ${leagueName}`);
      return {};
    }
    
    // Extract rows
    const rowMatches = tableMatch[0].matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    
    for (const rowMatch of rowMatches) {
      const row = rowMatch[0];
      
      // Get team name
      const teamMatch = row.match(/<a[^>]*>([^<]+)<\/a>/);
      if (!teamMatch) continue;
      
      const teamName = teamMatch[1].trim();
      
      // Get xG and xGA values (data-stat attributes)
      const xgMatch = row.match(/data-stat="xg"[^>]*>([0-9.]+)/);
      const xgaMatch = row.match(/data-stat="xg_against"[^>]*>([0-9.]+)/);
      const mpMatch = row.match(/data-stat="games"[^>]*>([0-9]+)/);
      
      if (xgMatch && xgaMatch && mpMatch) {
        const mp = parseInt(mpMatch[1]);
        xgData[teamName] = {
          source: 'fbref',
          league: leagueName,
          gamesPlayed: mp,
          xG: parseFloat((parseFloat(xgMatch[1]) / mp).toFixed(2)),
          xGA: parseFloat((parseFloat(xgaMatch[1]) / mp).toFixed(2)),
          lastUpdated: new Date().toISOString(),
        };
      }
    }
    
    return xgData;
    
  } catch (error) {
    console.error(`❌ Error scraping FBref: ${error.message}`);
    return {};
  }
}

/**
 * Generate estimated xG for teams without data
 * Uses attack/defense strength from existing TEAM_STATS
 */
function generateEstimatedXG(teamStats) {
  if (!teamStats) return null;
  
  return {
    source: 'estimated',
    xG: parseFloat((teamStats.avgGoalsScored * 0.95).toFixed(2)),
    xGA: parseFloat((teamStats.avgGoalsConceded * 1.02).toFixed(2)),
    xGHome: parseFloat((teamStats.home?.scored * 0.94 || teamStats.avgGoalsScored * 0.95).toFixed(2)),
    xGAway: parseFloat((teamStats.away?.scored * 0.96 || teamStats.avgGoalsScored * 0.90).toFixed(2)),
    xGAHome: parseFloat((teamStats.home?.conceded * 1.01 || teamStats.avgGoalsConceded * 0.95).toFixed(2)),
    xGAAway: parseFloat((teamStats.away?.conceded * 1.03 || teamStats.avgGoalsConceded * 1.05).toFixed(2)),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Main function - scrape all leagues and save
 */
async function scrapeAllXG() {
  console.log('🎯 BTTS Tracker - xG Data Scraper\n');
  console.log('═══════════════════════════════════════════\n');
  
  const allXG = {
    scrapedAt: new Date().toISOString(),
    teams: {},
  };
  
  // Scrape from FBref (has all EFL leagues)
  // League IDs: Championship=10, League One=15, League Two=16
  const leagues = [
    { id: '10', name: 'Championship' },
    { id: '15', name: 'League-One' },
    { id: '16', name: 'League-Two' },
  ];
  
  for (const league of leagues) {
    // Add delay between requests to avoid rate limiting
    if (Object.keys(allXG.teams).length > 0) {
      console.log('⏳ Waiting 2s to avoid rate limiting...');
      await new Promise(r => setTimeout(r, 2000));
    }
    
    const leagueXG = await scrapeFBref(league.id, league.name);
    const count = Object.keys(leagueXG).length;
    
    if (count > 0) {
      Object.assign(allXG.teams, leagueXG);
      console.log(`✅ ${league.name}: ${count} teams\n`);
    } else {
      console.log(`⚠️  ${league.name}: No data found (may need different parsing)\n`);
    }
  }
  
  // Save data
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  fs.writeFileSync(XG_FILE, JSON.stringify(allXG, null, 2));
  
  console.log('═══════════════════════════════════════════');
  console.log(`💾 Saved xG data to ${XG_FILE}`);
  console.log(`📊 Total teams with real xG: ${Object.keys(allXG.teams).length}`);
  
  // Show sample
  if (Object.keys(allXG.teams).length > 0) {
    console.log('\n📋 Sample data:');
    const sample = Object.entries(allXG.teams).slice(0, 5);
    sample.forEach(([team, data]) => {
      console.log(`  ${team}: xG ${data.xG} | xGA ${data.xGA}`);
    });
  }
  
  return allXG;
}

// Run if called directly
scrapeAllXG();

export { scrapeAllXG, generateEstimatedXG };
