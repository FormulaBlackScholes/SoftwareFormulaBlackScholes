// tests/check-margin.spec.js
// Quick script to check if a trade is currently open by reading Margine Richiesto
// Used at monitor startup to restore correct system state

import { test } from '@playwright/test';
import { getScreenshotPath } from '../utils/paths.js';
import { maximizeBrowserWindow } from '../utils/browserHelper.js';

test('Check Margine Richiesto', async ({ page }) => {
  test.setTimeout(120000); // 2 minutes timeout (cold-start Cloudflare needs more time)

  // Maximize browser window if in visible mode
  await maximizeBrowserWindow(page);

  // Read credentials from environment variables
  const USER = process.env.TRADE_USER || process.env.AVA_USERNAME;
  const PASS = process.env.TRADE_PASSWORD || process.env.AVA_PASSWORD;

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
    console.log('🔐 Logging in to check margin...');
    await page.goto('https://avaoptions.avatrade.com/it/login', { waitUntil: 'domcontentloaded' });
    
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
        let iframeInfo = null;
        try {
          iframeInfo = await page.evaluate(() => {
            const iframes = Array.from(document.querySelectorAll('iframe'));
            const info = iframes.map(f => ({ title: f.title, src: f.src.substring(0, 80) }));
            const cfIframe = iframes.find(f =>
              (f.title && (f.title.includes('Widget') || f.title.includes('Cloudflare') || f.title.includes('challenge'))) ||
              (f.src && (f.src.includes('challenges.cloudflare.com') || f.src.includes('turnstile')))
            ) || iframes[0];
            if (!cfIframe) return { found: false, iframes: info };
            const rect = cfIframe.getBoundingClientRect();
            return { found: true, iframes: info, x: rect.left, y: rect.top, w: rect.width, h: rect.height, title: cfIframe.title };
          });
        } catch (evalErr) {
          console.log(`⚠️ page.evaluate failed: ${evalErr.message}`);
        }
        console.log(`🔍 Iframes on page: ${JSON.stringify(iframeInfo?.iframes)}`);
        if (iframeInfo?.found && iframeInfo.w > 0) {
          // Checkbox is at ~15% from left, vertically centered in the Turnstile widget
          const cx = iframeInfo.x + iframeInfo.w * 0.15;
          const cy = iframeInfo.y + iframeInfo.h * 0.5;
          await page.mouse.move(cx - 50, cy - 30, { steps: 8 });
          await page.waitForTimeout(300);
          await page.mouse.move(cx, cy, { steps: 8 });
          await page.waitForTimeout(150);
          await page.mouse.click(cx, cy);
          console.log(`✓ Clicked Turnstile checkbox at (${Math.round(cx)}, ${Math.round(cy)}) iframe="${iframeInfo.title}"`);
          await page.waitForTimeout(3000); // wait for CF to process the click
        } else {
          console.log(`⚠️ No CF iframe found on page`);
        }
      } catch (e) { /* page in transition */ }
    }
    console.log(cfPassed ? '✓ Cloudflare wait complete' : '⚠️  CF still active after 90s, proceeding...');

    // Wait for actual login form elements - confirms we are past Cloudflare
    console.log('⏳ Waiting for login form to appear...');
    try {
      await page.waitForSelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="submit"]):not([disabled])', { timeout: 60000 });
      console.log(`✅ Login form is ready (URL: ${page.url()})`);
    } catch (e) {
      const currentTitle = await page.title().catch(() => 'unknown');
      await page.screenshot({ path: getScreenshotPath('error-cf-blocking.png'), fullPage: true }).catch(() => {});
      throw new Error(`Login form never appeared — Cloudflare still blocking? Title: "${currentTitle}"`);
    }

    // Handle cookie consent banner if present
    try {
      const cookieSelectors = [
        'button:has-text("Accept")',
        'button:has-text("Accetta")',
        '#onetrust-accept-btn-handler'
      ];
      
      for (const selector of cookieSelectors) {
        try {
          const button = page.locator(selector).first();
          if (await button.count() > 0) {
            await button.click({ timeout: 2000 });
            await page.waitForTimeout(1000);
            break;
          }
        } catch (e) {
          // Ignore
        }
      }
    } catch (e) {
      // No cookie banner
    }
    
    // Fill username
    const usernameInput = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
    await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
    await usernameInput.click();
    await usernameInput.fill(USER);
    
    await page.waitForTimeout(500);
    
    // Fill password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
    await passwordInput.click();
    await passwordInput.fill(PASS);
    
    await page.waitForTimeout(1000);
    
    // Click login button
    const buttonSelectors = [
      'button[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Accedi")'
    ];
    
    for (const selector of buttonSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.count() > 0) {
          await button.click();
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    await page.waitForTimeout(5000);
    
    // Handle account selection if needed
    const accountType = process.env.TRADE_ACCOUNT_TYPE || process.env.AVA_ACCOUNT_TYPE || 'DEMO';
    
    try {
      if (accountType === 'DEMO') {
        const demoSelectors = ['text=DEMO', 'text=Demo', 'button:has-text("DEMO")'];
        for (const selector of demoSelectors) {
          try {
            const element = page.locator(selector).first();
            if (await element.count() > 0) {
              await element.click({ timeout: 2000 });
              break;
            }
          } catch (e) {
            // Try next
          }
        }
      } else if (accountType === 'REAL') {
        const realSelectors = ['.asideMenu_radio', 'text=REAL'];
        for (const selector of realSelectors) {
          try {
            const element = page.locator(selector).first();
            if (await element.count() > 0) {
              await element.click({ timeout: 2000 });
              break;
            }
          } catch (e) {
            // Try next
          }
        }
      }
    } catch (e) {
      // Account selection not needed
    }
    
    await page.waitForTimeout(3000);
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔍 CHECK MARGINE RICHIESTO
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('🔍 Reading Margine Richiesto...');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: getScreenshotPath('margin-check.png'), fullPage: true });
    
    const allText = await page.locator('body').textContent();
    const marginMatch = allText.match(/Margine\s+Richiesto[\s\S]{0,50}?([\d.,]+)\s*(CHF|EUR|USD|GBP)/i);
    
    if (marginMatch) {
      const marginValue = marginMatch[1].replace(/\./g, '').replace(',', '.');
      const marginAmount = parseFloat(marginValue);
      const marginCurrency = marginMatch[2];
      const marginFormatted = `${marginMatch[1]} ${marginCurrency}`;
      
      console.log(`📊 Margine Richiesto: ${marginFormatted}`);
      
      // Output result for monitor to parse
      if (marginAmount > 0) {
        console.log('✅ MARGIN_CHECK: TRADE_ACTIVE');
        console.log(`💰 MARGIN_AMOUNT: ${marginAmount}`);
      } else {
        console.log('✅ MARGIN_CHECK: NO_TRADE');
      }
    } else {
      console.log('⚠️  "Margine Richiesto" non trovato - assumendo nessun trade aperto');
      console.log('✅ MARGIN_CHECK: NO_TRADE');
    }
    
    await page.waitForTimeout(2000);

  } catch (e) {
    console.log('❌ Margin check error:', e.message);
    console.log('❌ MARGIN_CHECK: ERROR');
    await page.screenshot({ path: getScreenshotPath('error-margin-check.png'), fullPage: true });
    throw e;
  }
});
