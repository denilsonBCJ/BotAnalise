<<<<<<< HEAD
# FaucetPay Crash Bot

A bot that monitors the FaucetPay Crash game (https://faucetpay.io/play/crash), displays the last 10 rounds and current crash multiplier, saves historical data, and calculates the probability of crash ≥ 2x after collecting 100 rounds.

## Features

- 🎮 **Monitors FaucetPay Crash game** in real-time
- 📊 **Displays last 10 rounds** with multipliers and usernames
- 🎯 **Shows current crash** multiplier with visual indicator (🔥 for ≥2x)
- 💾 **Saves all rounds** to local JSON file (persists across restarts)
- 📈 **Calculates probability** of crash ≥ 2x after 100 rounds collected
- 📉 **Shows distribution** of multipliers across ranges
- ⚡ **Runs headless** (no visible browser window)

## Installation

```bash
cd faucetpay-crash-bot
npm install
```

## Usage

```bash
# Run the bot
node bot.js

# Stop with Ctrl+C
```

## How It Works

1. The bot launches a headless Chromium browser
2. Navigates to https://faucetpay.io/play/crash
3. Scrapes the crash history table every 8 seconds
4. Parses multipliers from elements with class `.crash-row-enter`
5. Stores unique rounds in `crash-data.json`
6. After 100 rounds, calculates and displays probability

## Output Example

```
╔══════════════════════════════════════════════════════════════╗
║                    🎮 CRASH BOT STATS                         ║
╠══════════════════════════════════════════════════════════════╣
║  Total rounds recorded:  110                                  ║
╠══════════════════════════════════════════════════════════════╣
║  📋 Last 10 Rounds:                                           ║
║  🔥 1. bezik              6.38x  22:11:48  ║
║  🔥 2. jafar              4.42x  22:11:40  ║
║  🔥 3. pimte              3.65x  22:11:40  ║
║     ...
╠══════════════════════════════════════════════════════════════╣
║  🎯 Current Crash:    6.38x by bezik           🔥 ABOVE 2x!   ║
╠══════════════════════════════════════════════════════════════╣
║  📈 PROBABILITY ANALYSIS (Last 100)                           ║
╠══════════════════════════════════════════════════════════════╣
║  Rounds >= 2x:  67/100                                            ║
║  Probability of crash >= 2x next round:  67.00%               ║
║  Average multiplier:    2.40x                                     ║
║  Max multiplier:    9.70x                                     ║
║  Min multiplier:    1.06x                                     ║
╠══════════════════════════════════════════════════════════════╣
║  Distribution:                                                ║
║    1.00-1.50: 24% ████████████████████║
║    1.50-2.00:  9% █████████           ║
║    2.00-3.00: 42% ████████████████████║
║    3.00-5.00: 23% ████████████████████║
║    5.00-10.00:  2% ██                  ║
║    10.00+:  0%                     ║
╚══════════════════════════════════════════════════════════════╝
```

## Data Storage

All rounds are saved to `crash-data.json` with this structure:

```json
[
  {
    "id": 1700000000000.123,
    "timestamp": "2026-11-02T22:11:48.000Z",
    "username": "bezik",
    "multiplier": 6.38,
    "cashedOut": true
  }
]
```

## Requirements

- Node.js 18+
- Chromium browser (system installed at `/usr/bin/chromium`)

## Notes

- The bot works **without login** - it reads public crash history
- Runs headless by default for server deployment
- Adjust scrape interval in `bot.js` (default: 8 seconds)
- Maximum 1000 rounds stored to prevent file growth

## Disclaimer

This bot is for educational/monitoring purposes only. Gambling involves risk. Past results don't guarantee future outcomes. The probability calculation is based on historical frequency, not a prediction model.
=======
# Bot_Analise_Faucet_Pay_Crash
>>>>>>> ba0ac13162b3826f6cf08ac999e630722c62c4a9
