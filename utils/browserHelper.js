// utils/browserHelper.js
// Browser helper functions for Playwright tests

/**
 * Maximize browser window if in visible mode (not headless)
 * @param {import('@playwright/test').Page} page - Playwright page instance
 */
export async function maximizeBrowserWindow(page) {
  try {
    // Only maximize if DEBUG_BROWSER is set (browser is visible)
    if (process.env.DEBUG_BROWSER === 'true') {
      await page.evaluate(() => {
        window.moveTo(0, 0);
        window.resizeTo(screen.availWidth, screen.availHeight);
      });
    }
    // In production mode (off-screen), do nothing - already positioned correctly
  } catch (error) {
    // Ignore errors - maximization is optional
    console.log('⚠️  Could not maximize browser window:', error.message);
  }
}

/**
 * Check if browser is running in visible mode
 * @returns {boolean}
 */
export function isVisibleMode() {
  return process.env.DEBUG_BROWSER === 'true';
}

/**
 * Log browser info for debugging
 * @param {import('@playwright/test').Page} page
 */
export async function logBrowserInfo(page) {
  try {
    const browserInfo = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: screen.width,
      screenHeight: screen.height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    }));
    console.log('🌐 Browser Info:', JSON.stringify(browserInfo, null, 2));
  } catch (error) {
    console.log('⚠️  Could not get browser info');
  }
}
