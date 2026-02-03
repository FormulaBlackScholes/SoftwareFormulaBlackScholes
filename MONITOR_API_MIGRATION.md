# What Happened to monitor-api.js?

## TL;DR
**`monitor-api.js` was deleted during Docker cleanup, but ALL its functionality is now integrated into the current system (`src/main.js` + `src/monitor-enhanced.js`).**

## The Old System (monitor-api.js)

### What it was:
A standalone script that ran independently to:
- Poll WordPress API for trading signals
- Extract signal parameters (strike, expiry, etc.)
- Set environment variables for Playwright
- Spawn `trade.spec.js` with those variables
- Mark signals as processed

### How it ran:
```bash
npm run monitor:api
# or
node monitor-api.js
```

### Why it was deleted:
During the Docker removal and repo cleanup, all Docker-related files and many standalone scripts were removed to simplify the system and eliminate Docker dependencies.

## The New System (Current)

### What replaced it:
- `src/main.js` - Main application server with API endpoints and web interface
- `src/monitor-enhanced.js` - Enhanced monitoring with all the signal processing logic
- `src/credential-manager.js` - Secure credential storage
- `src/database-watcher.js` - Alternative database monitoring (optional)

### How it runs:
```bash
npm start
# or
./start-monitor.sh
```

### What's better:
1. ✅ **Integrated System** - Everything in one place
2. ✅ **Web Interface** - Configure credentials at http://localhost:8080
3. ✅ **API Endpoints** - Control system via REST API
4. ✅ **Better Logging** - Console + file logging (logs/app.log)
5. ✅ **Credential Management** - Encrypted credential storage
6. ✅ **Health Monitoring** - Status endpoints and health checks
7. ✅ **Graceful Shutdown** - Proper cleanup on stop

## Functionality Comparison

### OLD (monitor-api.js)
```javascript
// Pseudo-code of what monitor-api.js did:
while (true) {
  signals = fetchFromAPI();
  for (signal of signals) {
    env = {
      SIGNAL_ID: signal.id,
      STRIKE_PRICE: signal.strike,
      EXPIRY_DATE: signal.expiry_date,
      // etc...
    };
    spawn('playwright test trade.spec.js', { env });
    markAsProcessed(signal.id);
  }
  sleep(30000);
}
```

### NEW (monitor-enhanced.js)
```javascript
// Current implementation (simplified):
class TradingMonitor {
  async pollForSignals() {
    const signals = await this.fetchFromAPI();
    for (const signal of signals) {
      await this.processSignal(signal);
    }
  }

  async processSignal(signal) {
    const action = this.determineAction(signal);
    const result = await this.executeTrade(action, signal);
    if (result.success) {
      await this.markAsProcessed(signal.id);
    }
  }

  async executeTrade(action, signal) {
    const env = {
      SIGNAL_ID: signal.id,
      STRIKE_PRICE: signal.strike,
      EXPIRY_DATE: signal.expiry_date,
      EXPIRY_TIME: signal.expiry_time,
      // ... all parameters
    };
    
    return spawn('playwright test', action.testFile, { env });
  }
}
```

**Same functionality, better implementation!**

## Signal Flow Comparison

### OLD Flow:
```
monitor-api.js (standalone)
  ↓
WordPress API
  ↓
Extract parameters
  ↓
Set env vars
  ↓
Spawn trade.spec.js
  ↓
Execute trade
  ↓
Mark as processed
```

### NEW Flow:
```
npm start → src/main.js
  ↓
Initialize TradingApplication
  ↓
Start TradingMonitor (monitor-enhanced.js)
  ↓
Poll WordPress API every 30s
  ↓
processSignal(signal)
  ↓
executeTrade(action, signal) with env vars
  ↓
Spawn trade.spec.js
  ↓
Execute trade
  ↓
Mark as processed via API
```

**Same flow, more robust!**

## Code Migration Map

| OLD Location (monitor-api.js) | NEW Location |
|-------------------------------|--------------|
| API polling | `src/monitor-enhanced.js:pollForSignals()` |
| Signal processing | `src/monitor-enhanced.js:processSignal()` |
| Environment variable setup | `src/monitor-enhanced.js:executeTrade()` |
| Playwright spawning | `src/monitor-enhanced.js:executeTrade()` |
| Credential handling | `src/credential-manager.js` |
| HTTP server | `src/main.js` (Express app) |
| Status endpoint | `src/main.js:/api/status` |

## How trade.spec.js Gets Parameters

### OLD Way (monitor-api.js):
```javascript
// monitor-api.js set env vars before spawning:
process.env.STRIKE_PRICE = signal.strike;
process.env.EXPIRY_DATE = signal.expiry_date;
// etc...

spawn('playwright test trade.spec.js');
```

### NEW Way (monitor-enhanced.js):
```javascript
// src/monitor-enhanced.js:executeTrade()
const env = {
  ...process.env,
  SIGNAL_ID: signal.id,
  STRIKE_PRICE: signal.strike,
  EXPIRY_DATE: signal.expiry_date,
  EXPIRY_TIME: signal.expiry_time,
  USER_EMAIL: signal.user_email,
  TRADE_USERNAME: this.credentials.username,
  TRADE_PASSWORD: this.credentials.password
};

spawn('playwright', ['test', action.testFile], { env });
```

### Result (trade.spec.js):
```javascript
// tests/trade.spec.js - UNCHANGED!
const targetStrike = parseFloat(process.env.STRIKE_PRICE);
const expiryDays = process.env.EXPIRY_DATE;
const expiryTime = process.env.EXPIRY_TIME;
// Works exactly the same way!
```

**trade.spec.js doesn't know or care which script set the env vars!**

## Verification

### Check Current System Has All Functionality:
```bash
# Search for signal processing functions
grep -n "SIGNAL_ID\|STRIKE_PRICE\|EXPIRY" src/monitor-enhanced.js

# Output shows:
# Line 247: SIGNAL_ID: signal.id,
# Line 249: STRIKE_PRICE: signal.strike,
# Line 251: EXPIRY_DATE: signal.expiry_date || '',
# Line 252: EXPIRY_TIME: signal.expiry_time || '',
```

### Test Current System:
```bash
# Start the system
npm start

# Check status
./check-status.sh

# View live logs showing signal processing
./view-logs.sh
```

## What You Need to Know

1. **monitor-api.js functionality is NOT lost** - It's integrated into the current system
2. **Same signal processing** - Polls API, extracts params, spawns Playwright
3. **Same parameter passing** - Environment variables set for trade.spec.js
4. **Same WordPress integration** - Uses same API endpoints
5. **Better overall system** - More features, better organized, easier to use

## Commands Reference

### OLD Commands (Deprecated):
```bash
npm run monitor:api          # REMOVED
node monitor-api.js          # REMOVED
```

### NEW Commands (Current):
```bash
npm start                    # Start integrated system
./start-monitor.sh          # Alternative start script
./check-status.sh           # Check if running
./view-logs.sh              # View live activity
./test-trade-visible.sh     # Test with visible browser
```

## Summary

**You haven't lost any functionality!**

- ✅ Still gets signals from B&S WordPress database
- ✅ Still passes parameters to trade.spec.js via env vars
- ✅ Still spawns Playwright to execute trades
- ✅ Still marks signals as processed
- ✅ PLUS: Web interface, API control, better logging, credential management

The old `monitor-api.js` was a simple standalone script. The new system is a complete, production-ready trading automation platform that does everything the old script did, plus much more.

**Current system is running now with all the functionality intact!**
