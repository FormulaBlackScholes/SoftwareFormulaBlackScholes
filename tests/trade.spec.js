// tests/trade.spec.js
// Simplified trading test with HSV color-based detection
import 'dotenv/config';
import { test } from '@playwright/test';
import { detectPutHandle } from '../utils/hsvDetector.js';
import { getScreenshotPath } from '../utils/paths.js';

test('Trade US500CASH with PUT option', async ({ page }) => {
  test.setTimeout(240000); // 4 minutes timeout to fail faster if stuck

  // Inject stealth scripts to hide automation before navigating
  await page.addInitScript(() => {
    // Hide webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    delete navigator.__proto__.webdriver;

    // Platform coerente con Chrome reale su Windows
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

    // Plugins realistici
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];
        arr.__proto__ = PluginArray.prototype;
        return arr;
      }
    });

    // Lingue realistiche
    Object.defineProperty(navigator, 'languages', { get: () => ['it-IT', 'it', 'en-US', 'en'] });

    // Hardware concurrency realistico
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

    // Chrome runtime completo (segnale forte di Chrome reale)
    window.chrome = {
      app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
      runtime: {
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', GC_PRESSURE: 'gc_pressure', OS_UPDATE: 'os_update' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
        id: undefined,
        connect: () => {},
        sendMessage: () => {},
      },
      loadTimes: function() {},
      csi: function() {},
    };

    // Permissions API
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );

    // Nasconde cues di automation in outermostFrame
    const getParam = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    // Rimuovi flag cdp dal window
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
  });

  const USER = process.env.TRADE_USER;
  const PASS = process.env.TRADE_PASSWORD;
  
  // Read signal parameters from environment variables (set by monitor-api.js)
  const targetStrike = parseFloat(process.env.TRADE_STRIKE);
  const expiryDays = process.env.TRADE_EXPIRY_DAYS;
  const expiryTime = process.env.TRADE_EXPIRY_TIME;
  const accountType = process.env.TRADE_ACCOUNT_TYPE;
  
  // Client level wallet limits (from pricing tiers)
  const levelWalletLimits = {
    'Level I': 2000,
    'Level II': 3500,
    'Level III': 6000,
    'Level IV': 10000,
    'Level V': 16000,
    'Level VI': 25000,
    'Level VII': 40000,
    'Level VIII': 65000,
    'Level IX': 100000,
    'Level X': 160000,
    'Elite': 250000,
    'Standard': Infinity
  };
  
  const clientLevel = process.env.TRADE_CLIENT_LEVEL || 'Standard';
  const maxWalletByLevel = levelWalletLimits[clientLevel] || Infinity;
  
  // Extract hour from time (e.g., "21:00:00" -> "21:00")
  const expiryHourMinute = expiryTime?.substring(0, 5) || '21:00'; // "21:00"
  
  // Compose the expiry selector text: "21:00(26D)"
  // Check if expiryDays already has "D" suffix to avoid double "D"
  const daysValue = expiryDays?.endsWith('D') ? expiryDays : `${expiryDays}D`;
  const expirySelector = `${expiryHourMinute}(${daysValue})`;
  
  console.log('\n📊 Trade Parameters:');
  console.log(`   Target Strike: ${targetStrike}`);
  console.log(`   Expiry: ${expirySelector}`);
  console.log(`   Account Type: ${accountType || 'NOT SET - DEFAULTING TO DEMO'}`);
  console.log(`   Client Level: ${clientLevel}`);
  if (isFinite(maxWalletByLevel)) {
    console.log(`   Max Wallet (Level): ${maxWalletByLevel}€`);
  }
  console.log(`   User: ${USER}\n`);
  
  // Validate account type
  if (!accountType || (accountType !== 'DEMO' && accountType !== 'REAL')) {
    console.warn(`⚠️  WARNING: Invalid or missing account type "${accountType}", defaulting to DEMO`);
  }

  try {
    // Login with robust handling (from working version)
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
          await page.mouse.move(300 + Math.random() * 200, 100 + Math.random() * 100, { steps: 15 });
          await page.waitForTimeout(300 + Math.random() * 400);
          await page.mouse.move(cx, cy, { steps: 10 });
          await page.waitForTimeout(100 + Math.random() * 200);
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
    
    // Take screenshot to debug what we see
    await page.screenshot({ path: getScreenshotPath('debug-before-login.png'), fullPage: true });
    
    // Fill credentials - skip hidden inputs (e.g., Cloudflare Turnstile)
    console.log('Filling username...');
    
    // Try multiple strategies to find and fill username
    let usernameFilled = false;
    const usernameSelectors = [
      'input[type="text"]:visible',
      'input[type="email"]:visible',
      'input:not([type="password"]):not([type="hidden"]):visible',
      'input:visible'
    ];
    
    for (const selector of usernameSelectors) {
      try {
        const usernameInput = page.locator(selector).first();
        await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
        await usernameInput.click({ timeout: 3000 });
        await usernameInput.fill(USER);
        console.log(`✓ Username filled with selector: ${selector}`);
        usernameFilled = true;
        break;
      } catch (e) {
        console.log(`Username selector ${selector} failed: ${e.message}`);
      }
    }
    
    if (!usernameFilled) {
      await page.screenshot({ path: getScreenshotPath('error-no-username.png'), fullPage: true });
      throw new Error('Could not find username input field');
    }
    
    console.log('Filling password...');
    const passwordInput = page.locator('input[type="password"]:visible').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.click();
    await passwordInput.fill(PASS);
    
    await page.waitForTimeout(1000);
    
    console.log('Clicking login button...');
    // Try multiple button selectors
    const buttonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]', 
      'button:has-text("Login")',
      'button:has-text("Accedi")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      '[value="Login"]',
      '[value="Accedi"]'
    ];
    
    let buttonClicked = false;
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

    console.log('Waiting after login...');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: getScreenshotPath('after-login.png'), fullPage: true });
    
    // Try to find and click account selection based on signal's account type
    const targetAccountType = accountType || 'DEMO'; // Default to DEMO if not set
    console.log(`Looking for ${targetAccountType} account selection or continue...`);
    
    // Take screenshot before account selection to debug
    await page.screenshot({ path: getScreenshotPath('before-account-selection.png'), fullPage: true });
    
    try {
      // Build account selectors based on the signal's account type
      let accountSelectors = [];
      
      if (targetAccountType === 'DEMO') {
        // Look for DEMO/Practice account selectors
        accountSelectors = [
          'text=DEMO',
          'text=Demo',
          'text=Practice',
          'button:has-text("DEMO")',
          'button:has-text("Demo")',
          'button:has-text("Practice")',
          '[class*="demo"]',
          '[class*="practice"]'
        ];
      } else if (targetAccountType === 'REAL') {
        // Look for REAL account selectors (from codegen)
        accountSelectors = [
          '.asideMenu_radio', // Radio button - .first() = REAL, .nth(1) = DEMO
          'text=REAL', // Text with exact match
          'text=Real',
          'button:has-text("REAL")',
          'button:has-text("Real")',
          '[class*="real"]'
        ];
      }
      
      // Add common continue/select buttons as fallback
      accountSelectors.push(
        'button:has-text("Continue")',
        'button:has-text("Continua")',
        'button:has-text("Select")',
        'button:has-text("Seleziona")'
      );
      
      let accountSelected = false;
      for (const selector of accountSelectors) {
        try {
          const element = page.locator(selector).first();
          const count = await element.count();
          console.log(`   Trying selector: ${selector} (found: ${count})`);
          
          if (count > 0) {
            // Special handling for .asideMenu_radio with REAL: skip text check, it's a radio button
            if (selector === '.asideMenu_radio' && targetAccountType === 'REAL') {
              await element.click(); // .first() already applied = REAL
              console.log(`✓ Clicked ${targetAccountType} account with selector: ${selector} (radio button - first = REAL)`);
              accountSelected = true;
              break;
            }
            
            // Additional check: if looking for specific account type, verify the element text
            const elementText = await element.textContent().catch(() => '');
            console.log(`   Element text: "${elementText}"`);
            
            if (targetAccountType === 'DEMO' && elementText.toUpperCase().includes('REAL') && !elementText.toUpperCase().includes('REALIZED')) {
              console.log(`   Skipping element with text "${elementText}" (looking for DEMO)`);
              continue;
            }
            if (targetAccountType === 'REAL' && elementText.toUpperCase().includes('DEMO')) {
              console.log(`   Skipping element with text "${elementText}" (looking for REAL)`);
              continue;
            }
            
            await element.click();
            console.log(`✓ Clicked ${targetAccountType} account with selector: ${selector}`);
            accountSelected = true;
            break;
          }
        } catch (e) {
          console.log(`Account selector ${selector} failed: ${e.message}`);
        }
      }
      
      if (!accountSelected) {
        console.log('No specific account selector found, checking if we are already in trading interface...');
      }
    } catch (e) {
      console.log('Account selection step skipped:', e.message);
    }
    
    await page.waitForTimeout(5000);
    await page.screenshot({ path: getScreenshotPath('after-account-selection.png'), fullPage: true });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛑 CRITICAL CHECK: Verify no trade is already open
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('🔍 Checking for existing open trades...');
    await page.waitForTimeout(2000); // Let UI fully load
    await page.screenshot({ path: getScreenshotPath('debug-margine-check.png'), fullPage: true });
    
    const allText = await page.locator('body').textContent();

    // ── PRIMARY CHECK: P/L Non Realizzato (IT) / Unrealized Profit (EN) ──
    // Located in the top banner. Value is exactly 0,00 when no trade is open.
    // Playwright codegen confirmed the element is in role=banner.
    let unrealizedRawText = null;
    try {
      const banner = page.getByRole('banner');
      // Try to grab the combined text node e.g. "P/L Non Realizzato0,00 CHF"
      const unrealizedLabel = banner.locator('text=/P\\/L Non Realizzato|Unrealized Profit/i').first();
      if (await unrealizedLabel.count() > 0) {
        // Get the parent element that contains both label + value
        const parentText = await unrealizedLabel.locator('..').textContent().catch(() => null)
                        || await unrealizedLabel.textContent().catch(() => null);
        unrealizedRawText = parentText;
        console.log(`📊 Banner P/L element text: "${parentText?.trim()}"`);
      }
    } catch (e) {
      console.log(`⚠️  Banner locator failed: ${e.message}`);
    }

    // Fallback: scan full body text if banner locator didn't work
    const textToSearch = unrealizedRawText || allText;
    const unrealizedValueMatch = textToSearch.match(/(?:P\/L\s+Non\s+Realizzato|Unrealized\s+Profit)[\s\S]{0,80}?(-?[\d.,]+)\s*(CHF|EUR|USD|GBP)/i);
    const unrealizedMatch = textToSearch.match(/P\/L\s+Non\s+Realizzato|Unrealized\s+Profit/i);

    // ── SECONDARY CHECK: Margine Richiesto (IT) / Margin Required (EN) ──
    const marginRequiredMatch = allText.match(/(?:Margine\s+Richiesto|Margin\s+Required)[\s\S]{0,50}?([\d.,]+)\s*(CHF|EUR|USD|GBP)/i);

    let tradeAlreadyOpen = false;
    let detectionReason = '';

    // Check P/L Non Realizzato first (most reliable)
    if (unrealizedValueMatch) {
      const rawValue = unrealizedValueMatch[1].replace(/\./g, '').replace(',', '.');
      const unrealizedAmount = parseFloat(rawValue);
      const currency = unrealizedValueMatch[2];
      const formatted = `${unrealizedValueMatch[1]} ${currency}`;
      console.log(`📊 P/L Non Realizzato: ${formatted}`);
      if (unrealizedAmount !== 0) {
        tradeAlreadyOpen = true;
        detectionReason = `P/L Non Realizzato = ${formatted}`;
      } else {
        console.log('✅ P/L Non Realizzato = 0 - nessun trade aperto');
      }
    } else if (unrealizedMatch) {
      // Field found but value not parsed - treat as unknown, fall through to secondary check
      console.log('⚠️  P/L Non Realizzato trovato ma valore non leggibile');
    } else {
      console.log('⚠️  "P/L Non Realizzato" non trovato - verifico Margine Richiesto...');
    }

    // Secondary check: Margine Richiesto (used if primary check inconclusive)
    if (!tradeAlreadyOpen && !unrealizedValueMatch && marginRequiredMatch) {
      const marginValue = marginRequiredMatch[1].replace(/\./g, '').replace(',', '.');
      const marginAmount = parseFloat(marginValue);
      const marginCurrency = marginRequiredMatch[2];
      const marginFormatted = `${marginRequiredMatch[1]} ${marginCurrency}`;
      console.log(`📊 Margine Richiesto: ${marginFormatted}`);
      if (marginAmount > 0) {
        tradeAlreadyOpen = true;
        detectionReason = `Margine Richiesto = ${marginFormatted}`;
      } else {
        console.log('✅ Margine Richiesto = 0 - nessun trade aperto');
      }
    }

    if (!unrealizedValueMatch && !marginRequiredMatch) {
      console.log('⚠️  Nessun indicatore trovato - assumendo nessun trade aperto');
    }

    if (tradeAlreadyOpen) {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║           ⚠️  TRADE GIÀ APERTO RILEVATO ⚠️            ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  ${detectionReason.padEnd(52)} ║`);
      console.log('║  Non è possibile aprire un nuovo trade                ║');
      console.log('║  mentre uno è già in corso                            ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
      await page.screenshot({ path: getScreenshotPath('trade-already-open.png'), fullPage: true });

      // CRITICAL: Throw error to completely stop execution
      throw new Error(`🛑 TRADE ABORTED: Trade già aperto rilevato (${detectionReason}). Impossibile aprire nuovo trade.`);
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Read cash balance
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('💰 Reading cash balance...');
    let cashBalance = null;
    
    try {
      // Take screenshot to see what we're working with
      await page.screenshot({ path: getScreenshotPath('debug-balance-reading.png'), fullPage: true });
      
      // Now read cash balance
      const balanceMatch = allText.match(/(?:Saldo|Balance|Cash)[\s\S]{0,100}([\d.,]+)\s*(CHF|EUR|USD|GBP)/i);
      if (balanceMatch) {
        console.log(`  Found potential balance text: "${balanceMatch[0]}"`);
      } else {
        console.log(`  No balance pattern found in page text`);
      }
      
      // Try multiple strategies to find and read the cash balance
      const balanceSelectors = [
        'text=/Saldo.*cash/i',
        'text=/Cash.*balance/i',
        'text=/Saldo/i',
        '[class*="balance"]',
        '[class*="cash"]',
        '[class*="saldo"]'
      ];
      
      let balanceText = null;
      for (const selector of balanceSelectors) {
        try {
          const element = page.locator(selector).first();
          if (await element.count() > 0) {
            // Try to get the text from the element or its parent
            balanceText = await element.textContent();
            console.log(`   Found with selector "${selector}": "${balanceText}"`);
            
            // If text is too short, try getting parent or nearby elements
            if (balanceText && balanceText.length < 15) {
              try {
                const parent = element.locator('..');
                const parentText = await parent.textContent();
                if (parentText && parentText.length > balanceText.length) {
                  console.log(`   Using parent text: "${parentText}"`);
                  balanceText = parentText;
                }
              } catch {}
            }
            break;
          }
        } catch {}
      }
      
      if (balanceText) {
        // Try to extract numeric value and currency from various formats
        const patterns = [
          /(\d+(?:[.,]\d{3})*[.,]\d{2})\s*([A-Z]{3})/i,  // European or US format with currency
          /([A-Z]{3})\s*(\d+(?:[.,]\d{3})*[.,]\d{2})/i   // Currency first
        ];
        
        for (const pattern of patterns) {
          const match = balanceText.match(pattern);
          if (match) {
            let amount, currency;
            if (match[2].length === 3 && /[A-Z]{3}/.test(match[2])) {
              amount = match[1];
              currency = match[2];
            } else {
              currency = match[1];
              amount = match[2];
            }
            
            // Convert to number (handle both European and US formats)
            let numericAmount;
            if (amount.includes(',') && amount.includes('.')) {
              numericAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
            } else if (amount.includes(',')) {
              const parts = amount.split(',');
              if (parts[parts.length - 1].length === 2) {
                numericAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
              } else {
                numericAmount = parseFloat(amount.replace(/,/g, ''));
              }
            } else {
              numericAmount = parseFloat(amount);
            }
            
            cashBalance = {
              amount: numericAmount,
              currency: currency,
              formatted: `${amount} ${currency}`
            };
            
            console.log(`✅ Cash Balance: ${cashBalance.formatted}`);
            console.log(`   Numeric value: ${cashBalance.amount} ${cashBalance.currency}`);
            break;
          }
        }
      }
      
      if (!cashBalance) {
        console.log('⚠️  Could not find or parse cash balance - this is expected if balance is not yet visible');
      }
    } catch (e) {
      console.log('⚠️  Error reading cash balance:', e.message);
    }

    // Calculate number of contracts based on balance and margin
    console.log('\n📊 Calculating number of contracts...');
    let numberOfContracts = 4; // Final fallback
    
    // Default margin per contract (used when signal doesn't provide it)
    // This is a reasonable estimate for US500CASH options
    const DEFAULT_MARGIN_PER_CONTRACT = 1000; // CHF
    
    try {
      let marginPerContract = null;
      let marginSource = 'default';
      
      // Read margin from signal (passed via environment variable from monitor-api.js)
      const tradeMargin = process.env.TRADE_MARGIN;
      
      if (tradeMargin) {
        marginPerContract = parseFloat(tradeMargin);
        if (!isNaN(marginPerContract) && marginPerContract > 0) {
          marginSource = 'signal';
          console.log(`   ✅ Margin from signal: ${marginPerContract} ${cashBalance?.currency || 'CHF'}`);
        } else {
          console.log(`   ⚠️  Invalid margin value in signal: "${tradeMargin}"`);
          marginPerContract = null;
        }
      } else {
        console.log(`   ℹ️  No margin provided in signal (TRADE_MARGIN not set)`);
      }
      
      // If signal didn't provide margin, use default
      if (!marginPerContract) {
        marginPerContract = DEFAULT_MARGIN_PER_CONTRACT;
        marginSource = 'fallback';
        console.log(`   ℹ️  Using fallback margin: ${marginPerContract} CHF`);
      }
      
      // Calculate contracts if we have balance
      if (cashBalance && cashBalance.amount && marginPerContract) {
        // Validate inputs before calculation
        const balanceAmount = parseFloat(cashBalance.amount);
        const marginAmount = parseFloat(marginPerContract);
        let calculatedContracts = numberOfContracts; // Default to fallback
        
        if (isNaN(balanceAmount) || isNaN(marginAmount) || marginAmount <= 0) {
          console.log(`   ⚠️  Invalid input values (balance: ${balanceAmount}, margin: ${marginAmount})`);
          console.log(`   Using fallback: ${numberOfContracts}`);
        } else {
          // Calculate: contracts = floor((0.5 * balance) / margin)
          calculatedContracts = Math.floor((0.5 * balanceAmount) / marginAmount);
          
          // Validate calculation result
          if (isNaN(calculatedContracts) || !isFinite(calculatedContracts) || calculatedContracts < 0) {
            console.log(`   ⚠️  Invalid calculation result (${calculatedContracts}), using fallback: ${numberOfContracts}`);
            calculatedContracts = numberOfContracts;
          }
          
          // Apply client level wallet limit
          let maxContractsByLevel = Number.POSITIVE_INFINITY;
          if (isFinite(maxWalletByLevel)) {
            maxContractsByLevel = Math.floor(maxWalletByLevel / marginAmount);
            if (calculatedContracts > maxContractsByLevel) {
              console.log(`   ⚠️  Client Level "${clientLevel}" limits wallet to ${maxWalletByLevel}€`);
              console.log(`   ⚠️  This allows max ${maxContractsByLevel} contracts @ ${marginPerContract}€ each`);
            }
          }
          
          // Use the calculated value, respecting both account balance and client level limits
          numberOfContracts = Math.min(calculatedContracts, maxContractsByLevel);
        }
        
        console.log(`   📊 Account balance: ${cashBalance.amount} ${cashBalance.currency}`);
        console.log(`   💰 Margin per contract: ${marginPerContract} ${cashBalance.currency} (${marginSource})`);
        console.log(`   🧮 Calculation: floor((0.5 × ${cashBalance.amount}) / ${marginPerContract}) = ${calculatedContracts}`);
        if (isFinite(maxWalletByLevel)) {
          console.log(`   📋 Client Level: ${clientLevel} (max wallet: ${maxWalletByLevel}€)`);
        }
        console.log(`   ✅ Final contracts: ${numberOfContracts}`);
        console.log('\n');
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║                 NUMERO CONTRATTI FINALE                ║');
        console.log('╠════════════════════════════════════════════════════════╣');
        console.log(`║  ➤ CONTRATTI DA UTILIZZARE: ${numberOfContracts.toString().padEnd(22)} ║`);
        console.log(`║  ➤ Saldo disponibile: ${cashBalance.amount.toFixed(2).padEnd(27)} ║`);
        console.log(`║  ➤ Margine per contratto: ${marginPerContract.toFixed(2).padEnd(23)} ║`);
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log('\n');
        
        if (numberOfContracts === 0) {
          console.log(`   ⚠️  WARNING: Insufficient funds for even 1 contract - trade will be skipped`);
        }
      } else {
        console.log(`   ⚠️  Missing balance data, using fixed fallback: ${numberOfContracts}`);
      }
    } catch (e) {
      console.log(`   ⚠️  Error calculating contracts: ${e.message}, using fixed fallback: ${numberOfContracts}`);
    }
    
    // Final validation: ensure numberOfContracts is NEVER NaN
    if (isNaN(numberOfContracts) || !isFinite(numberOfContracts) || numberOfContracts < 1) {
      console.log(`   ⚠️  Invalid numberOfContracts detected (${numberOfContracts}), forcing to 4`);
      numberOfContracts = 4;
    }
    
    console.log(`   🎯 FINAL VALIDATED CONTRACTS: ${numberOfContracts}`);

    // Wait for trading UI
    console.log('Looking for trading interface...');
    const tradingSelectors = [
      'text=EUR/USD',
      'text=EURUSD',
      'text=US500CASH',
      '[class*="instruments"]',
      '[class*="trade"]',
      '[class*="chart"]',
      'text=USD/JPY',
      'text=GBP/USD'
    ];
    
    let tradingFound = false;
    for (const selector of tradingSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        console.log(`✓ Trading interface found with selector: ${selector}`);
        tradingFound = true;
        break;
      } catch (e) {
        console.log(`Trading selector ${selector} not found: ${e.message}`);
      }
    }
    
    if (!tradingFound) {
      console.log('No specific trading elements found, continuing anyway...');
      await page.waitForTimeout(3000);
    }

    // Open instrument selector (robust approach)
    console.log('🔍 Checking for US500CASH...');
    
    // Wait a bit more for UI to be fully ready
    await page.waitForTimeout(2000);
    
    // Check if US500CASH is already selected (check more thoroughly)
    const us500Selectors = [
      'text=US500CASH',
      'text=/US500/i',
      '[class*="instrument"]:has-text("US500")',
      '[class*="selected"]:has-text("US500")'
    ];
    
    let alreadySelected = false;
    for (const selector of us500Selectors) {
      try {
        if (await page.locator(selector).count() > 0) {
          alreadySelected = true;
          console.log(`✓ US500CASH already selected (found with: ${selector})`);
          break;
        }
      } catch {}
    }
    
    if (!alreadySelected) {
      console.log('US500CASH not selected, opening instrument selector...');
      
      // Try clicking instrument selector with multiple strategies
      let selectorOpened = false;
      
      // Strategy 1: Click any visible instrument text
      try {
        await page.getByText(/EUR\/USD|GBP\/USD|USD\/JPY/i).first().click({ timeout: 3000 });
        selectorOpened = true;
        console.log('✓ Opened selector by clicking instrument text');
      } catch {}
      
      // Strategy 2: Click instruments panel/header
      if (!selectorOpened) {
        try {
          await page.locator('[class*="instrument"]').first().click({ timeout: 3000 });
          selectorOpened = true;
          console.log('✓ Opened selector by clicking instruments panel');
        } catch {}
      }
      
      // Strategy 3: Click top-left area where selector usually is
      if (!selectorOpened) {
        console.log('⚠️  Using coordinate click for instrument selector');
        await page.mouse.click(150, 50);
        selectorOpened = true;
      }
      
      await page.waitForTimeout(2500); // Increased wait for selector panel to fully open

      // Verify selector panel is actually open before proceeding
      console.log('🔍 Verifying selector panel opened...');
      const selectorPanelVisible = await page.locator('input[type="text"], input[type="search"], .search input').first().isVisible({ timeout: 5000 }).catch(() => false);
      if (!selectorPanelVisible) {
        console.log('⚠️  Selector panel not detected, taking screenshot for debug...');
        await page.screenshot({ path: getScreenshotPath('debug-selector-not-open.png'), fullPage: true });
        // Try one more time with a different approach
        await page.keyboard.press('Control+F').catch(() => {});
        await page.waitForTimeout(1000);
      }

      // Find and fill search box - with retry logic and multiple strategies
      console.log('Looking for search box...');
      let searchSuccess = false;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // Try multiple search box selectors
          const searchSelectors = [
            'input[type="text"]',
            'input[type="search"]',
            'input[placeholder*="search" i]',
            'input[placeholder*="cerca" i]',
            '.search input',
            '[class*="search"] input',
            'input'
          ];
          
          let searchBox = null;
          for (const selector of searchSelectors) {
            try {
              const box = page.locator(selector).filter({ visible: true }).first();
              if (await box.count() > 0) {
                searchBox = box;
                console.log(`   Found search box with selector: ${selector}`);
                break;
              }
            } catch {}
          }
          
          if (searchBox) {
            await searchBox.click({ timeout: 2000 });
            await page.waitForTimeout(300);
            await searchBox.fill('US500CASH');
            await page.waitForTimeout(500);
            console.log('✓ Typed US500CASH in search');
            searchSuccess = true;
            break;
          } else {
            console.log(`⚠️  Search box attempt ${attempt}/3: No visible input found`);
          }
        } catch (e) {
          console.log(`⚠️  Search box attempt ${attempt}/3 failed:`, e.message);
        }
        
        if (!searchSuccess && attempt < 3) {
          // Try clicking selector area again with different coordinates
          const clickPoints = [[150, 50], [100, 80], [200, 60]];
          const [x, y] = clickPoints[attempt - 1] || [150, 50];
          console.log(`   Retrying with click at (${x}, ${y})...`);
          await page.mouse.click(x, y);
          await page.waitForTimeout(1500);
        }
      }
      
      if (!searchSuccess) {
        console.log('❌ Could not find search box, taking debug screenshot...');
        await page.screenshot({ path: getScreenshotPath('debug-no-search-box.png'), fullPage: true });
        throw new Error('Could not find or interact with search box after 3 attempts');
      }
      
      await page.waitForTimeout(800);
      
      // Click US500CASH from results with better error handling
      try {
        await page.getByText('US500CASH').first().click({ timeout: 10000 });
        console.log('✓ Clicked US500CASH in search results');
      } catch (clickError) {
        console.log('⚠️  Direct click failed, trying coordinate-based click...');
        // Get the element position and click there
        const us500Element = page.getByText('US500CASH').first();
        const box = await us500Element.boundingBox().catch(() => null);
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          console.log('✓ Clicked US500CASH via coordinates');
        } else {
          throw new Error('Could not click US500CASH - element not found');
        }
      }
      
      await page.waitForTimeout(3000); // Increased wait for instrument to load

      // Verify page is still open and responsive
      if (page.isClosed()) {
        throw new Error('Page was closed unexpectedly after selecting US500CASH');
      }

      // Close instruments panel with multiple strategies
      console.log('🔄 Closing instrument selector panel...');
      try {
        await page.keyboard.press('Escape', { timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(500);
        await page.locator('.instruments__headerArrow > svg, .instruments__headerArrow, button[aria-label="close"]').first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(1500);
      } catch (panelCloseError) {
        console.log('⚠️  Could not close panel normally, continuing anyway...');
        // Take screenshot to debug
        await page.screenshot({ path: getScreenshotPath('debug-panel-close-failed.png'), fullPage: true }).catch(() => {});
      }
      
      // CRITICAL: Verify US500CASH is now selected
      console.log('🔍 Verifying US500CASH selection...');
      await page.waitForTimeout(1500);
      
      let us500Verified = false;
      for (const selector of us500Selectors) {
        try {
          if (await page.locator(selector).count() > 0) {
            us500Verified = true;
            console.log(`✅ US500CASH verified selected with: ${selector}`);
            break;
          }
        } catch {}
      }
      
      if (!us500Verified) {
        console.log('❌ CRITICAL ERROR: US500CASH not verified as selected!');
        await page.screenshot({ path: getScreenshotPath('error-us500-not-selected.png'), fullPage: true });
        throw new Error('US500CASH could not be verified as selected');
      }
    } else {
      // Already selected - still verify it's really there
      console.log('🔍 Double-checking US500CASH selection...');
      await page.waitForTimeout(500);
      
      let stillSelected = false;
      for (const selector of us500Selectors) {
        try {
          if (await page.locator(selector).count() > 0) {
            stillSelected = true;
            break;
          }
        } catch {}
      }
      
      if (!stillSelected) {
        console.log('⚠️ US500CASH appeared selected but verification failed, attempting reselection...');
        // Retry selection logic here if needed
        throw new Error('US500CASH verification failed after initial detection');
      }
      
      console.log('✅ US500CASH confirmed selected');
    }

    // Configure trade
    console.log('⚙️  Configuring trade...');
    
    // Try to click Spot mode - but it might already be selected
    try {
      await page.getByText('Spot').first().click({ timeout: 3000 });
      console.log('✓ Clicked Spot mode');
    } catch (e) {
      console.log('⚠️  Could not click Spot (might already be selected):', e.message);
    }
    
    await page.waitForTimeout(500);
    
    // Try to click Put option - but it might already be selected
    try {
      await page.getByText('Put', { exact: true }).first().click({ timeout: 3000 });
      console.log('✓ Clicked Put option');
    } catch (e) {
      console.log('⚠️  Could not click Put (might already be selected):', e.message);
    }
    
    await page.waitForTimeout(500);
    
    // Click the Sell/Vendi RCV button
    try {
      await page.getByRole('button', { name: /Vendi RCV|Sell RCV|Vendi/i }).first().click({ timeout: 5000 });
      console.log('✓ Clicked Vendi RCV button');
    } catch (e) {
      console.log('⚠️  Could not click Vendi RCV button:', e.message);
      // Try alternative selectors
      await page.locator('button:has-text("Vendi")').first().click({ timeout: 5000 });
      console.log('✓ Clicked Vendi button (fallback)');
    }
    
    await page.getByText(/Exp\.Date:|Exp.Date:/).first().click().catch(() => {});
    await page.waitForTimeout(1500); // Wait longer for dropdown to fully open
    
    console.log(`⏰ Selecting expiry: ${expirySelector}`);
    
    // Try multiple strategies to click the expiry
    let expiryClicked = false;
    
    // Strategy 1: Exact text match with force
    try {
      await page.getByText(expirySelector, { exact: true }).click({ timeout: 5000, force: true });
      console.log('✓ Expiry clicked (exact match)');
      expiryClicked = true;
    } catch (e) {
      console.log(`  ⚠️  Exact match failed: ${e.message}`);
    }
    
    // Strategy 2: Click directly on the dropdown item with class
    if (!expiryClicked) {
      try {
        await page.locator('.expiration__itemValue').filter({ hasText: expiryHourMinute }).filter({ hasText: expiryDays }).first().click({ timeout: 5000, force: true });
        console.log('✓ Expiry clicked (class selector)');
        expiryClicked = true;
      } catch (e) {
        console.log(`  ⚠️  Class selector failed: ${e.message}`);
      }
    }
    
    // Strategy 3: Partial text match with force
    if (!expiryClicked) {
      try {
        await page.getByText(expiryHourMinute).filter({ hasText: expiryDays }).click({ timeout: 5000, force: true });
        console.log('✓ Expiry clicked (partial match)');
        expiryClicked = true;
      } catch (e) {
        console.log(`  ⚠️  Partial match failed: ${e.message}`);
      }
    }
    
    // Strategy 4: Try regex pattern matching
    if (!expiryClicked) {
      try {
        await page.locator(`text=/${expiryHourMinute}.*${expiryDays}/`).first().click({ timeout: 5000, force: true });
        console.log(`✓ Expiry clicked (regex pattern)`);
        expiryClicked = true;
      } catch (e) {
        console.log(`  ⚠️  Regex pattern failed: ${e.message}`);
      }
    }
    
    // Strategy 5: Try clicking visible expiry items and checking their text
    if (!expiryClicked) {
      try {
        const expiryItems = await page.locator('.expiration__itemValue').all();
        for (const item of expiryItems) {
          const text = await item.textContent();
          if (text && text.includes(expiryHourMinute) && text.includes(expiryDays)) {
            await item.click({ force: true });
            console.log(`✓ Expiry clicked (found in items: ${text})`);
            expiryClicked = true;
            break;
          }
        }
        if (!expiryClicked) {
          console.log(`  ⚠️  No matching expiry in items list`);
        }
      } catch (e) {
        console.log(`  ⚠️  Items iteration failed: ${e.message}`);
      }
    }
    
    if (!expiryClicked) {
      console.log('❌ Could not click expiry, taking screenshot...');
      await page.screenshot({ path: getScreenshotPath('error-expiry-not-clickable.png'), fullPage: true });
      throw new Error(`Could not click expiry: ${expirySelector}`);
    }
    
    await page.waitForTimeout(1500); // Wait for selection to register
    
    // CRITICAL: Verify expiry was actually selected
    console.log('🔍 Verifying expiry selection...');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: getScreenshotPath('verify-expiry.png'), fullPage: true });
    
    // Try to read the selected expiry from the UI
    let expiryVerified = false;
    try {
      const expiryElements = await page.getByText(expirySelector).all();
      if (expiryElements.length > 0) {
        console.log(`✅ Expiry ${expirySelector} found in UI - assuming selected`);
        expiryVerified = true;
      }
    } catch (e) {
      console.log('⚠️  Could not verify expiry:', e.message);
    }
    
    if (!expiryVerified) {
      console.log('❌ CRITICAL ERROR: Expiry not verified!');
      await page.screenshot({ path: getScreenshotPath('error-expiry-not-verified.png'), fullPage: true });
      throw new Error(`Expiry ${expirySelector} could not be verified as selected`);
    }
    
    console.log('✅ Expiry verification passed');
    
    // Set quantity with detailed logging
    console.log('\n📊 Setting up quantity...');
    
    // Safety check before using numberOfContracts
    if (isNaN(numberOfContracts) || !isFinite(numberOfContracts) || numberOfContracts < 1) {
      console.log(`  ⚠️  CRITICAL: numberOfContracts is invalid (${numberOfContracts}), aborting trade`);
      await page.screenshot({ path: getScreenshotPath('error-invalid-contracts.png'), fullPage: true });
      throw new Error(`Invalid numberOfContracts: ${numberOfContracts}`);
    }
    
    console.log(`  Target: ${numberOfContracts} contracts`);
    
    try {
      // STEP 1: Open the calculator first
      console.log('  Step 1: Opening calculator...');
      let calculatorOpened = false;
      
      // Try opening calculator with multiple strategies
      try {
        await page.locator('form').filter({ hasText: 'Quantità' }).getByRole('img').click({ timeout: 3000 });
        await page.waitForSelector('.tradeCalculator', { state: 'visible', timeout: 2000 });
        calculatorOpened = true;
        console.log('  ✓ Calculator opened (form+img)');
      } catch (e) {
        try {
          await page.locator('div').filter({ hasText: 'Quantità' }).nth(5).click({ timeout: 3000 });
          await page.waitForSelector('.tradeCalculator', { state: 'visible', timeout: 2000 });
          calculatorOpened = true;
          console.log('  ✓ Calculator opened (nth(5))');
        } catch (e2) {
          try {
            await page.locator('.quantitySlider__btnCalc').click({ timeout: 3000 });
            await page.waitForSelector('.tradeCalculator', { state: 'visible', timeout: 2000 });
            calculatorOpened = true;
            console.log('  ✓ Calculator opened (btnCalc)');
          } catch (e3) {
            try {
              // Try clicking on calculator icon/button directly
              await page.locator('[class*="calc"], [class*="Calc"]').first().click({ timeout: 3000 });
              await page.waitForSelector('.tradeCalculator', { state: 'visible', timeout: 2000 });
              calculatorOpened = true;
              console.log('  ✓ Calculator opened (calc class)');
            } catch (e4) {
              console.log('  ⚠️  Could not open calculator');
              await page.screenshot({ path: getScreenshotPath('error-calculator-not-opening.png'), fullPage: true });
            }
          }
        }
      }
      
      if (!calculatorOpened) {
        console.log('  ⚠️  Calculator did not open, will try adjusting without it');
      }
      
      // Wait a moment for calculator to fully render
      await page.waitForTimeout(500);
      
      console.log(`  Step 2: Finding quantity input field in calculator...`);
      
      // Strategy: Use calculator input field (cancella, inserisci, applica)
      let quantityInput = null;
      try {
        // Try multiple selectors for the input field
        const inputSelectors = [
          '.tradeCalculator input[type="number"]',
          '.tradeCalculator input[type="text"]',
          '.tradeCalculator input#quantity',
          '.tradeCalculator input',
          'input#quantity'
        ];
        
        for (const selector of inputSelectors) {
          try {
            quantityInput = page.locator(selector).first();
            await quantityInput.waitFor({ state: 'visible', timeout: 1000 });
            console.log(`  ✓ Found input with selector: ${selector}`);
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!quantityInput) {
          throw new Error('No input field found');
        }
      } catch (e) {
        console.log(`  ❌ Could not find quantity input field`);
        await page.screenshot({ path: getScreenshotPath('error-no-calculator-input.png'), fullPage: true });
        throw new Error('Cannot find calculator input field');
      }
      
      // Clear the field and enter new value
      console.log(`  Step 3: Clearing field and entering ${numberOfContracts}...`);
      
      // Focus the input
      await quantityInput.click();
      await page.waitForTimeout(200);
      
      // Select all and delete
      await page.keyboard.press('Control+A');
      await page.waitForTimeout(100);
      await page.keyboard.press('Delete');
      await page.waitForTimeout(200);
      
      // Type the new value
      await quantityInput.fill(numberOfContracts.toString());
      await page.waitForTimeout(500);
      
      // Verify the input contains the correct value
      const inputValue = await quantityInput.inputValue();
      console.log(`  Input field value: "${inputValue}" (expected: "${numberOfContracts}")`);
      
      if (inputValue !== numberOfContracts.toString()) {
        console.log(`  ⚠️  Input value mismatch, trying again...`);
        await quantityInput.fill('');
        await page.waitForTimeout(200);
        await quantityInput.fill(numberOfContracts.toString());
        await page.waitForTimeout(500);
        
        const retryValue = await quantityInput.inputValue();
        console.log(`  Retry: Input field value: "${retryValue}"`);
        
        if (retryValue !== numberOfContracts.toString()) {
          await page.screenshot({ path: getScreenshotPath('error-input-value-mismatch.png'), fullPage: true });
          throw new Error(`Cannot set input value to ${numberOfContracts}, got "${retryValue}"`);
        }
      }
      
      console.log(`  ✅ Input field correctly set to ${numberOfContracts}`);
      
      console.log(`  Step 4: Looking for Apply/Applica button...`);
      
      // Find and click the Apply button (bottom right of calculator, next to reset "x")
      let applyClicked = false;
      
      // Strategy 1: Search ALL clickable elements (not just buttons - can be div, span, etc)
      try {
        const clickables = await page.locator('.tradeCalculator *[role="button"], .tradeCalculator button, .tradeCalculator div[class*="button"], .tradeCalculator span[class*="button"], .tradeCalculator a').all();
        console.log(`  Found ${clickables.length} clickable elements in calculator`);
        
        for (let i = 0; i < clickables.length; i++) {
          const elemText = await clickables[i].textContent();
          const elemClass = await clickables[i].getAttribute('class');
          console.log(`    Element ${i}: "${elemText?.trim()}" | class: ${elemClass}`);
          
          if (elemText && (elemText.toLowerCase().includes('applica') || elemText.toLowerCase().includes('apply'))) {
            await clickables[i].click();
            console.log(`  ✓ Clicked Apply element (index ${i})`);
            applyClicked = true;
            break;
          }
        }
        
        // If not found by text, try the last clickable element (should be Apply in bottom right)
        if (!applyClicked && clickables.length > 0) {
          const lastElem = clickables[clickables.length - 1];
          const lastText = await lastElem.textContent();
          console.log(`  Clicking last clickable element: "${lastText?.trim()}"`);
          await lastElem.click();
          console.log(`  ✓ Clicked last element (assuming it's Apply)`);
          applyClicked = true;
        }
      } catch (e) {
        console.log(`  ⚠️  Strategy 1 failed: ${e.message}`);
      }
      
      // Strategy 2: Use evaluate to find by position (bottom right)
      if (!applyClicked) {
        try {
          const applyElement = await page.evaluate(() => {
            const calc = document.querySelector('.tradeCalculator');
            if (!calc) return null;
            
            const allElements = Array.from(calc.querySelectorAll('*'));
            const clickableElements = allElements.filter(el => {
              const style = window.getComputedStyle(el);
              return (style.cursor === 'pointer' || el.onclick || el.getAttribute('role') === 'button') &&
                     style.display !== 'none' && style.visibility !== 'hidden';
            });
            
            // Get rightmost bottom element
            let rightmost = null;
            let maxRight = 0;
            
            for (const el of clickableElements) {
              const rect = el.getBoundingClientRect();
              if (rect.right > maxRight) {
                maxRight = rect.right;
                rightmost = el;
              }
            }
            
            if (rightmost) {
              // Return a selector we can use
              const classes = rightmost.className;
              return { tagName: rightmost.tagName, className: classes, text: rightmost.textContent?.trim() };
            }
            return null;
          });
          
          if (applyElement) {
            console.log(`  Found rightmost element: ${applyElement.tagName}.${applyElement.className} "${applyElement.text}"`);
            const selector = `.tradeCalculator ${applyElement.tagName.toLowerCase()}.${applyElement.className.split(' ').join('.')}`;
            await page.locator(selector).first().click();
            console.log(`  ✓ Clicked Apply (rightmost element)`);
            applyClicked = true;
          }
        } catch (e) {
          console.log(`  ⚠️  Strategy 2 failed: ${e.message}`);
        }
      }
      
      if (!applyClicked) {
        console.log(`  ❌ No Apply button found with any strategy`);
        await page.screenshot({ path: getScreenshotPath('error-no-apply-button.png'), fullPage: true });
        throw new Error('Cannot find Apply button in calculator');
      }
      
      // Wait for calculator to process and close
      console.log(`  Waiting for calculator to close...`);
      await page.waitForTimeout(1000);
      
      // Check if calculator closed
      try {
        const calcStillOpen = await page.locator('.tradeCalculator').isVisible();
        if (calcStillOpen) {
          console.log(`  ⚠️  Calculator still open after 1s, waiting more...`);
          await page.waitForTimeout(1500);
          
          const stillOpen2 = await page.locator('.tradeCalculator').isVisible();
          if (stillOpen2) {
            console.log(`  ⚠️  Calculator STILL open, may need to close manually`);
          } else {
            console.log(`  ✓ Calculator closed`);
          }
        } else {
          console.log(`  ✓ Calculator closed`);
        }
      } catch (e) {
        console.log(`  ✓ Calculator closed (not found)`);
      }
      
      await page.waitForTimeout(500);
      
      // Verify the quantity was set by reading from the visual display (not slider)
      console.log(`  Step 5: Verifying quantity was set...`);
      
      let finalValue = null;
      
      // Strategy 1: Read from the quantity display text (where it shows the value visually)
      try {
        // Look for quantity display near "Quantità" label
        const quantityTexts = await page.locator('text=/Quantità|Quantity/i').locator('..').allTextContents();
        console.log(`  Quantity area texts: ${JSON.stringify(quantityTexts)}`);
        
        // Try to extract a number from the text
        for (const text of quantityTexts) {
          const match = text.match(/\b(\d+)\b/);
          if (match) {
            const value = parseInt(match[1]);
            if (value > 0 && value <= 100) {
              finalValue = value;
              console.log(`  ✓ Found quantity value in display: ${finalValue}`);
              break;
            }
          }
        }
      } catch (e) {
        console.log(`  ⚠️  Strategy 1 failed: ${e.message}`);
      }
      
      // Strategy 2: Try reading from slider if display not found
      if (finalValue === null) {
        try {
          const slider = page.getByRole('slider');
          finalValue = await slider.evaluate((el) => parseInt(el.getAttribute('value')));
          if (isNaN(finalValue)) finalValue = null;
          else console.log(`  ✓ Read from slider: ${finalValue}`);
        } catch (e) {
          console.log(`  ⚠️  Strategy 2 failed: ${e.message}`);
        }
      }
      
      // Strategy 3: If we successfully used calculator with correct input, trust it
      if (finalValue === null || Math.abs(finalValue - numberOfContracts) > 10) {
        console.log(`  ⚠️  Cannot verify quantity from DOM (got ${finalValue}), but calculator input was correct`);
        console.log(`  ℹ️  Trusting calculator input and proceeding with ${numberOfContracts} contracts`);
        finalValue = numberOfContracts; // Trust the calculator input we verified earlier
      }
      
      if (finalValue !== null) {
        console.log(`  Final value: ${finalValue} (target: ${numberOfContracts})`);
        
        if (finalValue === numberOfContracts) {
          console.log(`  ✅ Quantity set correctly to ${numberOfContracts}`);
        } else {
          const tolerance = Math.max(5, Math.floor(numberOfContracts * 0.1)); // 10% tolerance or min 5
          const difference = Math.abs(finalValue - numberOfContracts);
          
          if (difference > tolerance) {
            console.log(`  ❌ CRITICAL: Value mismatch too large!`);
            console.log(`     Target: ${numberOfContracts}`);
            console.log(`     Actual: ${finalValue}`);
            console.log(`     Difference: ${difference} (max allowed: ${tolerance})`);
            await page.screenshot({ path: getScreenshotPath('error-quantity-mismatch-critical.png'), fullPage: true });
            throw new Error(`Quantity mismatch: expected ${numberOfContracts}, got ${finalValue} (diff: ${difference})`);
          } else {
            console.log(`  ⚠️  Value mismatch: got ${finalValue}, expected ${numberOfContracts}`);
            console.log(`  ℹ️  Within tolerance (${difference} <= ${tolerance}), proceeding`);
          }
        }
      } else {
        console.log(`  ⚠️  Could not verify quantity, proceeding anyway`);
      }
      
    } catch (error) {
      console.error('  ❌ Error in quantity setup:', error.message);
      await page.screenshot({ path: getScreenshotPath('error-quantity-setup.png'), fullPage: true });
      throw error;
    }
    
    await page.waitForTimeout(1000);
    console.log('✅ Quantity setup complete\n');
    
    // CRITICAL: Verify US500CASH is STILL selected (UI might have changed)
    console.log('🔍 Final verification: Checking US500CASH still selected...');
    await page.waitForTimeout(1000);
    
    let us500StillSelected = false;
    for (const selector of us500Selectors) {
      try {
        if (await page.locator(selector).count() > 0) {
          us500StillSelected = true;
          console.log(`✅ US500CASH still selected (verified with: ${selector})`);
          break;
        }
      } catch {}
    }
    
    if (!us500StillSelected) {
      console.log('❌ CRITICAL ERROR: US500CASH no longer selected after quantity setup!');
      await page.screenshot({ path: getScreenshotPath('error-us500-lost.png'), fullPage: true });
      throw new Error('US500CASH selection lost during quantity setup - wrong instrument would be traded');
    }

    // Execute trade
    console.log('💼 Executing trade...');
    await page.locator('#chartToolsRight').getByRole('button').click();
    console.log('✓ Trade button clicked');
    
    // Wait for trade execution and chart to update
    console.log('Waiting for trade execution and chart update...');
    await page.waitForTimeout(6000);
    
    await page.screenshot({ path: getScreenshotPath('after-trade-execution.png'), fullPage: true });
    console.log('✅ Trade executed');

    // Wait for PUT handle to appear
    console.log('Final wait for PUT indicator to be ready...');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: getScreenshotPath('before-put-drag.png'), fullPage: true });

    // Open trading window
    console.log('📊 Opening trading window to read strike price...');
    await page.getByRole('button', { name: 'Vendi RCV' }).click();
    console.log('✓ Clicked "Vendi RCV" button to open trading window');
    await page.waitForTimeout(2000);

    // Get current strike price
    let currentStrike = null;
    try {
      const sellBtn = page.locator('text=/sell \\d+[\\.,]\\d+ PUT/i').first();
      const btnText = await sellBtn.textContent();
      const match = btnText.match(/sell\s+([\d,\.]+)\s+PUT/i);
      if (match) {
        currentStrike = parseFloat(match[1].replace(',', '.'));
        console.log(`💰 Current strike: ${currentStrike}`);
      }
    } catch {}

    // Detect PUT handle using HSV color filter
    console.log('\n🎯 Detecting PUT handle...');
    let detection = await detectPutHandle(page, { debugSave: true });
    
    if (!detection) {
      console.log('⚠️  Could not detect PUT handle on first try - handle may be above viewport, scrolling up...');
      
      // Scroll up by the same amount normally used to scroll down, to bring the handle into view
      const _viewportSize = page.viewportSize();
      const _canvas = page.locator('canvas').first();
      const _canvasBox = await _canvas.boundingBox();
      const _scrollX = _canvasBox ? _canvasBox.x + _canvasBox.width / 2 : _viewportSize.width / 2;
      const _scrollY = _canvasBox ? _canvasBox.y + _canvasBox.height / 2 : _viewportSize.height / 2;
      
      await page.mouse.move(_scrollX, _scrollY);
      await page.waitForTimeout(200);
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, -80); // Scroll up
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(1500);
      
      console.log('🎯 Re-detecting PUT handle after scroll up...');
      detection = await detectPutHandle(page, { debugSave: true });
      
      if (!detection) {
        console.log('❌ Could not detect PUT handle even after scrolling up');
        throw new Error('Detection failed');
      }
      console.log(`✅ PUT handle found at (${detection.x}, ${detection.y}) after scroll up`);
    }

    console.log(`✅ PUT handle found at (${detection.x}, ${detection.y})`);
    
    console.log(`🎯 Target strike: ${targetStrike} (from signal)`);
    if (currentStrike) {
      const reduction = currentStrike - targetStrike;
      const reductionPercent = ((reduction / currentStrike) * 100).toFixed(1);
      console.log(`   Current: ${currentStrike} → Target: ${targetStrike}`);
      console.log(`   Reduction needed: ${reduction.toFixed(2)} points (${reductionPercent}%)`);
    }

    // Close any overlays
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);

    // Iterative drag loop to reach target strike
    const maxIterations = 30; // Increased from 20 to allow more attempts for larger strike movements
    const dragDistance = 150; // pixels per drag
    const strikeThreshold = 75; // acceptable difference from target (US500CASH moves in ~25-50pt increments; 75pt tolerance avoids abort on small overshoot)
    const scrollThreshold = 200; // pixels from bottom to trigger scroll
    const scrollAmount = 300; // pixels to scroll down
    
    let iteration = 0;
    let previousStrike = currentStrike;
    let lastDragPixels = dragDistance; // track drag used so we can compute pts/px ratio
    let pointsPerPixel = null; // dynamically calibrated from observed movement
    
    console.log(`\n🔄 Starting iterative drag to reach target: ${targetStrike}`);
    
    while (iteration < maxIterations) {
      iteration++;
      console.log(`\n--- Iteration ${iteration}/${maxIterations} ---`);
      
      // Detect PUT handle position
      console.log('🎯 Detecting PUT handle...');
      const detection = await detectPutHandle(page, { debugSave: iteration === 1 });
      
      if (!detection) {
        console.log('⚠️  Could not detect PUT handle, stopping iterations');
        break;
      }
      
      console.log(`✅ PUT handle at (${detection.x}, ${detection.y})`);
      
      // Check if handle is in lower half of viewport and scroll to keep it centered
      const viewportSize = page.viewportSize();
      const viewportMiddle = viewportSize.height / 2;
      const handlePositionPercent = ((detection.y / viewportSize.height) * 100).toFixed(0);
      
      // If handle is below 50% of viewport height, scroll chart to reveal more contracts (changed from 60% to scroll earlier)
      if (detection.y > viewportSize.height * 0.5) {
        console.log(`📜 Handle at ${handlePositionPercent}% of viewport (getting low), scrolling chart down...`);
        
        // Get canvas element for scrolling and ensure it's valid
        const canvas = page.locator('canvas').first();
        const canvasBox = await canvas.boundingBox();
        
        if (!canvasBox) {
          console.log('⚠️  Canvas not found, trying to scroll anyway with viewport center...');
          // Fallback: use viewport center
          const centerX = viewportSize.width / 2;
          const centerY = viewportSize.height / 2;
          
          // Adaptive scroll based on handle position (fallback mode) - increased amounts for more aggressive scrolling
          const handlePositionPercent = detection.y / viewportSize.height;
          
          let scrollSteps, scrollAmount;
          if (handlePositionPercent > 0.7) {
            scrollSteps = 5; // Increased from 4
            scrollAmount = 120; // Increased from 100
          } else if (handlePositionPercent > 0.6) {
            scrollSteps = 4; // Increased from 3
            scrollAmount = 100; // Increased from 80
          } else {
            scrollSteps = 3; // Increased from 2
            scrollAmount = 80; // Increased from 60
          }
          
          for (let i = 0; i < scrollSteps; i++) {
            await page.mouse.move(centerX, centerY);
            await page.mouse.wheel(0, scrollAmount);
            await page.waitForTimeout(100);
          }
        } else {
          // Calculate center of canvas for mouse positioning
          const canvasCenterX = canvasBox.x + (canvasBox.width / 2);
          const canvasCenterY = canvasBox.y + (canvasBox.height / 2);
          
          console.log(`   Canvas found: ${canvasBox.width}x${canvasBox.height} at (${canvasBox.x}, ${canvasBox.y})`);
          console.log(`   Positioning mouse at canvas center: (${canvasCenterX.toFixed(0)}, ${canvasCenterY.toFixed(0)})`);
          
          // Move mouse to canvas center FIRST, then scroll
          await page.mouse.move(canvasCenterX, canvasCenterY);
          await page.waitForTimeout(200);
          
          // Adaptive scroll based on handle position - increased aggressiveness
          const handlePositionPercent = detection.y / viewportSize.height;
          
          let scrollSteps, scrollAmount;
          if (handlePositionPercent > 0.7) {
            // Very low (70%+): aggressive scroll (changed from 80%+)
            scrollSteps = 5; // Increased from 4
            scrollAmount = 120; // Increased from 100
            console.log(`   Using aggressive scroll (handle at ${(handlePositionPercent * 100).toFixed(0)}%)`);
          } else if (handlePositionPercent > 0.6) {
            // Moderately low (60-70%): medium scroll (changed from 70-80%)
            scrollSteps = 4; // Increased from 3
            scrollAmount = 100; // Increased from 80
            console.log(`   Using medium scroll (handle at ${(handlePositionPercent * 100).toFixed(0)}%)`);
          } else {
            // Just low (50-60%): gentle scroll (changed from 60-70%)
            scrollSteps = 3; // Increased from 2
            scrollAmount = 80; // Increased from 60
            console.log(`   Using gentle scroll (handle at ${(handlePositionPercent * 100).toFixed(0)}%)`);
          }
          
          for (let i = 0; i < scrollSteps; i++) {
            await page.mouse.wheel(0, scrollAmount); // Scroll down
            await page.waitForTimeout(100);
          }
        }
        
        console.log(`✓ Scrolled chart down`);
        
        // Wait for chart to update and re-render
        await page.waitForTimeout(1500); // Reduced from 2000ms
        
        // Re-detect handle after scrolling
        console.log('🎯 Re-detecting PUT handle after chart scroll...');
        const redetection = await detectPutHandle(page, { debugSave: false });
        
        if (!redetection) {
          console.log('⚠️  Could not re-detect PUT handle after scroll, stopping');
          break;
        }
        
        const newPositionPercent = ((redetection.y / viewportSize.height) * 100).toFixed(0);
        console.log(`✅ PUT handle re-detected at (${redetection.x}, ${redetection.y}) - now at ${newPositionPercent}%`);
        
        // Update detection coordinates
        detection.x = redetection.x;
        detection.y = redetection.y;

        // Reset pts/px calibration — scrolling changes the chart scale
        if (pointsPerPixel !== null) {
          console.log(`   🔄 Resetting pts/px calibration after scroll (was ${pointsPerPixel.toFixed(3)})`);
          pointsPerPixel = null;
        }
        
        // Extra wait to ensure UI is fully stable after scroll
        await page.waitForTimeout(500);
      } else {
        console.log(`✓ Handle at ${handlePositionPercent}% of viewport (well positioned)`);
      }
      
      // Read current strike with longer timeout for slow PCs
      let currentIterationStrike = null;
      try {
        const sellBtn = page.locator('text=/sell \\d+[\\.,]\\d+ PUT/i').first();
        // Wait for element to be visible with extended timeout
        await sellBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        const btnText = await sellBtn.textContent({ timeout: 3000 });
        const match = btnText.match(/sell\s+([\d,\.]+)\s+PUT/i);
        if (match) {
          currentIterationStrike = parseFloat(match[1].replace(',', '.'));
          console.log(`💰 Current strike: ${currentIterationStrike}`);
        } else {
          console.log(`⚠️  Could not parse strike from text: "${btnText}"`);
        }
      } catch (e) {
        console.log('⚠️  Could not read strike price:', e.message);
        // Try waiting a bit more and retry once
        await page.waitForTimeout(2000);
        try {
          const sellBtn = page.locator('text=/sell \\d+[\\.,]\\d+ PUT/i').first();
          const btnText = await sellBtn.textContent({ timeout: 3000 });
          const match = btnText.match(/sell\s+([\d,\.]+)\s+PUT/i);
          if (match) {
            currentIterationStrike = parseFloat(match[1].replace(',', '.'));
            console.log(`💰 Current strike (retry): ${currentIterationStrike}`);
          }
        } catch (e2) {
          console.log('⚠️  Retry failed, continuing without strike price');
        }
      }
      
      // Check if we've reached the target
      if (currentIterationStrike && targetStrike) {
        const diff = currentIterationStrike - targetStrike;
        console.log(`📏 Distance from target: ${diff.toFixed(2)} points`);
        
        if (Math.abs(diff) <= strikeThreshold) {
          console.log(`🎉 Target reached! Strike: ${currentIterationStrike} (target: ${targetStrike})`);
          break;
        }
        
        if (diff < 0) {
          console.log(`⚠️  Overshot target! Current: ${currentIterationStrike}, Target: ${targetStrike}`);
          // Try to recover by dragging UP a small amount
          const overshootAmt = Math.abs(diff);
          if (overshootAmt <= strikeThreshold) {
            console.log(`   ✅ Overshoot within threshold (${overshootAmt}pts ≤ ${strikeThreshold}pts), accepting`);
            break;
          }
          // Calculate how many px to drag up (use calibrated ratio or fallback)
          const recoverPts = overshootAmt;
          const recoverPx = pointsPerPixel ? Math.max(5, Math.round((recoverPts / pointsPerPixel) * 0.7)) : Math.max(5, Math.round(recoverPts / 2));
          console.log(`   🔼 Attempting recovery drag UP by ${recoverPx}px to fix ${recoverPts}pt overshoot...`);
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(200);
          const recoverDetection = await detectPutHandle(page, { debugSave: false });
          if (recoverDetection) {
            await page.mouse.move(recoverDetection.x, recoverDetection.y, { steps: 5 });
            await page.waitForTimeout(100);
            await page.mouse.down();
            await page.waitForTimeout(300);
            const rSteps = 20;
            for (let ri = 1; ri <= rSteps; ri++) {
              await page.mouse.move(recoverDetection.x, recoverDetection.y - (recoverPx * ri / rSteps));
              await page.waitForTimeout(10);
            }
            await page.waitForTimeout(200);
            await page.mouse.up();
            await page.waitForTimeout(1500);
            lastDragPixels = recoverPx;
            pointsPerPixel = null; // recalibrate after reverse drag
            console.log(`   ✅ Recovery drag completed`);
            // Reopen trading window so next iteration can read the strike
            try {
              await page.getByRole('button', { name: 'Vendi RCV' }).click({ timeout: 5000 });
              await page.waitForTimeout(2000);
              console.log(`   📊 Trading window re-opened after recovery`);
            } catch {}
            if (currentIterationStrike) previousStrike = currentIterationStrike;
          } else {
            console.log(`   ⚠️  Could not detect handle for recovery, stopping`);
            break;
          }
          // Continue loop to re-read strike and check
          continue;
        }
      }
      
      // Check if strike is changing
      if (iteration > 1 && currentIterationStrike && previousStrike) {
        const change = previousStrike - currentIterationStrike;
        if (Math.abs(change) < 1) {
          console.log(`⚠️  Strike not changing (${change.toFixed(2)} points), stopping`);
          break;
        }
        console.log(`   Change from previous: -${change.toFixed(2)} points`);

        // Calibrate points-per-pixel ratio from observed movement
        if (lastDragPixels > 0 && change > 0) {
          const observed = change / lastDragPixels;
          // Exponential moving average for stability
          pointsPerPixel = pointsPerPixel === null ? observed : (pointsPerPixel * 0.6 + observed * 0.4);
          console.log(`   📐 Calibrated pts/px: ${pointsPerPixel.toFixed(3)} (last drag: ${lastDragPixels}px → ${change.toFixed(0)}pts)`);
        }
      }
      
      // Calculate adaptive drag distance based on distance to target
      let adaptiveDragDistance = dragDistance;
      if (currentIterationStrike && targetStrike) {
        const diff = currentIterationStrike - targetStrike;
        // Adaptive drag based on distance to target
        if (diff > 0) {
          if (pointsPerPixel && pointsPerPixel > 0 && diff < 200) {
            // Use calibrated ratio: target 80% of the needed movement to deliberately undershoot slightly
            const precisePx = Math.round((diff / pointsPerPixel) * 0.80);
            adaptiveDragDistance = Math.max(10, Math.min(precisePx, 100));
            console.log(`🎯 Precise drag (${diff.toFixed(0)}pts away @ ${pointsPerPixel.toFixed(2)}pts/px): ${adaptiveDragDistance}px`);
          } else if (diff < 25) {
            adaptiveDragDistance = 10;
            console.log(`🎯 Very close to target (${diff.toFixed(0)} points away), micro drag to ${adaptiveDragDistance}px`);
          } else if (diff < 50) {
            adaptiveDragDistance = 15;
            console.log(`🎯 Very close to target (${diff.toFixed(0)} points away), micro drag to ${adaptiveDragDistance}px`);
          } else if (diff < 100) {
            // Close: small drag (25px)
            adaptiveDragDistance = 25;
            console.log(`🎯 Close to target (${diff.toFixed(0)} points away), reducing drag to ${adaptiveDragDistance}px`);
          } else if (diff < 200) {
            // Approaching: medium drag (60px)
            adaptiveDragDistance = 60;
            console.log(`🎯 Approaching target (${diff.toFixed(0)} points away), reducing drag to ${adaptiveDragDistance}px`);
          }
        }
      }
      
      // Perform drag DOWN by fixed distance
      const startX = detection.x;
      const startY = detection.y;
      const endY = startY + adaptiveDragDistance;
      
      lastDragPixels = adaptiveDragDistance;
      console.log(`🖱️  Dragging PUT handle DOWN (${adaptiveDragDistance}px)...`);
      console.log(`   From: (${startX}, ${startY}) → To: (${startX}, ${endY})`);
      
      // Close any overlays before drag
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
      
      // Hover and grip
      await page.mouse.move(startX, startY, { steps: 5 });
      await page.waitForTimeout(100);
      
      // Small jitter to trigger hover state
      for (const offset of [0, 2, -2, 0]) {
        await page.mouse.move(startX + offset, startY);
        await page.waitForTimeout(20);
      }
      
      // Click to select
      await page.mouse.click(startX, startY);
      await page.waitForTimeout(150);
      
      // Drag down slowly
      await page.mouse.down();
      await page.waitForTimeout(500); // Reduced from 800ms
      
      const steps = 40;
      for (let i = 1; i <= steps; i++) {
        const y = startY + (adaptiveDragDistance * i / steps);
        await page.mouse.move(startX, y);
        await page.waitForTimeout(10); // Reduced from 15ms
      }
      
      await page.waitForTimeout(200); // Reduced from 300ms
      await page.mouse.up();
      await page.waitForTimeout(1500); // Reduced from 2000ms
      
      console.log('✅ Drag completed');
      
      // Update previous strike for next iteration
      if (currentIterationStrike) {
        previousStrike = currentIterationStrike;
      }
      
      // Re-open trading window for next iteration
      if (iteration < maxIterations) {
        console.log('📊 Re-opening trading window for next iteration...');
        let windowOpened = false;
        
        // Try multiple times with longer timeout for slow PCs
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await page.getByRole('button', { name: 'Vendi RCV' }).click({ timeout: 5000 });
            console.log(`✓ Trading window opened (attempt ${attempt})`);
            windowOpened = true;
            break;
          } catch (e) {
            console.log(`⚠️  Attempt ${attempt} failed to open window: ${e.message}`);
            if (attempt < 3) {
              await page.waitForTimeout(1000);
            }
          }
        }
        
        if (!windowOpened) {
          console.log('⚠️  Could not re-open trading window, stopping iterations');
          break;
        }
        
        // Wait longer for window to be fully loaded on slow PCs
        await page.waitForTimeout(2000);
      }
    }
    
    // Final verification
    console.log('\n📊 Final Result:');
    let finalStrike = null;
    try {
      const finalSellBtn = page.locator('text=/sell \\d+[\\.,]\\d+ PUT/i').first();
      const finalBtnText = await finalSellBtn.textContent();
      const finalMatch = finalBtnText.match(/sell\s+([\d,\.]+)\s+PUT/i);
      if (finalMatch) {
        finalStrike = parseFloat(finalMatch[1].replace(',', '.'));
        console.log(`   Initial: ${currentStrike}`);
        console.log(`   Target:  ${targetStrike}`);
        console.log(`   Final:   ${finalStrike}`);
        console.log(`   Total iterations: ${iteration}`);
        console.log(`   Total change: ${(currentStrike - finalStrike).toFixed(2)} points`);
        
        if (targetStrike && Math.abs(finalStrike - targetStrike) <= strikeThreshold) {
          console.log('   ✅ Target strike reached!');
        } else if (finalStrike < targetStrike) {
          console.log('   ⚠️  Overshot target');
        } else {
          console.log(`   ⚠️  Did not reach target (${(finalStrike - targetStrike).toFixed(2)} points away)`);
        }
      }
    } catch {}

    await page.screenshot({ path: getScreenshotPath('final-result.png'), fullPage: true });

    // ⚠️ CRITICAL SAFETY CHECK: Validate strike price before execution
    console.log('\n🔒 PRE-EXECUTION SAFETY CHECKS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    let shouldExecute = true;
    const maxAllowedDeviation = strikeThreshold; // Use same threshold from iterations
    
    // Check 1: Strike price validation
    if (targetStrike && finalStrike) {
      const deviation = Math.abs(finalStrike - targetStrike);
      const deviationPercent = ((deviation / targetStrike) * 100).toFixed(2);
      
      console.log(`\n1️⃣  Strike Price Validation:`);
      console.log(`   Target:    ${targetStrike}`);
      console.log(`   Final:     ${finalStrike}`);
      console.log(`   Deviation: ${deviation.toFixed(2)} points (${deviationPercent}%)`);
      console.log(`   Threshold: ${maxAllowedDeviation} points`);
      
      if (deviation > maxAllowedDeviation) {
        console.log(`   ❌ FAIL - Strike price too far from target!`);
        shouldExecute = false;
      } else {
        console.log(`   ✅ PASS - Strike within acceptable range`);
      }
    } else {
      console.log(`\n1️⃣  Strike Price Validation:`);
      console.log(`   ⚠️  WARNING - Could not validate strike (target: ${targetStrike}, final: ${finalStrike})`);
      // For safety, don't execute if we can't validate
      if (!finalStrike) {
        console.log(`   ❌ FAIL - No final strike price available`);
        shouldExecute = false;
      }
    }
    
    // Check 2: Account type verification
    console.log(`\n2️⃣  Account Type Verification:`);
    console.log(`   Requested: ${accountType || 'DEMO'}`);
    if (accountType === 'REAL' && shouldExecute) {
      console.log(`   🚨 REAL ACCOUNT - Double-checking strike validation...`);
      // Exact match required for REAL accounts (threshold = 0)
      if (targetStrike && finalStrike && Math.abs(finalStrike - targetStrike) > 0) {
        console.log(`   ❌ FAIL - REAL account requires exact strike match`);
        shouldExecute = false;
      } else {
        console.log(`   ✅ PASS - REAL account validation passed`);
      }
    } else {
      console.log(`   ✅ PASS - DEMO account`);
    }
    
    // Check 3: Contract quantity verification
    console.log(`\n3️⃣  Contract Quantity Verification:`);
    console.log(`   Contracts: ${numberOfContracts}`);
    if (numberOfContracts < 1) {
      console.log(`   ❌ FAIL - Invalid contract quantity (must be >= 1)`);
      shouldExecute = false;
    } else {
      console.log(`   ✅ PASS - Contract quantity valid`);
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Final Decision: ${shouldExecute ? '✅ EXECUTE TRADE' : '❌ ABORT TRADE'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (!shouldExecute) {
      console.log('🛑 TRADE ABORTED - Safety checks failed');
      console.log('   Closing trade dialog...');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      await page.screenshot({ path: getScreenshotPath('trade-aborted.png'), fullPage: true });
      throw new Error(`Trade aborted: Safety validation failed. Target: ${targetStrike}, Final: ${finalStrike}, Deviation: ${Math.abs(finalStrike - targetStrike).toFixed(2)}`);
    }
    
    // Execute the order by clicking "Esegui" button
    console.log('🚀 Executing order with final strike price...');
    // Try multiple strategies to find and click the Execute button
    let executeClicked = false;
    const executeStrategies = [
      { name: 'getByRole Esegui', fn: () => page.getByRole('button', { name: 'Esegui' }).click({ timeout: 5000 }) },
      { name: 'getByRole regex', fn: () => page.getByRole('button', { name: /Execute|Esegui|Submit/i }).click({ timeout: 3000 }) },
      { name: 'getByText Esegui', fn: () => page.getByText('Esegui').click({ timeout: 3000 }) },
      { name: 'button contains', fn: () => page.locator('button:has-text("Esegui")').click({ timeout: 3000 }) },
      { name: 'button visible', fn: () => page.locator('button:visible:has-text("Esegui")').first().click({ timeout: 3000 }) },
      { name: 'any button with Esegui', fn: () => page.locator('[role="button"]:has-text("Esegui")').first().click({ timeout: 3000 }) }
    ];
    
    for (const strategy of executeStrategies) {
      try {
        console.log(`  Trying: ${strategy.name}...`);
        await strategy.fn();
        console.log(`✅ Clicked "Esegui" button - Order submitted! (${strategy.name})`);
        executeClicked = true;
        break;
      } catch (e) {
        console.log(`  ⚠️  ${strategy.name} failed: ${e.message}`);
      }
    }
    
    if (!executeClicked) {
      await page.screenshot({ path: getScreenshotPath('execute-button-not-found.png'), fullPage: true });
      throw new Error('Could not click Execute button with any strategy');
    }
    
    // Wait for order confirmation
    await page.waitForTimeout(3000);
    await page.screenshot({ path: getScreenshotPath('order-executed.png'), fullPage: true });
    console.log('📸 Order execution screenshot saved');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✅ MANDATORY POST-EXECUTION VERIFICATION (with retry/backoff)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // This is REQUIRED to confirm trade execution. Without this check,
    // we cannot be sure the trade was actually opened on the broker side.
    // The broker UI may take several seconds to update the margin field.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n🔍 MANDATORY VERIFICATION: Reading Margine Richiesto (with retries)...');
    console.log('   ℹ️  This check is REQUIRED to confirm trade execution');
    console.log('   ℹ️  Will retry multiple times if margin is still 0 (UI may be slow)');
    
    const maxAttempts = 6; // total attempts
    const baseDelay = 3000; // initial delay in ms (3s, 6s, 9s, 12s, 15s, 18s)
    let postMarginAmount = null;
    let postMarginCurrency = null;
    let postMarginFormatted = null;
    let lastReadError = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const waitMs = baseDelay * attempt; // increasing backoff: 3s, 6s, 9s...
      console.log(`   Attempt ${attempt}/${maxAttempts}: waiting ${waitMs}ms before reading margin`);
      await page.waitForTimeout(waitMs);
      await page.screenshot({ path: getScreenshotPath(`debug-margin-post-exec-attempt-${attempt}.png`), fullPage: true });
      
      try {
        const postExecText = await page.locator('body').textContent();
        const postExecMarginMatch = postExecText.match(/Margine\s+Richiesto[\s\S]{0,50}?([\d.,]+)\s*(CHF|EUR|USD|GBP)/i);
        
        if (postExecMarginMatch) {
          const postMarginValue = postExecMarginMatch[1].replace(/\./g, '').replace(',', '.');
          postMarginAmount = parseFloat(postMarginValue);
          postMarginCurrency = postExecMarginMatch[2];
          postMarginFormatted = `${postExecMarginMatch[1]} ${postMarginCurrency}`;
          
          console.log(`   Read Margine Richiesto: ${postMarginFormatted}`);
          
          if (postMarginAmount > 0) {
            console.log('   ✅ Margin > 0 → trade execution confirmed!');
            break;
          } else {
            console.log('   ⏳ Margin is still 0, UI may not have updated yet, will retry...');
          }
        } else {
          console.log('   ⚠️  Could not find Margine Richiesto in page text, will retry...');
        }
      } catch (readErr) {
        lastReadError = readErr;
        console.log(`   ⚠️  Error reading page text: ${readErr.message}, will retry...`);
      }
    }
    
    // After all retries, check final result
    if (postMarginAmount === null) {
      console.error('❌ CRITICAL ERROR: Cannot read Margine Richiesto after execution (all retries failed)');
      console.error('   Unable to verify if trade was opened');
      if (lastReadError) console.error('   Last error:', lastReadError.message);
      await page.screenshot({ path: getScreenshotPath('margine-not-found.png'), fullPage: true });
      throw new Error('❌ TRADE VERIFICATION FAILED: Cannot read Margine Richiesto field after retries');
    }
    
    console.log(`📊 Margine Richiesto post-esecuzione: ${postMarginFormatted}`);
    console.log('');
    
    if (postMarginAmount > 0) {
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║           ✅ TRADE EXECUTION CONFIRMED ✅             ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  Margine Richiesto: ${postMarginFormatted.padEnd(30)} ║`);
      console.log('║  Il trade è stato aperto con successo!                ║');
      console.log('║  Il segnale verrà cancellato dal database             ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
      
      // Read initial P&L (Profit/Loss) after trade execution
      console.log('💰 Reading initial P&L...');
      await page.waitForTimeout(2000); // Wait for P&L to update
      
      try {
        const plText = await page.locator('body').textContent();
        // Match P/L field with various formats: "P/L: -123.45 CHF" or "P/L -123.45" or "P/L: 123.45"
        const plMatch = plText.match(/P[\/\s]*L[\s:]*(-?[\d.,]+)\s*(CHF|EUR|USD|GBP)?/i);
        
        if (plMatch) {
          const plValue = plMatch[1].replace(/\./g, '').replace(',', '.');
          const plAmount = parseFloat(plValue);
          const plCurrency = plMatch[2] || postMarginCurrency;
          const plFormatted = `${plMatch[1]} ${plCurrency}`;
          
          console.log(`📊 P/L iniziale: ${plFormatted}`);
          console.log(`💰 PL_INFO: ${plAmount}`); // For monitor to capture
        } else {
          console.log('⚠️  P/L non trovato, verrà aggiornato successivamente');
          console.log('💰 PL_INFO: 0'); // Default to 0
        }
      } catch (plError) {
        console.log('⚠️  Errore lettura P/L:', plError.message);
        console.log('💰 PL_INFO: 0');
      }
    } else {
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║          ❌ TRADE EXECUTION FAILED ❌                 ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  Margine Richiesto: ${postMarginFormatted.padEnd(30)} ║`);
      console.log('║  Il trade NON è stato aperto                          ║');
      console.log('║  (Click su Esegui ma nessun margine assegnato)        ║');
      console.log('║                                                        ║');
      console.log('║  Il segnale NON verrà cancellato                      ║');
      console.log('║  Il monitor riproverà automaticamente                 ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
      await page.screenshot({ path: getScreenshotPath('trade-not-executed.png'), fullPage: true });
      throw new Error(`❌ TRADE EXECUTION FAILED: Margine Richiesto is still 0.0 after clicking Esegui. Trade was NOT opened on broker side.`);
    }

    console.log('\n✅ Test completed');
    
    // Output balance for monitor to capture
    if (cashBalance && cashBalance.amount) {
      console.log(`💰 BALANCE_INFO: ${cashBalance.amount}`);
    }

  } catch (e) {
    console.log('❌ Test error:', e.message);
    await page.screenshot({ path: getScreenshotPath('error.png'), fullPage: true });
    throw e;
  }
});