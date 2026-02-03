# AI Coding Instructions - AVA Trading Automation System

## Project Overview

**Nobel Trading** is a dual-architecture automated trading system for AvaTrade options:
1. **Electron Dashboard** (`electron-app/`) - Cross-platform GUI with auto-updates
2. **Playwright Monitor** (root) - Headless automation engine that polls WordPress API for trading signals

### Critical Architecture: Signal → Monitor → Playwright → Broker

```
WordPress API (trading signals)
    ↓ (polls every 5-30s)
monitor-api.js / TradingMonitor class
    ↓ (spawns with env vars)
tests/trade.spec.js (Playwright test)
    ↓ (automates browser)
AvaTrade web platform
```

## Core Components

### 1. Trading Monitor (`monitor-api.js`)
The heart of automation. Polls WordPress REST API for signals with structure:
```javascript
{
  segnale: 'APRI' | 'CHIUDI',  // Open or close trade
  strike: 6025.0,
  giorni_a_scadenza: '26D',
  orario_scadenza: '21:00:00',
  margine_per_contratto: 800,
  tipo_account: 'DEMO' | 'REAL'
}
```

**Key behavior**: Passes ALL signal parameters to Playwright via environment variables (`TRADE_STRIKE`, `TRADE_EXPIRY_DAYS`, `TRADE_MARGIN`, etc.). Never modify database directly - API-only access.

### 2. Playwright Tests (`tests/`)
Each test is a complete trading workflow:
- `trade.spec.js` - Opens new options positions (PUT/CALL)
- `close_trade.spec.js` - Closes existing positions

**Critical**: Tests read parameters from `process.env.TRADE_*` set by monitor, NOT from config files.

### 3. Cloudflare Bypass Strategy
**NEVER use `headless: true`** - Cloudflare Turnstile blocks it. Instead:
- `headless: false` in `playwright.config.js`
- Browser positioned off-screen: `--window-position=5000,5000`
- On Linux: Use `xvfb-run` for virtual display (see `start-trading-monitor.sh`)
- On Windows: Off-screen positioning works natively

### 4. Dynamic Contract Calculation
```javascript
// In trade.spec.js (lines 285-330)
const accountBalance = await scrapeBalance(page);
const margin = parseFloat(process.env.TRADE_MARGIN) || 1000; // From signal or fallback
const contracts = Math.floor((0.5 * accountBalance) / margin);
const bounded = Math.max(1, Math.min(contracts, 10)); // Safety limits
```

## Development Workflows

### Running the Monitor
```powershell
# Windows (PowerShell)
.\start-monitor-simple.ps1

# Debug mode (see browser)
$env:DEBUG_BROWSER="true"; .\start-monitor-simple.ps1
```

```bash
# Linux (invisible browser with Xvfb)
./start-trading-monitor.sh

# Debug mode (visible browser)
DEBUG_BROWSER=true node monitor-api.js
```

### Testing Individual Workflows
```bash
# Test opening a PUT option
$env:TRADE_STRIKE="6025"; $env:TRADE_EXPIRY_DAYS="26D"; $env:TRADE_EXPIRY_TIME="21:00:00"; npx playwright test tests/trade.spec.js --headed

# Test closing a position
npx playwright test tests/close_trade.spec.js --headed
```

### Building Electron App
```bash
cd electron-app

# Development
npm start

# Production builds (auto-uploads to GitHub Releases)
npm run build        # All platforms
npm run build:win    # Windows installer
npm run build:linux  # AppImage
npm run build:mac    # DMG
```

**Release flow**: `./release.sh` in electron-app → creates git tag → GitHub Actions compiles all platforms → publishes to `avaauto-releases` repo

## Project-Specific Patterns

### 1. Credential Management
- **Windows**: System environment variables set via PowerShell (`install-complete.ps1`)
- **Linux**: `.env` file in root (never committed)
- **Pattern**: `AVA_USERNAME`, `AVA_PASSWORD`, `AVA_ACCOUNT_TYPE` (DEMO/REAL)
- **Per-signal credentials**: Monitor prefers signal-embedded credentials over env vars for multi-user deployments

### 2. Color-Based UI Detection
Playwright can't reliably click AvaTrade's canvas-based sliders. Use HSV color detection:
```javascript
// utils/hsvDetector.js
export async function detectPutHandle(page) {
  const screenshot = await page.screenshot();
  const pixels = await sharp(screenshot).raw().toBuffer();
  // Find orange handle (HSV: 5-25, 180-255, 150-255)
  return { x, y }; // Absolute screen coordinates
}
```

### 3. Robust Element Selection
AvaTrade UI changes frequently. Always provide fallback selectors:
```javascript
const expirySelectorChain = [
  `text="${expirySelector}"`,  // e.g., "21:00(26D)"
  `[class*="expiry"]:has-text("${expiryHourMinute}")`,
  `.expiry-option >> text="${expiryDays}D"`
];

for (const selector of expirySelectorChain) {
  const element = page.locator(selector);
  if (await element.count() > 0) {
    await element.click();
    break;
  }
}
```

### 4. Logging Convention
Extensive emoji-prefixed logging for production monitoring:
```javascript
console.log('🚀 Starting monitor...');
console.log('📊 Trade Parameters:');
console.log('   Target Strike: 6025.0');
console.log('✅ Trade successful');
console.log('❌ Error:', error.message);
```

## Critical Files to Understand

| File | Purpose | Why It Matters |
|------|---------|----------------|
| `monitor-api.js` | Signal polling & orchestration | Entry point for automation, sets all env vars |
| `tests/trade.spec.js` | Opens positions | Contains contract calculation logic (lines 285-330) |
| `playwright.config.js` | Browser config | **NEVER** set `headless: true` (Cloudflare) |
| `utils/hsvDetector.js` | Visual element detection | Used when DOM selectors fail |
| `electron-app/src/main.js` | Electron main process | Manages monitor lifecycle, IPC with renderer |
| `install-complete.ps1` | Windows installer | Sets env vars, installs deps, configures autostart |

## Common Pitfalls

### ❌ Don't:
- Use `headless: true` (Cloudflare blocks)
- Hard-code strike prices or expiry dates in tests
- Modify WordPress database directly (use API only)
- Assume UI element selectors are stable (AvaTrade changes frequently)
- Run multiple monitor instances (signal deduplication is in-memory only)

### ✅ Do:
- Read ALL parameters from `process.env.TRADE_*`
- Provide fallback selectors and detection methods
- Log extensively for production debugging
- Use `waitForTimeout()` generously (UI is slow, especially on Cloudflare)
- Test with both DEMO and REAL account types

## ✅ Safety Features Implemented

### Pre-Execution Validation (lines ~1122-1175)
Before executing any trade, the system performs comprehensive safety checks:

```javascript
// 1. Strike Price Validation
if (Math.abs(finalStrike - targetStrike) > threshold) {
  console.log('🛑 TRADE ABORTED - Strike too far from target');
  throw new Error('Safety validation failed');
}

// 2. Account Type Verification
if (accountType === 'REAL') {
  // Extra strict validation (50% tighter tolerance)
  if (deviation > threshold * 0.5) {
    abort();
  }
}

// 3. Contract Quantity Check
if (numberOfContracts < 1 || numberOfContracts > 10) {
  abort();
}
```

**Critical**: Trade is **aborted** if any check fails. Dialog is closed, screenshot saved as `trade-aborted.png`.

### Parameter Validation (lines ~26-44)
System validates all required parameters before starting expensive operations:
- Credentials present
- Strike price is valid number > 0
- Expiry days/time are set
- Fails fast with detailed error messages

### Iteration Safety (lines ~967-992)
Prevents infinite loops during strike adjustment:
- Detects stuck strikes (< 1 point change)
- Warns on slow progress (< 5 points/iteration when far from target)
- Auto-stops after 10 iterations with minimal progress
- Max 20 iterations absolute limit

## Environment Variables Reference

### Monitor Configuration
- `TRADING_API_URL` - WordPress REST API base URL
- `TRADING_API_KEY` - API authentication key
- `POLL_INTERVAL` - Milliseconds between signal checks (default: 5000)
- `DEBUG_BROWSER` - Set to `true` to see browser window

### Trading Credentials
- `AVA_USERNAME` / `TRADE_USER` - Broker username
- `AVA_PASSWORD` / `TRADE_PASSWORD` - Broker password
- `AVA_ACCOUNT_TYPE` / `TRADE_ACCOUNT_TYPE` - "DEMO" or "REAL"

### Signal Parameters (set by monitor)
- `TRADE_STRIKE` - Strike price (e.g., "6025.0")
- `TRADE_EXPIRY_DAYS` - Days to expiry (e.g., "26D")
- `TRADE_EXPIRY_TIME` - Expiry time (e.g., "21:00:00")
- `TRADE_MARGIN` - Margin per contract for calculation (e.g., "800")
- `SIGNAL_ID` - Signal ID for logging/tracking

## Testing Strategy

1. **Unit-like**: Run individual Playwright tests with mocked env vars
2. **Integration**: Use `DEBUG_BROWSER=true` to watch monitor process live signals
3. **Production**: Monitor `logs/monitor-background.log` for emoji-prefixed events

**No traditional unit tests** - this is end-to-end browser automation. Playwright tests ARE the tests.

## Windows vs Linux Differences

| Aspect | Windows | Linux |
|--------|---------|-------|
| Browser invisibility | Off-screen positioning | `xvfb-run` virtual display |
| Credentials | System env vars | `.env` file |
| Install script | `install-complete.ps1` (PowerShell) | `quick-setup.sh` (Bash) |
| Autostart | Task Scheduler | systemd service |
| Path separators | Use `path.join()` everywhere | Use `path.join()` everywhere |

## When Modifying Trading Logic

1. **Always test with DEMO account first** (`AVA_ACCOUNT_TYPE=DEMO`)
2. **Verify contract calculation** - check logs show correct math
3. **Test Cloudflare bypass** - ensure 15s+ wait after page load
4. **Validate signal parameter mapping** - monitor logs show all fields
5. **Check error handling** - monitor should mark signals as failed, not crash

## Version History Context

- **v1.0.15** (current) - Dynamic contract calculation based on signal margin
- **v1.0.14** - Multi-strategy quantity selection (slider, input, keyboard)
- **v1.0.13** - Inline input field support for strikes
- **v1.0.12** - HSV color detection for UI elements

Older versions had database-direct access - **current architecture is API-only**.
