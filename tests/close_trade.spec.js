
// tests/close_trade.spec.js
// Script to close an open US500CASH position - UPDATED WITH CODEGEN METHODS
import { test } from '@playwright/test';
import { getScreenshotPath } from '../utils/paths.js';
import { maximizeBrowserWindow } from '../utils/browserHelper.js';

/**
 * Normalize a raw number string to a JS float.
 * Handles both locale formats:
 *   Italian / Swiss: "1.234,56"  dot=thousands  comma=decimal
 *   English:         "1,234.56"  comma=thousands dot=decimal
 *   Plain:           "9.55" or "9,55"
 */
function parseLocalFloat(str) {
  str = str.trim().replace(/\s/g, '');
  if (!str) return NaN;
  if (str.includes(',') && str.includes('.')) {
    return str.lastIndexOf('.') > str.lastIndexOf(',')
      ? parseFloat(str.replace(/,/g, ''))              // EN: 1,234.56
      : parseFloat(str.replace(/\./g, '').replace(',', '.')); // IT: 1.234,56
  }
  if (str.includes(',')) return parseFloat(str.replace(',', '.')); // IT: 9,55
  return parseFloat(str);
}

/**
 * Parse a currency+amount pair near a label in raw page text.
 * Handles all AvaTrade UI formats:
 *   Italian code, number first:  "-12,34 CHF"
 *   English code, currency first: "CHF -12.34"
 *   Euro symbol before number:   "\u20ac690.25" / "-\u20ac9.55"
 *   Euro symbol after number:    "-9,55 \u20ac"
 */
function parseCurrencyField(text, labelPattern) {
  const CUR = '(?:CHF|EUR|USD|GBP|\u20ac|\\$|\u00a3)';
  const NUM = '[\\d.,]+';
  const re = new RegExp(
    labelPattern.source +
    `[\\s\\S]{0,80}?(-?${CUR}\\s*-?${NUM}|-?${NUM}\\s*${CUR})`,
    'i'
  );
  const m = text.match(re);
  if (!m) return null;
  const token = m[1];
  const curMatch = token.match(new RegExp(CUR, 'i'));
  if (!curMatch) return null;
  const currencyRaw = curMatch[0];
  const currency = currencyRaw === '\u20ac' ? 'EUR'
                 : currencyRaw === '$' ? 'USD'
                 : currencyRaw === '\u00a3' ? 'GBP'
                 : currencyRaw.toUpperCase();
  const numStr = token.replace(new RegExp(CUR, 'gi'), '').trim();
  const amount = parseLocalFloat(numStr);
  if (isNaN(amount)) return null;
  return { amount, currency, formatted: `${numStr} ${currency}` };
}

test('Close US500CASH position', async ({ page }) => {
  test.setTimeout(120000); // 2 minutes

  // Maximize browser window if in visible mode
  await maximizeBrowserWindow(page);

  // Read credentials from environment variables (set by monitor-api.js or runner).
  // No hardcoded fallbacks - proper credentials must be provided via environment.
  const USER = process.env.TRADE_USER || process.env.CLOSE_TRADE_USER;
  const PASS = process.env.TRADE_PASSWORD || process.env.CLOSE_TRADE_PASS;

  if (!USER || !PASS) {
    throw new Error('Missing credentials: TRADE_USER and TRADE_PASSWORD environment variables must be set');
  }

  try {
    // Add stealth scripts to avoid bot detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'it'] });
      window.chrome = { runtime: {} };
    });
    
    // Login
    console.log('🔐 Logging in...');
    await page.goto('https://avaoptions.avatrade.com/en/login', { waitUntil: 'domcontentloaded' });
    console.log('✓ Page loaded, waiting for Cloudflare...');
    
    // Smart CF wait: each iteration polls title AND tries to click the Turnstile checkbox
    let cfPassed = false;
    for (let cfWait = 0; cfWait < 18; cfWait++) {
      try {
        await page.waitForTimeout(5000);
        const cfTitle = (await page.title()).toLowerCase();
        console.log(`⏳ CF check (${(cfWait + 1) * 5}s): "${cfTitle}"`);
        if (cfTitle !== '' && !cfTitle.includes('just a moment') && !cfTitle.includes('checking your') && !cfTitle.includes('please wait')) {
          cfPassed = true;
          console.log(`✓ Cloudflare resolved: "${cfTitle}"`);
          break;
        }
        // CF still active — find Turnstile iframe and click the checkbox via raw mouse coords
        const iframeBox = await page.evaluate(() => {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          const cfIframe = iframes.find(f =>
            (f.title && (f.title.includes('Widget') || f.title.includes('Cloudflare') || f.title.includes('challenge'))) ||
            (f.src && (f.src.includes('challenges.cloudflare.com') || f.src.includes('turnstile')))
          ) || iframes[0];
          if (!cfIframe) return null;
          const rect = cfIframe.getBoundingClientRect();
          return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
        });
        if (iframeBox && iframeBox.w > 0) {
          const cx = iframeBox.x + iframeBox.w * 0.15;
          const cy = iframeBox.y + iframeBox.h * 0.5;
          await page.mouse.move(cx - 50, cy - 30, { steps: 8 });
          await page.waitForTimeout(300);
          await page.mouse.move(cx, cy, { steps: 8 });
          await page.waitForTimeout(150);
          await page.mouse.click(cx, cy);
          console.log(`✓ Clicked Turnstile checkbox at (${Math.round(cx)}, ${Math.round(cy)})`);
          await page.waitForTimeout(3000);
        }
      } catch (e) { /* page in transition */ }
    }
    console.log(cfPassed ? '✓ Cloudflare wait complete' : '⚠️  CF still active after 90s, proceeding...');

    // Handle cookie consent PAGE (appears as a redirect before login, not just a banner)
    try {
      const consentSelectors = [
        'button:has-text("Accept all")',
        'button:has-text("Accetta tutti")',
        'button:has-text("Accept All")',
        'button:has-text("Accept")',
        'button:has-text("Accetta")',
        '#onetrust-accept-btn-handler',
        'button[id*="accept"]',
        'button[class*="accept"]',
        '.cookie-accept',
        '[aria-label*="Accept"]',
      ];
      for (const sel of consentSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 3000 })) {
            await btn.click();
            console.log(`✓ Cookie consent accepted (selector: ${sel})`);
            await page.waitForTimeout(2000);
            break;
          }
        } catch {}
      }
    } catch {}

    // Wait for actual login form elements - confirms we are past Cloudflare
    console.log('⏳ Waiting for login form to appear...');
    try {
      await page.waitForSelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="submit"]):not([disabled])', { timeout: 60000 });
      console.log('✅ Login form is ready');
    } catch (e) {
      const currentTitle = await page.title().catch(() => 'unknown');
      await page.screenshot({ path: getScreenshotPath('error-cf-blocking.png'), fullPage: true }).catch(() => {});
      throw new Error(`Login form never appeared — Cloudflare still blocking? Title: "${currentTitle}"`);
    }

    // Handle cookie consent banner if present
    console.log('Checking for cookie consent banner...');
    try {
      const cookieSelectors = [
        'button:has-text("Accept")',
        'button:has-text("Accetta")',
        'button:has-text("Accept all")',
        'button:has-text("Accetta tutti")',
        'button[id*="accept"]',
        'button[class*="accept"]',
        '#onetrust-accept-btn-handler',
        '.cookie-accept',
        '[aria-label*="Accept"]'
      ];
      
      for (const selector of cookieSelectors) {
        try {
          const cookieBtn = page.locator(selector).first();
          if (await cookieBtn.isVisible({ timeout: 2000 })) {
            await cookieBtn.click();
            console.log(`✓ Cookie banner dismissed (selector: ${selector})`);
            await page.waitForTimeout(1000);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }
    } catch (e) {
      console.log('⚠️  No cookie banner found or already dismissed');
    }
    
    // Wait for login form to be ready
    console.log('Waiting for login form...');
    await page.waitForTimeout(1000);
    
    console.log('Filling username...');
    let usernameFilled = false;
    const usernameStrategies = [
      () => page.getByLabel(/email|username|user|utente|login|e-mail/i).first(),
      () => page.getByPlaceholder(/email|username|user|utente|login/i).first(),
      () => page.locator('input[type="email"]').first(),
      () => page.locator('input[type="text"]:visible').first(),
      () => page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"]):visible').first(),
    ];
    for (const strategy of usernameStrategies) {
      try {
        const el = strategy();
        await el.fill(USER, { timeout: 3000 });
        console.log('✓ Username filled');
        usernameFilled = true;
        break;
      } catch {}
    }
    if (!usernameFilled) {
      await page.screenshot({ path: getScreenshotPath('error-username-close.png'), fullPage: true });
      throw new Error('Could not fill username');
    }
    
    console.log('Filling password...');
    let passwordInput;
    try {
      passwordInput = page.locator('input[type="password"]').first();
      await passwordInput.fill(PASS, { timeout: 5000 });
    } catch {
      passwordInput = page.getByLabel(/password/i).first();
      await passwordInput.fill(PASS, { timeout: 5000 });
    }
    console.log('✓ Password filled');
    
    await page.waitForTimeout(500);

    // PRIMARY: press Enter on the password field — works on any login form
    console.log('Submitting login form...');
    await passwordInput.press('Enter');
    console.log('✓ Login submitted via Enter');
    await page.waitForTimeout(5000);
    
    // Select account based on environment variable (default: DEMO)
    const targetAccount = (process.env.TRADE_ACCOUNT_TYPE || process.env.CLOSE_TRADE_ACCOUNT || 'DEMO').toUpperCase();
    console.log('Looking for account selection...');
    try {
      // Try a few variations (DEMO, Demo, Practice, REAL, Live)
      const accountSelectors = [
        `text=${targetAccount}`,
        `text=${targetAccount.charAt(0) + targetAccount.slice(1).toLowerCase()}`,
        'text=Demo',
        'text=DEMO',
        'text=Practice',
        'text=REAL',
        'text=Real',
        'text=Live'
      ];

      let accountClicked = false;
      for (const sel of accountSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.count() > 0) {
            await el.click({ timeout: 3000 });
            console.log(`✓ Selected account with selector: ${sel}`);
            accountClicked = true;
            await page.waitForTimeout(3000);
            break;
          }
        } catch (e) {
          // ignore and try next
        }
      }

      if (!accountClicked) {
        console.log('⚠️  No account selection needed or selector not found');
      }
    } catch (e) {
      console.log('⚠️  Account selection step skipped:', e.message);
    }
    
    // Wait for trading interface
    console.log('Waiting for trading interface...');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: getScreenshotPath('trading-interface.png'), fullPage: true });
    
    // Open positions panel
    console.log('📋 Opening positions panel...');
    const panelSelectors = [
      'text=posizioni aperte',    // IT lowercase
      'text=Posizioni Aperte',    // IT capitalized
      'text=POSIZIONI APERTE',    // IT allcaps
      'text=open positions',      // EN lowercase
      'text=Open Positions',      // EN capitalized
      'text=OPEN POSITIONS',      // EN allcaps
      'text=positions',           // EN short
      'text=Positions',
      'text=POSITIONS',
      'text=ordini',              // IT orders
      'text=orders',              // EN orders
      '[class*="openPositions"]',
      '[class*="open-positions"]',
      '[class*="positions"]',
    ];
    let panelOpened = false;
    for (const sel of panelSelectors) {
      try {
        await page.locator(sel).first().click({ timeout: 3000 });
        console.log(`✓ Opened positions panel (selector: ${sel})`);
        panelOpened = true;
        break;
      } catch {}
    }
    if (!panelOpened) console.log('⚠️  Could not open positions panel, proceeding anyway...');
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: getScreenshotPath('positions-panel.png'), fullPage: true });

    // Helper: attempt to click the close button after a selection method has run.
    // Returns true if clicked, false otherwise. Also dumps debug info.
    const tryClickCloseButton = async (label) => {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: getScreenshotPath(`debug-before-close-click-${label}.png`), fullPage: true });

      // Comprehensive debug: grab ALL elements (not just offsetParent !== null) to see icons too
      try {
        const allEls = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll(
            'button, [role="button"], a, [class*="close"], [class*="chiudi"], [class*="delete"], [class*="remove"], [class*="action"]'
          ));
          return els.map(e => ({
            tag: e.tagName,
            text: (e.textContent || '').trim().substring(0, 40),
            cls: (e.className || '').toString().substring(0, 60),
            visible: e.offsetParent !== null,
          })).filter(e => e.text.length > 0 || e.cls.toLowerCase().includes('close') || e.cls.toLowerCase().includes('delete'));
        });
        console.log(`   🔍 [${label}] Clickable elements (${allEls.length}):`);
        allEls.slice(0, 40).forEach(e => console.log(`      ${e.visible ? '👁' : '👻'} <${e.tag}> "${e.text}" cls="${e.cls}"`));
      } catch {}

      const closeButtonSelectors = [
        // ── Row-level close: inline button inside the US500CASH table row ──────
        // AvaTrade injects icon buttons directly in the row on hover/select
        { sel: 'tr:has-text("US500CASH") button' },
        { sel: 'tr:has-text("US500CASH") [role="button"]' },
        { sel: 'tr:has-text("US500CASH") [class*="close"]' },
        { sel: 'tr:has-text("US500CASH") [class*="delete"]' },
        { sel: 'tr:has-text("US500CASH") [class*="remove"]' },
        { sel: 'tr:has-text("US500CASH") a' },
        // ── Action bar that appears after row selection ───────────────────────
        { sel: '[class*="closeSelected"]' },
        { sel: '[class*="close-selected"]' },
        { sel: '[class*="bulkClose"]' },
        { sel: '[class*="bulk-close"]' },
        { sel: '[class*="deleteSelected"]' },
        { sel: '[class*="actionBar"] button' },
        { sel: '[class*="action-bar"] button' },
        { sel: '[class*="toolbar"] button:has-text("Chiudi")' },
        { sel: '[class*="toolbar"] button:has-text("Close")' },
        { sel: 'button[class*="delete"]' },
        { sel: 'button[class*="remove"]' },
        // ── Standard text-based ───────────────────────────────────────────────
        { role: 'Chiudi posizione' },
        { role: 'Chiudi' },
        { role: 'Close position' },
        { role: 'Close Position' },
        { role: 'Close trade' },
        { role: 'Close Trade' },
        { role: 'Close' },
        { sel: 'button:has-text("Chiudi posizione")' },
        { sel: 'button:has-text("Chiudi")' },
        { sel: 'button:has-text("Close position")' },
        { sel: 'button:has-text("Close Position")' },
        { sel: 'button:has-text("Close Trade")' },
        { sel: 'button:has-text("Close trade")' },
        { sel: 'button:has-text("CLOSE")' },
        { sel: 'button:has-text("Close")' },
        { sel: '[role="button"]:has-text("Close position")' },
        { sel: '[role="button"]:has-text("Close")' },
        { sel: '[role="button"]:has-text("Chiudi")' },
        { sel: 'a:has-text("Close position")' },
        { sel: 'a:has-text("Chiudi posizione")' },
        { sel: 'a:has-text("Close")' },
        { sel: 'a:has-text("Chiudi")' },
        { sel: '[data-testid*="close"]' },
        { sel: '[class*="close-position"]' },
        { sel: '[class*="closePosition"]' },
      ];
      for (const entry of closeButtonSelectors) {
        try {
          const btn = entry.role
            ? page.getByRole('button', { name: entry.role })
            : page.locator(entry.sel).first();
          await btn.click({ timeout: 800 });
          console.log(`✅ Clicked close button [${label}] (${entry.role || entry.sel})`);
          return true;
        } catch {}
      }

      // Last resort: JS evaluation — find any visible element referencing close/delete
      try {
        const matched = await page.evaluate(() => {
          const words = ['chiudi posizione', 'close position', 'close trade', 'chiudi', 'close'];
          const candidates = Array.from(document.querySelectorAll(
            'button, a, [role="button"], input[type="button"], input[type="submit"], [class*="close"], [class*="delete"], [class*="remove"]'
          ));
          for (const word of words) {
            const el = candidates.find(e =>
              (e.textContent || '').trim().toLowerCase().includes(word) && e.offsetParent !== null
            );
            if (el) { el.click(); return (e => `${e.tagName}:${e.className}:${e.textContent?.trim()}`)(el); }
          }
          // Last-last resort: click any close-class element visible on screen
          const closeEl = candidates.find(e => {
            const cls = (e.className || '').toString().toLowerCase();
            return (cls.includes('close') || cls.includes('delete')) && e.offsetParent !== null;
          });
          if (closeEl) { closeEl.click(); return `class-match:${closeEl.className}`; }
          return null;
        });
        if (matched) {
          console.log(`✅ Clicked close via JS fallback [${label}]: ${matched}`);
          return true;
        }
      } catch (jsErr) {
        console.log(`   JS fallback error [${label}]: ${jsErr.message}`);
      }
      return false;
    };

    // METHOD 1: Click SELL cell in the positions table row
    console.log('🎯 Method 1: Clicking SELL cell...');
    let closeClicked = false;
    try {
      await page.getByRole('cell', { name: 'SELL' }).click({ timeout: 3000 });
      console.log('✅ Clicked SELL cell - dialog should appear');
      await page.waitForTimeout(2000);
      closeClicked = await tryClickCloseButton('m1-sell');
    } catch (e) {
      console.log('⚠️  SELL cell not found, trying Method 2...');
    }

    // METHOD 2: Hover over the US500CASH row to reveal inline close button
    if (!closeClicked) {
      console.log('🎯 Method 2: Hover row to reveal inline close button...');
      try {
        const row = page.locator('tr:has-text("US500CASH")').first();
        await row.hover({ timeout: 3000 });
        await page.waitForTimeout(800);
        console.log('✅ Hovered over US500CASH row');
        closeClicked = await tryClickCloseButton('m2-hover');
      } catch (e2) {
        console.log(`⚠️  Row hover failed: ${e2.message}`);
      }
    }

    // METHOD 3: Checkboxes → wait for action bar
    if (!closeClicked) {
      console.log('🎯 Method 3: Using checkboxes...');
      try {
        await page.locator('th > .appCheckbox > .appCheckbox__value').click({ timeout: 2000 });
        await page.waitForTimeout(500);
        await page.locator('.appCheckbox__value').first().click({ timeout: 2000 });
        console.log('✅ Selected position via checkboxes');
        closeClicked = await tryClickCloseButton('m3-checkbox');
      } catch (e3) {
        console.log(`⚠️  Checkboxes failed: ${e3.message}`);
      }
    }

    // METHOD 4: Click US500CASH cell directly → dialog/panel
    if (!closeClicked) {
      console.log('🎯 Method 4: Clicking US500CASH cell...');
      try {
        await page.locator('td:has-text("US500CASH")').first().click({ timeout: 8000 });
        console.log('✅ Clicked US500CASH cell');
        await page.waitForTimeout(2000);
        closeClicked = await tryClickCloseButton('m4-cell');
      } catch (e4) {
        console.log(`⚠️  US500CASH cell click failed: ${e4.message}`);
      }
    }

    await page.screenshot({ path: getScreenshotPath('position-selected.png'), fullPage: true });

    if (!closeClicked) {
      await page.screenshot({ path: getScreenshotPath('close-button-not-found.png'), fullPage: true });
      throw new Error('Could not find close position button in any language variant');
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: getScreenshotPath('position-closed.png'), fullPage: true });
    console.log('✅ Close button clicked successfully');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔍 CRITICAL VERIFICATION: Check position is closed (retry)
    //
    // PRIMARY:   P/L Non Realizzato / Unrealized Profit / Unrealized P/L = 0
    //            Handles: "0,00 CHF", "€ 0.00", "0.00 CHF", "€ 0,0" — any currency
    // SECONDARY: Margine Richiesto / Required Margin / Margin Required = 0
    //
    // Closure confirmed if EITHER indicator becomes 0.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n🔍 MANDATORY VERIFICATION: Checking P/L and margin = 0 (IT/EN, all currencies, with retries)...');

    const maxAttempts = 8;
    const baseDelay = 3000;
    let plParsed = null;
    let marginParsed = null;
    let lastBodyText = null;
    let closureConfirmedByPL = false;
    let closureConfirmedByMargin = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const waitMs = baseDelay * attempt;
      console.log(`   Attempt ${attempt}/${maxAttempts}: waiting ${waitMs}ms before reading fields`);
      await page.waitForTimeout(waitMs);
      await page.screenshot({ path: getScreenshotPath(`debug-verify-post-close-attempt-${attempt}.png`), fullPage: true });

      try {
        lastBodyText = await page.locator('body').textContent();

        // PRIMARY: P/L Non Realizzato / Unrealized Profit
        plParsed = parseCurrencyField(
          lastBodyText,
          /(?:P\/L\s+Non\s+Realizzato|Unrealized\s+Profit|Unrealized\s+P\/L)/
        );
        if (plParsed) {
          console.log(`   Read P/L: ${plParsed.formatted}`);
          if (plParsed.amount === 0) {
            console.log('   ✅ P/L is zero → closure confirmed (primary check)');
            closureConfirmedByPL = true;
            break;
          } else {
            console.log(`   P/L not zero yet (${plParsed.formatted}), checking margin...`);
          }
        } else {
          console.log('   P/L field not found in page text, checking margin...');
        }

        // SECONDARY: Margine Richiesto / Required Margin
        marginParsed = parseCurrencyField(
          lastBodyText,
          /(?:Margine\s+Richiesto|Required\s+Margin|Margin\s+Required)/
        );
        if (marginParsed) {
          console.log(`   Read margin: ${marginParsed.formatted}`);
          if (marginParsed.amount === 0) {
            console.log('   ✅ Margin is zero → closure confirmed (secondary check)');
            closureConfirmedByMargin = true;
            break;
          } else {
            console.log(`   Margin not zero yet (${marginParsed.formatted}), will retry...`);
          }
        } else {
          console.log('   Margin field not found either, will retry...');
        }
      } catch (readErr) {
        console.log('   Error reading page text:', readErr.message);
      }
    }

    const closureConfirmed = closureConfirmedByPL || closureConfirmedByMargin;

    if (!closureConfirmed && plParsed === null && marginParsed === null) {
      console.error('❌ CRITICAL ERROR: Cannot read P/L or margin field after closure (all retries)');
      await page.screenshot({ path: getScreenshotPath('error-no-verify-field.png'), fullPage: true });
      throw new Error('❌ CLOSURE VERIFICATION FAILED: Cannot read P/L Non Realizzato or Margine Richiesto after retries');
    }

    // Determine display value for logs
    const confirmedField = closureConfirmedByPL
      ? `P/L = ${plParsed.formatted}`
      : closureConfirmedByMargin
        ? `Margin = ${marginParsed.formatted}`
        : `P/L = ${plParsed ? plParsed.formatted : 'n/a'}, Margin = ${marginParsed ? marginParsed.formatted : 'n/a'}`;

    if (closureConfirmed) {
      // SUCCESS: Trade successfully closed
      console.log('');
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║         ✅ CHIUSURA TRADE CONFERMATA ✅               ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  ${confirmedField.padEnd(52)} ║`);
      console.log('║  La posizione è stata chiusa con successo             ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');

      // Report final P&L
      const finalPL = plParsed ? plParsed.amount : 0;
      console.log(`💰 PL_FINAL_INFO: ${finalPL}`);
    } else {
      // FAILURE: Trade still open
      console.log('');
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║         ❌ CHIUSURA TRADE FALLITA ❌                  ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  ${confirmedField.padEnd(52)} ║`);
      console.log('║  La posizione è ancora aperta dopo il tentativo      ║');
      console.log('║  di chiusura. Verificare manualmente.                ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
      await page.screenshot({ path: getScreenshotPath('closure-failed-not-zero.png'), fullPage: true });
      throw new Error(`❌ CLOSURE EXECUTION FAILED: ${confirmedField} — Trade NOT closed.`);
    }
    
    // Note: Balance is not read in close_trade, will use null
    console.log('💰 BALANCE_INFO: null');
    
    await page.waitForTimeout(3000);

  } catch (e) {
    console.log('❌ Test error:', e.message);
    await page.screenshot({ path: getScreenshotPath('error-close.png'), fullPage: true });
    throw e;
  }
});
