const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://avaoptions.avatrade.com/it/login');
  await page.getByPlaceholder('Account Number or E-mail').click();
  await page.getByPlaceholder('Account Number or E-mail').fill('namsom94@yahoo.de');
  await page.getByPlaceholder('Account Number or E-mail').press('Tab');
  await page.getByPlaceholder('Password').fill('Pitagoraa69!');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.close();

  // ---------------------
  await context.close();
  await browser.close();
})();