import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('./data');
const PICKS_FILE = path.join(DATA_DIR, 'user-picks.json');
const RESULTS_FILE = path.join(DATA_DIR, 'results-history.json');

function loadPicks() {
  try {
    if (fs.existsSync(PICKS_FILE)) {
      return JSON.parse(fs.readFileSync(PICKS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { picks: [], stats: {}, modelAccuracy: {}, lastUpdated: null };
}

function savePicks(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PICKS_FILE, JSON.stringify(data, null, 2));
}

function calculateStats(picks) {
  const settled = picks.filter(p => p.status !== 'pending');
  const won = picks.filter(p => p.status === 'won');
  const pending = picks.filter(p => p.status === 'pending');
  const totalStaked = settled.reduce((sum, p) => sum + (p.stake || 0), 0);
  const totalReturns = won.reduce((sum, p) => sum + ((p.stake || 0) * (p.combinedOdds || p.odds || 0)), 0);
  return {
    totalPicks: picks.length,
    won: won.length,
    lost: picks.filter(p => p.status === 'lost').length,
    pending: pending.length,
    totalStaked,
    totalReturns,
    roi: totalStaked > 0 ? ((totalReturns - totalStaked) / totalStaked * 100).toFixed(1) : 0,
    winRate: settled.length > 0 ? (won.length / settled.length * 100).toFixed(1) : 0
  };
}

export default defineConfig({
  server: {
    host: true,
    allowedHosts: ['.trycloudflare.com'],
  },
  plugins: [{
    name: 'api-middleware',
    configureServer(server) {
      // Serve data files
      server.middlewares.use('/data', (req, res, next) => {
        const filename = req.url.replace(/^\//, '').split('?')[0];
        const filepath = path.join(DATA_DIR, filename);
        
        if (fs.existsSync(filepath)) {
          res.setHeader('Content-Type', 'application/json');
          res.end(fs.readFileSync(filepath, 'utf8'));
          return;
        }
        next();
      });
      
      server.middlewares.use('/api/picks', async (req, res, next) => {
        res.setHeader('Content-Type', 'application/json');
        
        if (req.method === 'GET') {
          const data = loadPicks();
          res.end(JSON.stringify(data));
          return;
        }
        
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const pick = JSON.parse(body);
              const data = loadPicks();
              const newPick = {
                id: Date.now(),
                ...pick,
                pickedAt: new Date().toISOString(),
                status: 'pending'
              };
              data.picks.push(newPick);
              data.stats = calculateStats(data.picks);
              savePicks(data);
              console.log(`📌 Pick saved: ${pick.selections?.length || 1} selections`);
              res.end(JSON.stringify({ success: true, pick: newPick, stats: data.stats }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }
        
        if (req.method === 'DELETE') {
          const data = { picks: [], stats: {}, modelAccuracy: {}, lastUpdated: new Date().toISOString() };
          savePicks(data);
          res.end(JSON.stringify({ success: true }));
          return;
        }
        
        next();
      });
    }
  }]
});
