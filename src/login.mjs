/**
 * One-Time Interactive Login Launcher
 * Launches a browser window using the persistent profile so you can log into
 * Instagram and YouTube Studio once. Sessions and cookies are saved permanently.
 */

import { chromium } from 'playwright';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USER_DATA_DIR = path.resolve(__dirname, '..', 'browser_profile');

async function main() {
  console.log('====================================================');
  console.log('   ONE-TIME LOGIN SETUP FOR YOUTUBE & INSTAGRAM');
  console.log('====================================================');
  console.log(`[i] Storing profile in: ${USER_DATA_DIR}`);
  console.log('[*] Launching browser window...');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized'
    ]
  });

  const pageIG = await context.newPage();
  console.log('[*] Opening Instagram...');
  await pageIG.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' }).catch(() => {});

  const pageYT = await context.newPage();
  console.log('[*] Opening YouTube Studio...');
  await pageYT.goto('https://studio.youtube.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log('\n----------------------------------------------------');
  console.log('ACTION REQUIRED:');
  console.log('1. In the opened browser window, log in to Instagram.');
  console.log('   - Accept cookies and click "Save info" / "Remember me".');
  console.log('2. In the other tab, log in to your Google / YouTube account.');
  console.log('   - Make sure you are in YouTube Studio for your channel.');
  console.log('3. When you are fully logged in on both sites:');
  console.log('   Come back to this terminal and press [ENTER] to save.');
  console.log('----------------------------------------------------\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise(resolve => {
    rl.question('Press [ENTER] after logging in to save your sessions: ', () => {
      rl.close();
      resolve();
    });
  });

  console.log('[*] Saving sessions and closing browser...');
  await context.close();
  console.log('[+] SUCCESS! Login sessions are permanently saved in browser_profile.');
  console.log('[+] The automation can now post without prompting for passwords.');
}

main().catch(err => {
  console.error('[!] Error during login setup:', err);
  process.exit(1);
});
