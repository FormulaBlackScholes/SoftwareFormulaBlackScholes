// Playwright Configuration
import { TEST_RESULTS_DIR } from './utils/paths.js';

// @ts-check
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './tests',
  timeout: 600000, // 10 minutes (increased for slow PCs and drag operations)
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  outputDir: TEST_RESULTS_DIR,
  
  use: {
    // CRITICAL: headless: false required for Cloudflare Turnstile bypass on Windows
    headless: false,
    viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'off',
    
    // Fake Linux User Agent to bypass Windows detection
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    
    // Bypass CSP to allow script injection
    bypassCSP: true,
    
    launchOptions: {
      // PRODUCTION: Browser off-screen (invisible but not headless for Cloudflare)
      // Set DEBUG_BROWSER=true environment variable to see browser during debugging
      args: process.env.DEBUG_BROWSER === 'true' ? [
        '--window-position=0,0',
        '--window-size=1920,1080',
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-default-browser-check',
        '--disable-extensions',
        '--force-device-scale-factor=1',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ] : [
        '--window-position=-2000,-2000', // Off-screen with negative coordinates (invisible but not headless)
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-default-browser-check',
        '--disable-extensions',
        '--force-device-scale-factor=1',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      // Force ignoreDefaultArgs to prevent hidden window
      ignoreDefaultArgs: ['--hide-scrollbars', '--enable-automation']
    }
  },

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        channel: 'chrome',
      },
    },
  ],
};

export default config;
