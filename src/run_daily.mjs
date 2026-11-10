/**
 * Daily Multi-Platform Post Runner
 * Posts the next sequential video to YouTube Shorts and Instagram Reels.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { generateMetadata } from './metadata_generator.mjs';
import { uploadToYouTube } from './uploader_youtube.mjs';
import { uploadToInstagram } from './uploader_instagram.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
const HISTORY_PATH = path.join(ROOT_DIR, 'state', 'history.json');
const REELS_DIR = path.join(ROOT_DIR, 'reels');
const BROWSER_PROFILE = path.join(ROOT_DIR, 'browser_profile');
const LOG_FILE = path.join(ROOT_DIR, 'daily_runner.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    return { lastRun: null, totalUploaded: 0, uploadedFiles: [] };
  }
  return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
}

function getStagedVideos() {
  if (!fs.existsSync(REELS_DIR)) return [];
  const files = fs.readdirSync(REELS_DIR)
    .filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f));

  // Natural numerical sort: 1.mp4, 2.mp4, 3.mp4 ... 10.mp4, 11.mp4
  files.sort((a, b) => {
    const numA = a.match(/\d+/) ? parseInt(a.match(/\d+/)[0], 10) : Infinity;
    const numB = b.match(/\d+/) ? parseInt(b.match(/\d+/)[0], 10) : Infinity;
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  return files.map(f => path.join(REELS_DIR, f));
}

async function run() {
  log('====================================================');
  log('[*] Automation Studio Daily Post Triggered');

  const config = loadConfig();
  const history = loadHistory();
  let stagedVideos = getStagedVideos();

  if (stagedVideos.length === 0 && config.driveFolderUrl) {
    log('[*] No local staged videos found. Fetching from Google Drive in cloud...');
    try {
      const { execSync } = await import('child_process');
      execSync(`python "${path.join(ROOT_DIR, 'src', 'download_drive_folder.py')}" "${config.driveFolderUrl}"`, {
        cwd: ROOT_DIR,
        stdio: 'inherit'
      });
      stagedVideos = getStagedVideos();
    } catch (e) {
      log(`[!] Cloud Drive fetch error: ${e.message}`);
    }
  }

  if (stagedVideos.length === 0) {
    log('[-] No video files found in reels directory. Exiting.');
    return;
  }

  // Find next unposted video in sequence
  const uploadedFilenames = new Set(history.uploadedFiles.map(i => i.filename));
  const unpostedVideos = stagedVideos.filter(v => !uploadedFilenames.has(path.basename(v)));

  if (unpostedVideos.length === 0) {
    log('[-] All staged reels have already been posted! Please add new clips.');
    return;
  }

  const nextVideo = unpostedVideos[0];
  const filename = path.basename(nextVideo);
  log(`[*] Selected video for posting: ${filename} (Clip #${filename.replace(/\D/g, '')})`);

  // 1. Generate Metadata & Apply Custom Overrides
  const metadata = generateMetadata(nextVideo);
  const overridesPath = path.join(ROOT_DIR, 'state', 'metadata_overrides.json');
  if (fs.existsSync(overridesPath)) {
    try {
      const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'));
      if (overrides[filename]) {
        if (overrides[filename].youtubeTitle) metadata.youtube.title = overrides[filename].youtubeTitle;
        if (overrides[filename].youtubeDescription) metadata.youtube.description = overrides[filename].youtubeDescription;
        if (overrides[filename].instagramCaption) metadata.instagram.caption = overrides[filename].instagramCaption;
        log(`[*] Applied user custom edits for ${filename}`);
      }
    } catch (_) {}
  }
  log(`[*] YouTube Title: "${metadata.youtube.title}"`);

  // Clear any lockfile and zombie processes before opening context
  if (process.platform === 'win32') {
    try {
      const { execSync } = await import('child_process');
      execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \\"*automation\\\\browser_profile*\\" -and $_.ProcessId -ne $PID } | Stop-Process -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
    } catch (_) {}
  }

  try {
    const lockFiles = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    for (const lf of lockFiles) {
      const p = path.join(BROWSER_PROFILE, lf);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (_) {}
      }
    }
  } catch (_) {}

  // 2. Launch Browser with Persistent Profile
  const isCloudOrHeadless = process.env.HEADLESS === 'true' || process.platform === 'linux';
  log(`[*] Launching browser profile: ${BROWSER_PROFILE} (Cloud/Headless: ${isCloudOrHeadless})`);
  let context = null;

  const launchOpts = {
    headless: isCloudOrHeadless,
    viewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  };
  if (!isCloudOrHeadless) {
    launchOpts.channel = 'chrome';
  }

  try {
    context = await chromium.launchPersistentContext(BROWSER_PROFILE, launchOpts);
  } catch (launchErr) {
    log(`[Warning] Retrying launch after clearing locks: ${launchErr.message}`);
    // Clean directory locks and retry
    try {
      const files = fs.readdirSync(BROWSER_PROFILE);
      for (const f of files) {
        if (/lock|singleton/i.test(f)) {
          fs.unlinkSync(path.join(BROWSER_PROFILE, f));
        }
      }
    } catch (_) {}

    delete launchOpts.channel;
    context = await chromium.launchPersistentContext(BROWSER_PROFILE, launchOpts);
  }

  const results = {
    filename,
    timestamp: new Date().toISOString(),
    youtube: null,
    instagram: null
  };

  try {
    // 3. YouTube Upload
    if (config.platforms?.youtube !== false) {
      log('[*] Initiating YouTube Shorts upload...');
      try {
        results.youtube = await uploadToYouTube(context, nextVideo, metadata);
        log('[+] YouTube Shorts upload complete!');
      } catch (ytErr) {
        log(`[YouTube Warning] ${ytErr.message}`);
        results.youtube = { success: false, error: ytErr.message };
      }
    }

    // Small delay between platforms
    await new Promise(r => setTimeout(r, 4000));

    // 4. Instagram Upload
    if (config.platforms?.instagram !== false) {
      log('[*] Initiating Instagram Reel upload...');
      try {
        results.instagram = await uploadToInstagram(context, nextVideo, metadata);
        log('[+] Instagram Reel upload complete!');
      } catch (igErr) {
        log(`[Instagram Warning] ${igErr.message}`);
        results.instagram = { success: false, error: igErr.message };
      }
    }

  } finally {
    log('[*] Closing browser session...');
    await context.close().catch(() => {});
  }

  // 5. Update History only if at least one platform succeeded
  const anySuccess = results.youtube?.success || results.instagram?.success;
  if (anySuccess) {
    history.lastRun = new Date().toISOString();
    history.totalUploaded = (history.totalUploaded || 0) + 1;
    history.uploadedFiles.push({
      filename,
      title: metadata.youtube.title,
      timestamp: new Date().toISOString(),
      results
    });
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    log('[+] Daily run successfully completed and saved to history!');
  } else {
    log('[-] Upload could not complete on either platform. Video kept at front of queue for retry.');
  }
  log('====================================================\n');
}

run().catch(err => {
  log(`[FATAL] Error running daily automation: ${err.stack || err.message}`);
  process.exit(1);
});
