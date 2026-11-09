import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BROWSER_PROFILE = path.resolve(__dirname, '..', 'browser_profile');

async function test() {
  const ctx = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await ctx.newPage();
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle' });
  console.log('Current URL:', page.url());

  const navLabels = await page.$$eval('[aria-label]', els => els.map(e => e.getAttribute('aria-label')));
  console.log('Aria labels found:', navLabels);

  const svgs = await page.$$eval('svg[aria-label]', els => els.map(e => e.getAttribute('aria-label')));
  console.log('SVG aria labels:', svgs);

  // Check if "New post" or "Create" exists
  const createEl = await page.$('svg[aria-label="New post"], svg[aria-label="Create"], [aria-label*="Create" i], [aria-label*="New post" i]');
  console.log('Create Element exists:', !!createEl);

  if (createEl) {
    await createEl.click();
    await page.waitForTimeout(3000);
    const inputs = await page.$$eval('input', els => els.map(e => ({ type: e.type, accept: e.accept, name: e.name })));
    console.log('Inputs after create click:', inputs);

    const buttons = await page.$$eval('button, [role="button"]', els => els.map(e => e.innerText.trim()).filter(Boolean));
    console.log('Buttons after create click:', buttons);
  }

  await page.screenshot({ path: path.join(__dirname, '..', 'instagram_debug.png') });
  console.log('Screenshot saved to instagram_debug.png');

  await ctx.close();
}

test().catch(console.error);
