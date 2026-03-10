/**
 * CF Warm-up: opens the AvaTrade login page visibly, waits for the user to
 * click "Verify you are human", then saves the storageState (CF cookies) to
 * .cf-cookies.json so subsequent tests can reuse them.
 *
 * Run with: npx playwright test tests/warm-cf.spec.js --headed
 * Or triggered by the Electron app "Bypass Cloudflare" button.
 */
import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CF_COOKIES_FILE = process.env.CF_COOKIES_PATH ||
  path.join(__dirname, '..', '.cf-cookies.json');

test('CF Warm-up', async ({ page }) => {
  console.log('🔐 CF Warm-up: apertura pagina AvaTrade...');
  console.log(`💾 Salverà cookies in: ${CF_COOKIES_FILE}`);

  await page.goto('https://avaoptions.avatrade.com/it/login', { waitUntil: 'domcontentloaded' });

  // Poll title every 3s — if CF challenge appears, try to auto-click, else wait for user
  let cfPassed = false;
  for (let i = 0; i < 60; i++) { // max 3 minutes
    await page.waitForTimeout(3000).catch(() => {});
    let title = '';
    try { title = (await page.title()).toLowerCase(); } catch { break; }

    if (title !== '' && !title.includes('just a moment') && !title.includes('checking your') && !title.includes('please wait')) {
      cfPassed = true;
      console.log(`✅ CF superato: "${title}"`);
      break;
    }

    console.log(`⏳ CF check (${(i + 1) * 3}s): in attesa che tu clicchi "Verify you are human"...`);

    // Try to auto-click the Turnstile checkbox
    try {
      const iframeInfo = await page.evaluate(() => {
        const frames = Array.from(document.querySelectorAll('iframe'));
        const cf = frames.find(f =>
          (f.title && (f.title.includes('Widget') || f.title.includes('Cloudflare') || f.title.includes('challenge'))) ||
          (f.src && (f.src.includes('challenges.cloudflare.com') || f.src.includes('turnstile')))
        ) || (frames.length ? frames[0] : null);
        if (!cf) return null;
        const r = cf.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      });
      if (iframeInfo && iframeInfo.w > 0) {
        const cx = iframeInfo.x + iframeInfo.w * 0.15;
        const cy = iframeInfo.y + iframeInfo.h * 0.5;
        await page.mouse.move(cx - 40, cy - 20, { steps: 8 });
        await page.waitForTimeout(200);
        await page.mouse.move(cx, cy, { steps: 8 });
        await page.waitForTimeout(150);
        await page.mouse.click(cx, cy);
        console.log(`🖱️  Auto-click Turnstile a (${Math.round(cx)}, ${Math.round(cy)})`);
        await page.waitForTimeout(2000);
      }
    } catch {}
  }

  if (!cfPassed) {
    throw new Error('CF warm-up timeout: il captcha non è stato superato entro 3 minuti');
  }

  // Save storageState (contains the real CF cookies for THIS Playwright browser)
  const dir = path.dirname(CF_COOKIES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const state = await page.context().storageState();
  // Keep only CF-related cookies
  const cfNames = ['cf_clearance', '__cf_bm', 'cf_ob_info', '__cflb', '_cfuvid', 'cf_chl_2', 'CookieConsent'];
  state.cookies = state.cookies.filter(c =>
    c.domain && c.domain.includes('avatrade.com') &&
    cfNames.some(n => c.name.startsWith(n))
  );
  state.origins = [];

  fs.writeFileSync(CF_COOKIES_FILE, JSON.stringify(state, null, 2));
  console.log(`✅ Salvati ${state.cookies.length} cookie CF in ${CF_COOKIES_FILE}`);
  state.cookies.forEach(c => console.log(`   - ${c.name} (${c.domain})`));
});
