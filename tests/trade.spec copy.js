// tests/trade.spec.js
// Simplified trading test with HSV color-based detection
import 'dotenv/config';
import { test } from '@playwright/test';
import { detectPutHandle } from '../utils/hsvDetector.js';
import { getScreenshotPath } from '../utils/paths.js';

test('Trade US500CASH with PUT option', async ({ page }) => {
  test.setTimeout(360000); // 6 minutes (increased for slow PCs and drag operations)
  
  // Track execution time for monitoring
  const startTime = Date.now();
  const logElapsedTime = () => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return `[${elapsed}s]`;
  };

  const USER = process.env.TRADE_USER;
  const PASS = process.env.TRADE_PASSWORD;
  
  // Read signal parameters from environment variables (set by monitor-api.js)
  const targetStrike = parseFloat(process.env.TRADE_STRIKE);
  const expiryDays = process.env.TRADE_EXPIRY_DAYS;
  const expiryTime = process.env.TRADE_EXPIRY_TIME;
  const accountType = process.env.TRADE_ACCOUNT_TYPE;
  
  // Extract hour from time (e.g., "21:00:00" -> "21:00")
  const expiryHourMinute = expiryTime?.substring(0, 5) || '21:00'; // "21:00"
  
  // Compose the expiry selector text: "21:00(26D)"
  const expirySelector = `${expiryHourMinute}(${expiryDays}D)`;
  
  console.log('\n📊 Trade Parameters:');
  console.log(`   Target Strike: ${targetStrike}`);
  console.log(`   Expiry: ${expirySelector}`);
  console.log(`   Account Type: ${accountType || 'NOT SET - DEFAULTING TO DEMO'}`);
  console.log(`   User: ${USER}\n`);
  
  // Validate required parameters before starting
  console.log('🔍 Validating required parameters...');
  const validationErrors = [];
  
  if (!USER || !PASS) {
    validationErrors.push('Missing credentials (TRADE_USER or TRADE_PASSWORD)');
  }
  
  if (!targetStrike || isNaN(targetStrike) || targetStrike <= 0) {
    validationErrors.push(`Invalid target strike: ${targetStrike}`);
  }
  
  if (!expiryDays || expiryDays === 'undefined') {
    validationErrors.push(`Invalid expiry days: ${expiryDays}`);
  }
  
  if (!expiryTime || expiryTime === 'undefined') {
    validationErrors.push(`Invalid expiry time: ${expiryTime}`);
  }
  
  if (validationErrors.length > 0) {
    console.error('❌ Parameter validation failed:');
    validationErrors.forEach(err => console.error(`   - ${err}`));
    throw new Error(`Invalid parameters: ${validationErrors.join(', ')}`);
  }
  console.log('✅ All required parameters valid\n');
  
  // Validate account type
  if (!accountType || (accountType !== 'DEMO' && accountType !== 'REAL')) {
    console.warn(`⚠️  WARNING: Invalid or missing account type "${accountType}", defaulting to DEMO`);
  }

  try {
    // Login with robust handling (from working version)
    console.log('🔐 Logging in...');
    await page.goto('https://avaoptions.avatrade.com/it/login', { waitUntil: 'domcontentloaded' });
    console.log('✓ Page loaded, waiting for Cloudflare...');
    
    // Wait longer for Cloudflare Turnstile to complete (15-20 seconds)
    await page.waitForTimeout(15000);
    console.log('✓ Cloudflare wait complete');
    
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
        // Look for REAL/Live account selectors
        accountSelectors = [
          'text=REAL',
          'text=Real',
          'text=Live',
          'button:has-text("REAL")',
          'button:has-text("Real")',
          'button:has-text("Live")',
          '[class*="real"]',
          '[class*="live"]'
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
          if (await element.count() > 0) {
            // Additional check: if looking for specific account type, verify the element text
            const elementText = await element.textContent().catch(() => '');
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

    // Read cash balance
    console.log('💰 Reading cash balance...');
    let cashBalance = null;
    try {
      // Wait a bit for UI to fully load
      await page.waitForTimeout(2000);
      
      // Try multiple strategies to find and read the cash balance
      
      // Strategy 1: Find element containing "Saldo" or "Cash" text
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
            console.log(`   Found balance element: "${balanceText}"`);
            
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
        // Examples: "Saldo cash9.969,50 CHF", "9.969,50 CHF", "Balance: 9,969.50 USD"
        const patterns = [
          /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*([A-Z]{3})/i,  // European or US format with currency
          /([A-Z]{3})\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/i   // Currency first
        ];
        
        for (const pattern of patterns) {
          const match = balanceText.match(pattern);
          if (match) {
            let amount, currency;
            if (match[2].length === 3 && /[A-Z]{3}/.test(match[2])) {
              // First pattern: amount then currency
              amount = match[1];
              currency = match[2];
            } else {
              // Second pattern: currency then amount
              currency = match[1];
              amount = match[2];
            }
            
            // Convert to number (handle both European and US formats)
            // European: 9.969,50 → 9969.50
            // US: 9,969.50 → 9969.50
            let numericAmount;
            if (amount.includes(',') && amount.includes('.')) {
              // Has both, assume European format
              numericAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
            } else if (amount.includes(',')) {
              // Check if it's decimal separator or thousands
              const parts = amount.split(',');
              if (parts[parts.length - 1].length === 2) {
                // Likely decimal separator (European)
                numericAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
              } else {
                // Likely thousands separator (US)
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
        console.log('⚠️  Could not find or parse cash balance');
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
        // Calculate: contracts = floor((0.5 * balance) / margin)
        const calculatedContracts = Math.floor((0.5 * cashBalance.amount) / marginPerContract);
        
        // Safety limits: min 1, max 10
        numberOfContracts = Math.max(1, Math.min(10, calculatedContracts));
        
        console.log(`   📊 Account balance: ${cashBalance.amount} ${cashBalance.currency}`);
        console.log(`   💰 Margin per contract: ${marginPerContract} ${cashBalance.currency} (${marginSource})`);
        console.log(`   🧮 Calculation: floor((0.5 × ${cashBalance.amount}) / ${marginPerContract}) = ${calculatedContracts}`);
        console.log(`   ✅ Final contracts (with limits 1-10): ${numberOfContracts}`);
      } else {
        console.log(`   ⚠️  Missing balance data, using fixed fallback: ${numberOfContracts}`);
      }
    } catch (e) {
      console.log(`   ⚠️  Error calculating contracts: ${e.message}, using fixed fallback: ${numberOfContracts}`);
    }

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
      
      await page.waitForTimeout(1500);

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
      
      // Click US500CASH from results
      await page.getByText('US500CASH').first().click({ timeout: 10000 });
      console.log('✓ Selected US500CASH');

      // Close instruments panel
      await page.keyboard.press('Escape').catch(() => {});
      await page.locator('.instruments__headerArrow > svg, .instruments__headerArrow, button[aria-label="close"]').first().click().catch(() => {});
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
    console.log(`⏰ Selecting expiry: ${expirySelector}`);
    await page.getByText(expirySelector).click();
    console.log('✓ Expiry selected');
    
    // Set quantity with detailed logging
    console.log('\n📊 Setting up quantity and trade calculator...');
    
    try {
      console.log('  Step 1: Clicking Quantità element to open calculator...');
      // Try multiple strategies to click the Quantità element
      let calculatorOpened = false;
      
      // Strategy 1: Click the calculator icon (the last img element in the form with Quantità)
      try {
        await page.locator('form').filter({ hasText: 'Quantità' }).getByRole('img').last().click({ timeout: 5000 });
        console.log('  ✓ Calculator opened (clicked calculator icon in form)');
        calculatorOpened = true;
      } catch (e) {
        console.log('  ⚠️  Form calculator icon failed:', e.message);
      }
      
      // Strategy 2: Try the specific nth(5) selector
      if (!calculatorOpened) {
        try {
          await page.locator('div').filter({ hasText: 'Quantità' }).nth(5).click({ timeout: 3000 });
          console.log('  ✓ Calculator opened (using nth(5) selector)');
          calculatorOpened = true;
        } catch (e) {
          console.log('  ⚠️  nth(5) selector failed:', e.message);
        }
      }
      
      // Strategy 3: Try clicking by SVG class name
      if (!calculatorOpened) {
        try {
          await page.locator('svg.chartTradePanel__btnCalculator').click({ timeout: 3000 });
          console.log('  ✓ Calculator opened (using SVG class selector)');
          calculatorOpened = true;
        } catch (e) {
          console.log('  ⚠️  SVG class selector failed:', e.message);
        }
      }
      
      // Strategy 4: Try simple text selector
      if (!calculatorOpened) {
        try {
          await page.getByText('Quantità').click({ timeout: 3000 });
          console.log('  ✓ Calculator opened (using getByText selector)');
          calculatorOpened = true;
        } catch (e) {
          console.log('  ⚠️  getByText selector failed:', e.message);
        }
      }
      
      if (!calculatorOpened) {
        console.error('  ❌ Failed to open calculator with all strategies');
        await page.screenshot({ path: getScreenshotPath('error-calculator-not-opened.png'), fullPage: true });
        throw new Error('Could not open quantity calculator');
      }
      
      await page.waitForTimeout(1500);
      
      console.log(`  Step 2: Setting quantity value to ${numberOfContracts} contracts...`);
      
      // Try multiple strategies to set the quantity
      let quantitySet = false;
      const contractsStr = numberOfContracts.toString();
      
      // Strategy 1: Use the slider control (most direct method)
      try {
        const slider = page.getByRole('slider');
        await slider.waitFor({ state: 'visible', timeout: 5000 });
        console.log('  ✓ Found quantity slider');
        
        // Set value using fill method
        await slider.fill(contractsStr);
        console.log(`  ✓ Quantity set to ${numberOfContracts} via slider`);
        quantitySet = true;
        
        await page.waitForTimeout(500);
      } catch (e) {
        console.log('  ⚠️  Slider method failed:', e.message);
      }
      
      // Strategy 2: Try finding and using text input if slider fails
      if (!quantitySet) {
        try {
          console.log('  ℹ️  Trying text input fallback...');
          const textInput = page.locator('.tradeCalculator__input, .tradeCalculator input[type="text"]').first();
          await textInput.waitFor({ state: 'visible', timeout: 3000 });
          await textInput.click();
          await page.waitForTimeout(200);
          await textInput.fill('');
          await textInput.fill(contractsStr);
          console.log(`  ✓ Quantity set to ${numberOfContracts} via text input`);
          quantitySet = true;
          await page.waitForTimeout(500);
        } catch (e) {
          console.log('  ⚠️  Text input fallback failed:', e.message);
        }
      }
      
      // Strategy 3: Try keyboard input as last resort
      if (!quantitySet) {
        try {
          console.log('  ℹ️  Trying keyboard input as last resort...');
          // Click somewhere in the calculator area to focus it
          await page.locator('[class*="calculator"]').first().click();
          await page.waitForTimeout(200);
          // Clear and type
          await page.keyboard.press('Control+A');
          await page.keyboard.type(contractsStr);
          console.log(`  ✓ Quantity set to ${numberOfContracts} via keyboard`);
          quantitySet = true;
          await page.waitForTimeout(500);
        } catch (e) {
          console.log('  ⚠️  Keyboard input failed:', e.message);
        }
      }
      
      if (!quantitySet) {
        console.error('  ❌ Could not set quantity with any method');
        await page.screenshot({ path: getScreenshotPath('error-quantity-not-set.png'), fullPage: true });
        throw new Error('Failed to set quantity value');
      }
      
      await page.waitForTimeout(500);
      
      console.log('  Step 6: Clicking Applica/Apply button...');
      // Try multiple strategies to click the Apply button
      let applyClicked = false;
      
      // Strategy 1: Try getByRole button with Applica text
      try {
        await page.getByRole('button', { name: /Applica|Apply/i }).click({ timeout: 5000 });
        console.log('  ✓ Apply button clicked (using getByRole)');
        applyClicked = true;
      } catch (e) {
        console.log('  ⚠️  getByRole button failed:', e.message);
      }
      
      // Strategy 2: Try exact text match
      if (!applyClicked) {
        try {
          await page.getByText('Applica', { exact: true }).click({ timeout: 3000 });
          console.log('  ✓ Applica clicked (using getByText)');
          applyClicked = true;
        } catch (e) {
          console.log('  ⚠️  getByText Applica failed:', e.message);
        }
      }
      
      // Strategy 3: Try finding button within the calculator modal
      if (!applyClicked) {
        try {
          await page.locator('.tradeCalculator button:has-text("Applica")').click({ timeout: 3000 });
          console.log('  ✓ Applica clicked (calculator modal button)');
          applyClicked = true;
        } catch (e) {
          console.log('  ⚠️  Calculator modal button failed:', e.message);
        }
      }
      
      // Strategy 4: Press Enter key to submit
      if (!applyClicked) {
        try {
          await textbox.press('Enter');
          console.log('  ✓ Applied by pressing Enter');
          applyClicked = true;
        } catch (e) {
          console.log('  ⚠️  Enter key failed:', e.message);
        }
      }
      
      if (!applyClicked) {
        console.log('  ⚠️  Could not click Apply button, trying to continue anyway...');
        // Try pressing Escape and hope the value was saved
        await page.keyboard.press('Escape');
      }
      
    } catch (error) {
      console.error('  ❌ Error in quantity setup:', error.message);
      await page.screenshot({ path: getScreenshotPath('error-quantity-setup.png'), fullPage: true });
      throw error;
    }
    
    await page.waitForTimeout(1000);
    console.log('✅ Quantity setup complete\n');

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
    const detection = await detectPutHandle(page, { debugSave: true });
    
    if (!detection) {
      console.log('❌ Could not detect PUT handle');
      throw new Error('Detection failed');
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
    const maxIterations = 20;
    const dragDistance = 150; // pixels per drag
    const strikeThreshold = 10; // acceptable difference from target
    const scrollThreshold = 200; // pixels from bottom to trigger scroll
    const scrollAmount = 300; // pixels to scroll down
    
    let iteration = 0;
    let previousStrike = currentStrike;
    
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
      
      // If handle is below 60% of viewport height, scroll chart to reveal more contracts
      if (detection.y > viewportSize.height * 0.6) {
        console.log(`📜 Handle at ${handlePositionPercent}% of viewport (too low), scrolling chart down...`);
        
        // Get canvas element for scrolling and ensure it's valid
        const canvas = page.locator('canvas').first();
        const canvasBox = await canvas.boundingBox();
        
        if (!canvasBox) {
          console.log('⚠️  Canvas not found, trying to scroll anyway with viewport center...');
          // Fallback: use viewport center
          const centerX = viewportSize.width / 2;
          const centerY = viewportSize.height / 2;
          
          const scrollSteps = 5;
          const scrollAmount = 120;
          
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
          
          // Scroll the chart by dispatching wheel events on the canvas
          // This simulates mousewheel scrolling to pan the chart down
          const scrollSteps = 5; // Number of scroll wheel steps
          const scrollAmount = 120; // Delta per step (standard mousewheel delta)
          
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
          break;
        }
      }
      
      // Check if strike is changing
      if (iteration > 1 && currentIterationStrike && previousStrike) {
        const change = previousStrike - currentIterationStrike;
        if (Math.abs(change) < 1) {
          console.log(`⚠️  Strike not changing (${change.toFixed(2)} points), stopping`);
          console.log(`   Strike appears stuck at: ${currentIterationStrike}`);
          
          // If stuck for multiple iterations, this is likely a UI issue
          if (iteration > 3) {
            console.log(`   ⚠️  Strike stuck after ${iteration} iterations - possible UI detection failure`);
          }
          break;
        }
        console.log(`   Change from previous: -${change.toFixed(2)} points`);
        
        // Detect if we're making progress too slowly
        if (targetStrike && Math.abs(change) < 5 && Math.abs(currentIterationStrike - targetStrike) > 100) {
          console.log(`   ⚠️  WARNING: Very slow progress (${change.toFixed(2)} points/iteration)`);
          console.log(`   Still ${(currentIterationStrike - targetStrike).toFixed(2)} points from target`);
          
          // If we're making tiny progress after many iterations, something is wrong
          if (iteration > 10) {
            console.log(`   ⚠️  Too many iterations with minimal progress - stopping`);
            break;
          }
        }
      }
      
      // Calculate adaptive drag distance based on distance to target
      let adaptiveDragDistance = dragDistance;
      if (currentIterationStrike && targetStrike) {
        const diff = currentIterationStrike - targetStrike;
        // Adaptive drag based on distance to target
        if (diff > 0) {
          if (diff < 50) {
            // Very close: tiny drag (30px)
            adaptiveDragDistance = 30;
            console.log(`🎯 Very close to target (${diff.toFixed(0)} points away), micro drag to ${adaptiveDragDistance}px`);
          } else if (diff < 100) {
            // Close: small drag (50px)
            adaptiveDragDistance = 50;
            console.log(`🎯 Close to target (${diff.toFixed(0)} points away), reducing drag to ${adaptiveDragDistance}px`);
          } else if (diff < 200) {
            // Approaching: medium drag (75px)
            adaptiveDragDistance = 75;
            console.log(`🎯 Approaching target (${diff.toFixed(0)} points away), reducing drag to ${adaptiveDragDistance}px`);
          }
        }
      }
      
      // Perform drag DOWN by fixed distance
      const startX = detection.x;
      const startY = detection.y;
      const endY = startY + adaptiveDragDistance;
      
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
      // Extra strict validation for REAL accounts
      if (targetStrike && finalStrike && Math.abs(finalStrike - targetStrike) > (maxAllowedDeviation * 0.5)) {
        console.log(`   ❌ FAIL - REAL account requires tighter tolerance`);
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
    if (numberOfContracts < 1 || numberOfContracts > 10) {
      console.log(`   ❌ FAIL - Invalid contract quantity (must be 1-10)`);
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
    try {
      await page.getByRole('button', { name: 'Esegui' }).click({ timeout: 5000 });
      console.log('✅ Clicked "Esegui" button - Order submitted!');
      
      // Wait for order confirmation
      await page.waitForTimeout(2000);
      await page.screenshot({ path: getScreenshotPath('order-executed.png'), fullPage: true });
      console.log('📸 Order execution screenshot saved');
    } catch (e) {
      console.log('⚠️  Could not click "Esegui" button:', e.message);
      // Try alternative button text
      try {
        await page.getByRole('button', { name: /Execute|Esegui|Submit/i }).click({ timeout: 3000 });
        console.log('✅ Clicked execute button (fallback)');
      } catch (e2) {
        console.log('❌ Failed to execute order:', e2.message);
        throw new Error(`Execution button click failed: ${e2.message}`);
      }
    }

    console.log('\n✅ Test completed');

  } catch (e) {
    console.log('❌ Test error:', e.message);
    await page.screenshot({ path: getScreenshotPath('error.png'), fullPage: true });
    throw e;
  }
});
