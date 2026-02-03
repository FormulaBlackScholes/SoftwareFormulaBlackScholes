/**
 * Maximize browser window using Chrome DevTools Protocol
 * @param {import('@playwright/test').Page} page - Playwright page object
 */
export async function maximizeWindow(page) {
  try {
    // Get the CDP session
    const client = await page.context().newCDPSession(page);
    
    // Get window bounds
    const { windowId } = await client.send('Browser.getWindowForTarget');
    
    // Set window to maximized state
    await client.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'maximized' }
    });
    
    console.log('✅ Window maximized via CDP');
  } catch (error) {
    console.log(`⚠️ Failed to maximize window: ${error.message}`);
  }
}
