
// tests/close_trade.spec.js
// Script to close an open US500CASH position - UPDATED WITH CODEGEN METHODS
import { test } from '@playwright/test';
import { getScreenshotPath } from '../utils/paths.js';
import { maximizeBrowserWindow } from '../utils/browserHelper.js';

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
    await page.goto('https://avaoptions.avatrade.com/it/login', { waitUntil: 'domcontentloaded' });
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
    await page.waitForTimeout(2000);
    
    console.log('Filling username...');
    let usernameFilled = false;
    try {
      const usernameInput = page.locator('input[type="text"]:visible, input:not([type="password"]):not([type="hidden"]):visible').first();
      await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
      await usernameInput.click();
      await usernameInput.fill(USER);
      console.log('✓ Username filled');
      usernameFilled = true;
    } catch (e) {
      console.log('⚠️  First username strategy failed, trying fallback...');
      try {
        await page.locator('input').first().fill(USER);
        console.log('✓ Username filled (fallback)');
        usernameFilled = true;
      } catch (e2) {
        console.log('❌ Could not fill username:', e2.message);
      }
    }
    
    if (!usernameFilled) {
      await page.screenshot({ path: getScreenshotPath('error-username-close.png'), fullPage: true });
      throw new Error('Could not fill username');
    }
    
    console.log('Filling password...');
    const passwordInput = page.locator('input[type="password"]:visible').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.click();
    await passwordInput.fill(PASS);
    console.log('✓ Password filled');
    
    await page.waitForTimeout(1000);
    
    console.log('Clicking login button...');
    let buttonClicked = false;
    const buttonSelectors = [
      'button[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Accedi")',
      'button:has-text("Sign in")'
    ];
    
    for (const selector of buttonSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.count() > 0) {
          await button.click();
          console.log(`✓ Login button clicked with selector: ${selector}`);
          buttonClicked = true;
          break;
        }
      } catch (e) {
        console.log(`Button selector ${selector} failed: ${e.message}`);
      }
    }
    
    if (!buttonClicked) {
      console.log('Trying fallback button click...');
      await page.locator('button').first().click();
      console.log('✓ Fallback button clicked');
    }

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
    try {
      await page.locator('text=posizioni aperte').first().click({ timeout: 3000 });
      console.log('✓ Opened positions panel');
    } catch (e) {
      console.log('Trying alternative selector...');
      await page.locator('text=ordini').first().click({ timeout: 3000 });
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: getScreenshotPath('positions-panel.png'), fullPage: true });

    // METHOD 1: Click SELL cell (discovered via codegen - MOST RELIABLE)
    console.log('🎯 Method 1: Clicking SELL cell...');
    try {
      await page.getByRole('cell', { name: 'SELL' }).click({ timeout: 3000 });
      console.log('✅ Clicked SELL cell - dialog should appear');
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('⚠️  SELL cell not found, trying Method 2...');
      
      // METHOD 2: Use checkboxes (discovered via codegen)
      try {
        console.log('🎯 Method 2: Using checkboxes...');
        await page.locator('th > .appCheckbox > .appCheckbox__value').click({ timeout: 2000 });
        await page.waitForTimeout(500);
        await page.locator('.appCheckbox__value').first().click({ timeout: 2000 });
        console.log('✅ Selected position via checkboxes');
        await page.waitForTimeout(2000);
      } catch (e2) {
        console.log('⚠️  Checkboxes failed, trying Method 3...');
        
        // METHOD 3: Click US500CASH cell (fallback)
        await page.locator('td:has-text("US500CASH")').first().click({ timeout: 3000 });
        console.log('✅ Clicked US500CASH cell');
        await page.waitForTimeout(2000);
      }
    }
    
    await page.screenshot({ path: getScreenshotPath('position-selected.png'), fullPage: true });

    // Click "Chiudi posizione" button (discovered via codegen)
    console.log('🚪 Clicking "Chiudi posizione" button...');
    await page.getByRole('button', { name: 'Chiudi posizione' }).click({ timeout: 5000 });
    console.log('✅ Clicked "Chiudi posizione" button');
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: getScreenshotPath('position-closed.png'), fullPage: true });
    
    console.log('✅ Position closed successfully!');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔍 CRITICAL VERIFICATION: Check Margine Richiesto = 0 with retry/backoff
    // Some broker UIs update balances asynchronously; retry for up to ~30s before failing.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n🔍 MANDATORY VERIFICATION: Checking Margine Richiesto = 0 (with retries)...');

    const maxAttempts = 8; // total attempts
    const baseDelay = 3000; // initial delay in ms
    let marginAmount = null;
    let marginCurrency = null;
    let marginFormatted = null;
    let lastMarginText = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const waitMs = baseDelay * attempt; // increasing backoff
      console.log(`   Attempt ${attempt}/${maxAttempts}: waiting ${waitMs}ms before reading margin`);
      await page.waitForTimeout(waitMs);
      await page.screenshot({ path: getScreenshotPath(`debug-margin-post-close-attempt-${attempt}.png`), fullPage: true });

      try {
        const allText = await page.locator('body').textContent();
        lastMarginText = allText;
        const marginMatch = allText.match(/Margine\s+Richiesto[\s\S]{0,50}?([\d.,]+)\s*(CHF|EUR|USD|GBP)/i);
        if (marginMatch) {
          const marginValueRaw = marginMatch[1];
          const marginValueNum = parseFloat(marginValueRaw.replace(/\./g, '').replace(',', '.'));
          marginAmount = marginValueNum;
          marginCurrency = marginMatch[2];
          marginFormatted = `${marginMatch[1]} ${marginCurrency}`;
          console.log(`   Read Margine Richiesto: ${marginFormatted}`);
          if (marginAmount === 0) {
            console.log('   Margin is zero → closure confirmed');
            break;
          } else {
            console.log('   Margin not zero yet, will retry...');
          }
        } else {
          console.log('   Could not find Margine Richiesto in page text, will retry...');
        }
      } catch (readErr) {
        console.log('   Error reading page text for margin:', readErr.message);
      }
    }

    if (marginAmount === null) {
      console.error('❌ CRITICAL ERROR: Cannot read Margine Richiesto after closure (all retries)');
      await page.screenshot({ path: getScreenshotPath('error-no-margin-field.png'), fullPage: true });
      throw new Error('❌ CLOSURE VERIFICATION FAILED: Cannot read Margine Richiesto field after retries');
    }

    console.log(`📊 Margine Richiesto post-chiusura (final read): ${marginFormatted}`);

    if (marginAmount === 0) {
      // SUCCESS: Trade successfully closed
      console.log('');
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║         ✅ CHIUSURA TRADE CONFERMATA ✅               ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  Margine Richiesto: ${marginFormatted.padEnd(30)} ║`);
      console.log('║  La posizione è stata chiusa con successo             ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
      
      // Read final P&L (Profit/Loss) after trade closure
      console.log('💰 Reading final P/L after closure...');
      await page.waitForTimeout(1000);
      
      try {
        // Try to find P/L in the page - may be shown in a summary or final balance
        const plMatch = allText.match(/P[\/\s]*L[\s:]*(-?[\d.,]+)\s*(CHF|EUR|USD|GBP)?/i);
        
        if (plMatch) {
          const plValue = plMatch[1].replace(/\./g, '').replace(',', '.');
          const plAmount = parseFloat(plValue);
          const plCurrency = plMatch[2] || marginCurrency;
          const plFormatted = `${plMatch[1]} ${plCurrency}`;
          
          console.log(`📊 P/L finale: ${plFormatted}`);
          console.log(`💰 PL_FINAL_INFO: ${plAmount}`); // For monitor to capture
        } else {
          console.log('⚠️  P/L finale non trovato');
          console.log('💰 PL_FINAL_INFO: 0');
        }
      } catch (plError) {
        console.log('⚠️  Errore lettura P/L finale:', plError.message);
        console.log('💰 PL_FINAL_INFO: 0');
      }
    } else {
      // FAILURE: Trade still open after closure attempts
      console.log('');
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║         ❌ CHIUSURA TRADE FALLITA ❌                  ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  Margine Richiesto: ${marginFormatted.padEnd(30)} ║`);
      console.log('║  La posizione è ancora aperta dopo il tentativo      ║');
      console.log('║  di chiusura. Verificare manualmente.                ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
      await page.screenshot({ path: getScreenshotPath('closure-failed-margin-not-zero.png'), fullPage: true });
      
      throw new Error(`❌ CLOSURE EXECUTION FAILED: Margine Richiesto is still ${marginFormatted} after closure attempts. Trade NOT closed.`);
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
