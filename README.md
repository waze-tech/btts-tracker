# ⚽ BTTS Tracker

Advanced **Both Teams To Score** probability tracker for English Football League (EFL):
- **Championship**
- **League One**
- **League Two**

![BTTS Tracker Screenshot](https://via.placeholder.com/800x400?text=BTTS+Tracker)

## 🎯 Features

### Predictions Dashboard
- Real-time fixture data from The Odds API
- 4-model probability system (xG Poisson, Historic BTTS, Scoring Patterns, Form)
- Confidence scores and data quality indicators
- Value bet detection (when live odds available)
- **Filters:** League, Date Range, Top N, Kick-off Time, Custom Date Picker

### Accumulator Betslip
- Add multiple selections to a floating betslip
- Combined odds calculation
- Stake presets (£1, £5, £10)
- Save accumulators to My Picks

### Accuracy Dashboard
- Track model accuracy over time
- Top 3 / Top 6 / Top 9 / Overall accuracy
- Breakdown by probability band and league
- Weekly accuracy trends chart
- Filterable by league and Top N

### My Picks
- Track all betting selections
- P&L tracking with weekly chart
- Win rate statistics
- Personalized recommendations (after 5+ picks)
- Supports both single bets and accumulators

### Model History
- Current version and weights display
- Pending proposals for model changes
- Full changelog with approval badges
- Human-in-the-loop approval workflow

### How It Works
- Complete methodology documentation
- xG Poisson calculation explained
- Confidence and value detection logic
- Data sources and update frequencies

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Fetch latest fixture data
npm run fetch

# Start development server
npm run dev
```

## 📊 Model Overview

| Component | Weight | Description |
|-----------|--------|-------------|
| **xG Poisson** | 45% | Expected Goals model with Poisson distribution |
| **Historic BTTS** | 25% | Team-specific BTTS rates (home/away splits) |
| **Scoring Patterns** | 15% | Failed-to-score and clean sheet rates |
| **Recent Form** | 15% | Last 5 games (exponentially weighted) |

## 🔧 Scripts

| Script | Purpose |
|--------|---------|
| `npm run fetch` | Fetch latest fixtures from The Odds API |
| `node scripts/auto-record.js` | Record results after matches complete |
| `node scripts/model-review.js` | Analyze model accuracy and propose changes |
| `node scripts/weekly-review.js` | Full audit (pages, data, model) |
| `node scripts/scrape-xg.js` | Scrape xG data from FBref |

## ⏰ Cron Jobs

Install with: `crontab crontab.txt`

| Schedule | Task |
|----------|------|
| 6am daily | Fetch fixture data |
| 11pm daily | Record match results |
| Thursday 10am | Weekly review + model analysis |

## 📁 Project Structure

```
btts-tracker/
├── index.html           # Predictions dashboard
├── accuracy.html        # Accuracy tracking
├── my-picks.html        # Personal pick tracker
├── model-history.html   # Model changelog
├── how-it-works.html    # Documentation
├── src/
│   └── main.js          # Frontend logic
├── scripts/
│   ├── fetch-data.js    # API data fetching
│   ├── auto-record.js   # Results recording
│   ├── model-review.js  # Model analysis
│   ├── weekly-review.js # Full audit
│   └── scrape-xg.js     # xG scraping
├── data/                # Generated data (gitignored)
│   ├── btts-data.json   # Current fixtures
│   ├── results-history.json
│   └── model-changelog.json
└── logs/                # Cron logs (gitignored)
```

## 🔑 API Keys

Requires [The Odds API](https://the-odds-api.com/) key:
- Free tier: 500 requests/month, h2h market only
- Paid tier ($20/mo): BTTS market with real bookmaker odds

Set in `~/.zshrc`:
```bash
export ODDS_API_KEY="your_key_here"
```

## 📈 Current Accuracy (96 predictions)

| Metric | Accuracy |
|--------|----------|
| **Overall** | 59.4% |
| **Top 3** | 54.2% |
| **Top 6** | 58.3% |
| **Top 9** | 61.1% |
| **High Prob (65%+)** | 60.5% |
| **Value Bets** | +18.9% ROI |

## 🛣️ Roadmap

- [ ] Real BTTS odds (paid API tier)
- [ ] Head-to-head historical data
- [ ] More xG data coverage
- [ ] Telegram alerts for high-value picks
- [ ] Mobile-responsive improvements

## 📝 License

MIT

---

Built with ❤️ for football data nerds
