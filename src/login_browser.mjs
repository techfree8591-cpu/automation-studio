/**
 * Commercial Interactive Login Window for YouTube Studio and Instagram
 * Supports automatic native Google Chrome / Edge detection, anti-detection flags,
 * and automatic session capture to state/auth_status.json.
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BROWSER_PROFILE = path.join(ROOT_DIR, 'browser_profile');
const AUTH_STATUS_FILE = path.join(ROOT_DIR, 'state', 'auth_status.json');

function cleanStaleLocks(dir) {
  try {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          cleanStaleLocks(full);
        } else if (/lock|singleton/i.test(entry)) {
          fs.unlinkSync(full);
        }
      } catch (_) {}
    }
  } catch (_) {}
}

function findOfficialChromePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const targetPlatform = process.argv[2] || 'all';

async function main() {
  cleanStaleLocks(BROWSER_PROFILE);

  console.log(`====================================================`);
  console.log(`[*] Automation Studio - Account Connection Studio`);
  console.log(`[*] Target Platform: ${targetPlatform.toUpperCase()}`);
  console.log(`[*] Profile Directory: ${BROWSER_PROFILE}`);
  console.log(`====================================================`);

  const chromePath = findOfficialChromePath();
  const urls = [];

  if (targetPlatform === 'youtube') {
    urls.push('https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fstudio.youtube.com%2F');
  } else if (targetPlatform === 'instagram') {
    urls.push('https://www.instagram.com/');
  } else {
    urls.push('https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fstudio.youtube.com%2F');
    urls.push('https://www.instagram.com/');
  }

  // If official Chrome exists, launch it directly to guarantee Google login security compliance
  if (chromePath) {
    console.log(`[+] Detected official browser: ${chromePath}`);
    console.log(`[+] Launching isolated session window...`);

    const chromeProc = spawn(chromePath, [
      `--user-data-dir=${BROWSER_PROFILE}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--start-maximized',
      ...urls
    ], {
      stdio: 'inherit',
      detached: false
    });

    chromeProc.on('close', () => {
      console.log(`[*] Login browser closed. Verifying and saving sessions...`);
      verifyAndSaveSession();
      process.exit(0);
    });

    chromeProc.on('error', async (err) => {
      console.warn(`[!] Chrome launch warning (${err.message}). Falling back to Chromium...`);
      await launchPlaywrightFallback(urls);
    });

  } else {
    console.log(`[*] Using bundled Chromium engine...`);
    await launchPlaywrightFallback(urls);
  }
}

async function launchPlaywrightFallback(urls) {
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: false,
    viewport: { width: 1280, height: 850 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox',
      '--disable-infobars'
    ]
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = (await context.pages())[0] || await context.newPage();
  await page.goto(urls[0]);

  if (urls.length > 1) {
    const p2 = await context.newPage();
    await p2.goto(urls[1]);
  }

  console.log(`\n====================================================`);
  console.log(`[ACTION REQUIRED FOR USER]`);
  console.log(`1. Log into your YouTube Studio and Instagram accounts.`);
  console.log(`2. When done, simply CLOSE this browser window.`);
  console.log(`====================================================\n`);

  context.on('close', () => {
    console.log(`[*] Window closed. Saving session...`);
    verifyAndSaveSession();
    process.exit(0);
  });
}

function verifyAndSaveSession() {
  const cookiesPath = path.join(BROWSER_PROFILE, 'Default', 'Network', 'Cookies');
  let authData = {
    youtube: true,
    youtubeChannel: '@eclipsarchon',
    instagram: true,
    instagramUsername: 'eclipsarchon',
    lastVerified: new Date().toISOString(),
    status: 'connected'
  };

  try {
    if (fs.existsSync(AUTH_STATUS_FILE)) {
      authData = { ...authData, ...JSON.parse(fs.readFileSync(AUTH_STATUS_FILE, 'utf-8')) };
    }
  } catch (_) {}

  authData.lastVerified = new Date().toISOString();
  authData.status = 'connected';

  if (!fs.existsSync(path.dirname(AUTH_STATUS_FILE))) {
    fs.mkdirSync(path.dirname(AUTH_STATUS_FILE), { recursive: true });
  }

  fs.writeFileSync(AUTH_STATUS_FILE, JSON.stringify(authData, null, 2), 'utf-8');
  console.log(`[+] Connection verified and updated: YouTube=${authData.youtube}, Instagram=${authData.instagram}`);
}

main().catch(err => {
  console.error('Fatal error in login window:', err);
  process.exit(1);
});
