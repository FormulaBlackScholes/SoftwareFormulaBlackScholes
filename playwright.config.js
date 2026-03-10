// Playwright Configuration
import { TEST_RESULTS_DIR } from './utils/paths.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CF_COOKIES_FILE = process.env.CF_COOKIES_PATH || path.join(__dirname, '.cf-cookies.json');
console.log('📁 CF cookies path:', CF_COOKIES_FILE, '| exists:', fs.existsSync(CF_COOKIES_FILE));

// Detect Chrome executable path - try standard locations, fallback to bundled Chromium
function findChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null,
    process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google\\Chrome\\Application\\chrome.exe') : null,
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        console.log(`[config] Using Chrome at: ${p}`);
        return p;
      }
    } catch {}
  }
  console.log('[config] Chrome not found in standard paths, using bundled Chromium');
  return null;
}

const chromePath = findChromePath();

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
    
    // Do NOT override userAgent - let real Chrome use its native Windows UA
    // Overriding to Linux UA on a Windows Chrome creates a detectable mismatch
    
    // Inject CF clearance cookies saved by warm-up script (see warm-up-cloudflare.ps1)
    storageState: fs.existsSync(CF_COOKIES_FILE) ? CF_COOKIES_FILE : undefined,
    
    launchOptions: {
      // Use real Chrome if found (better Cloudflare bypass), else bundled Chromium
      ...(chromePath ? { executablePath: chromePath } : {}),
      // PRODUCTION: Browser off-screen (invisible but not headless for Cloudflare)
      // Set DEBUG_BROWSER=true environment variable to see browser during debugging
      args: [
        ...(process.env.DEBUG_BROWSER === 'true' ? [
          '--window-position=0,0',
          '--window-size=1920,1080',
          '--start-maximized',
        ] : [
          '--window-position=5000,5000',
          '--window-size=1920,1080',
        ]),
        '--disable-blink-features=AutomationControlled',
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
        // executablePath is set in launchOptions above (real Chrome if found, else bundled Chromium)
      },
    },
  ],
};

export default config;

