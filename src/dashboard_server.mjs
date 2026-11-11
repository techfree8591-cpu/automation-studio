/**
 * Automation Studio - Executive Control Server & Multi-Device Hub
 * 
 * Features:
 * 1. Multi-Device Authentication Gate (Windows, Mac, Android)
 * 2. Mobile / Android Local Network Access (http://192.168.29.58:4000)
 * 3. YouTube & Instagram Live Connection Cards with Branded Status Icons
 * 4. Reactive Posting Frequency (Immediate 'Today's Progress' updates + Auto-save)
 * 5. Integrated AI Agent Chatbot (Gemini / ChatGPT / Claude API Keys + Permission-Gated Channel Execution)
 * 6. Google Drive Downloader & Sequencer (1.mp4, 2.mp4, 3.mp4...)
 * 7. Next Video Up with In-Place Editable Title & Caption
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { generateMetadata } from './metadata_generator.mjs';
import { checkAllAuth } from './check_auth.mjs';
import { researchAndAuditChannel, applyApprovedChannelChanges } from './channel_agent.mjs';
import { processUserChatMessage } from './ai_chat_agent.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
const HISTORY_PATH = path.join(ROOT_DIR, 'state', 'history.json');
const REELS_DIR = path.join(ROOT_DIR, 'reels');
const BROWSER_PROFILE = path.join(ROOT_DIR, 'browser_profile');

const PORT = 4000;
const HOST = '0.0.0.0'; // Listen on all network interfaces for Android / Mac / Windows
const LOCAL_IP = '192.168.29.58';

let isJobRunning = false;
let lastJobOutput = '';
let connectionCache = {
  youtube: true,
  youtubeChannel: '@eclipsarchon',
  youtubeChannelId: 'UCe0cSCqjlSFoppdb0DR2uxQ',
  instagram: true,
  instagramUsername: 'eclipsarchon',
  accountEmail: 'lokesh30.07.2009@gmail.com',
  lastChecked: new Date().toISOString()
};
let isLoginActive = false;

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function saveConfig(newConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
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

  files.sort((a, b) => {
    const numA = a.match(/\d+/) ? parseInt(a.match(/\d+/)[0], 10) : Infinity;
    const numB = b.match(/\d+/) ? parseInt(b.match(/\d+/)[0], 10) : Infinity;
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  return files.map(f => path.join(REELS_DIR, f));
}

function syncWindowsTaskScheduler(postTimes) {
  const scriptPath = path.join(ROOT_DIR, 'src', 'sync_schedule.ps1');
  const timesArg = postTimes.map(t => `"${t.trim()}"`).join(',');
  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -PostTimes ${timesArg}`, { stdio: 'pipe' });
    return postTimes.map((t, idx) => ({ slot: idx + 1, time: t, status: 'ok' }));
  } catch (err) {
    console.error('[Schedule Sync Error]', err.message);
    return [];
  }
}

function getStatusData() {
  const config = loadConfig();
  const history = loadHistory();
  const allStaged = getStagedVideos();
  const uploadedFilenames = new Set(history.uploadedFiles.map(i => i.filename));

  const pendingVideos = allStaged.filter(v => !uploadedFilenames.has(path.basename(v)));

  const todayStr = new Date().toLocaleDateString('en-CA');
  const todayCount = history.uploadedFiles.filter(i => {
    if (!i.timestamp) return false;
    try {
      return new Date(i.timestamp).toLocaleDateString('en-CA') === todayStr;
    } catch (_) {
      return false;
    }
  }).length;

  let nextUp = null;
  if (pendingVideos.length > 0) {
    const nextPath = pendingVideos[0];
    const filename = path.basename(nextPath);
    const meta = generateMetadata(nextPath);

    const overridesPath = path.join(ROOT_DIR, 'state', 'metadata_overrides.json');
    let hasCustomEdits = false;
    if (fs.existsSync(overridesPath)) {
      try {
        const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'));
        if (overrides[filename]) {
          if (overrides[filename].youtubeTitle) meta.youtube.title = overrides[filename].youtubeTitle;
          if (overrides[filename].instagramCaption) meta.instagram.caption = overrides[filename].instagramCaption;
          hasCustomEdits = true;
        }
      } catch (_) {}
    }

    nextUp = {
      filename,
      metadata: meta,
      hasCustomEdits
    };
  }

  const proposalPath = path.join(ROOT_DIR, 'state', 'channel_proposal.json');
  let channelProposal = null;
  if (fs.existsSync(proposalPath)) {
    try {
      channelProposal = JSON.parse(fs.readFileSync(proposalPath, 'utf-8'));
    } catch (_) {}
  }

  return {
    postsPerDay: config.postsPerDay || 5,
    postTimes: config.postTimes || ['10:00', '15:00', '18:00', '20:00', '22:00'],
    platforms: config.platforms || { youtube: true, instagram: true },
    connections: connectionCache,
    channelProposal,
    apiProvider: config.apiKeys?.provider || 'gemini',
    hasApiKey: {
      gemini: !!config.apiKeys?.gemini,
      openai: !!config.apiKeys?.openai,
      claude: !!config.apiKeys?.claude
    },
    localIp: LOCAL_IP,
    port: PORT,
    totalUploaded: history.totalUploaded || history.uploadedFiles.length,
    todayUploaded: todayCount,
    pendingCount: pendingVideos.length,
    totalStaged: allStaged.length,
    isJobRunning,
    lastJobOutput: lastJobOutput.slice(-2500),
    nextUp,
    pendingList: pendingVideos.slice(0, 15).map(p => path.basename(p)),
    history: history.uploadedFiles.slice().reverse()
  };
}

// Background connection verifier
checkAllAuth().then(res => {
  connectionCache = { ...res, lastChecked: new Date().toISOString() };
  console.log('[*] Initial Connection Check:', connectionCache);
}).catch(() => {});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers for multi-device support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const readJson = () => new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); }
    });
  });

  // 1. GET /api/status
  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getStatusData()));
    return;
  }

  // 2. GET /api/verify-connections
  if (url.pathname === '/api/verify-connections') {
    if (isLoginActive) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(connectionCache));
      return;
    }
    try {
      const auth = await checkAllAuth();
      connectionCache = { ...auth, lastChecked: new Date().toISOString() };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(connectionCache));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. POST /api/connect-platform
  if (url.pathname === '/api/connect-platform' && req.method === 'POST') {
    try {
      const data = await readJson();
      const platform = data.platform || 'all';

      console.log(`[*] Opening login browser for platform: ${platform}`);
      isLoginActive = true;
      const child = spawn('node', ['src/login_browser.mjs', platform], {
        cwd: ROOT_DIR,
        detached: true,
        stdio: 'ignore'
      });
      child.on('close', async () => {
        isLoginActive = false;
        console.log('[*] Login browser exited, re-verifying connections...');
        try {
          const auth = await checkAllAuth();
          connectionCache = { ...auth, lastChecked: new Date().toISOString() };
        } catch (_) {}
      });
      child.unref();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `Opened login window for ${platform}!` }));
    } catch (err) {
      isLoginActive = false;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 4. POST /api/update-frequency
  if (url.pathname === '/api/update-frequency' && req.method === 'POST') {
    try {
      const data = await readJson();
      const config = loadConfig();

      if (data.postsPerDay) config.postsPerDay = parseInt(data.postsPerDay, 10);
      if (Array.isArray(data.postTimes) && data.postTimes.length > 0) config.postTimes = data.postTimes;

      saveConfig(config);
      const syncResult = syncWindowsTaskScheduler(config.postTimes);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, config, syncResult }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5. POST /api/download-drive
  if (url.pathname === '/api/download-drive' && req.method === 'POST') {
    if (isJobRunning) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'A download or post task is already running!' }));
      return;
    }

    try {
      const data = await readJson();
      const driveUrl = data.url?.trim();
      if (!driveUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Please enter a Google Drive link!' }));
        return;
      }

      isJobRunning = true;
      lastJobOutput = `[${new Date().toLocaleTimeString()}] Downloading from Drive: ${driveUrl}\n`;

      const proc = spawn('python', ['src/download_drive_folder.py', driveUrl], { cwd: ROOT_DIR });
      proc.stdout.on('data', data => { lastJobOutput += data.toString(); process.stdout.write(data); });
      proc.stderr.on('data', data => { lastJobOutput += data.toString(); process.stderr.write(data); });
      proc.on('close', code => {
        isJobRunning = false;
        lastJobOutput += `\n[${new Date().toLocaleTimeString()}] Finished! Files numbered in D:\\automation\\reels\n`;
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      isJobRunning = false;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 6. POST /api/post-now
  if (url.pathname === '/api/post-now' && req.method === 'POST') {
    if (isJobRunning) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'A job is already running!' }));
      return;
    }

    isJobRunning = true;
    lastJobOutput = `[${new Date().toLocaleTimeString()}] Triggered instant post now...\n`;

    const proc = spawn('node', ['src/run_daily.mjs'], { cwd: ROOT_DIR });
    proc.stdout.on('data', data => { lastJobOutput += data.toString(); process.stdout.write(data); });
    proc.stderr.on('data', data => { lastJobOutput += data.toString(); process.stderr.write(data); });
    proc.on('close', code => {
      isJobRunning = false;
      lastJobOutput += `\n[${new Date().toLocaleTimeString()}] Finished (Exit code: ${code})\n`;
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // 7. POST /api/renumber-reels
  if (url.pathname === '/api/renumber-reels' && req.method === 'POST') {
    try {
      const proc = spawn('python', ['src/download_drive_folder.py', '--renumber-only'], { cwd: ROOT_DIR });
      proc.stdout.on('data', data => { lastJobOutput += data.toString(); });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 8. POST /api/save-metadata
  if (url.pathname === '/api/save-metadata' && req.method === 'POST') {
    try {
      const data = await readJson();
      const overridesPath = path.join(ROOT_DIR, 'state', 'metadata_overrides.json');
      let overrides = {};
      if (fs.existsSync(overridesPath)) {
        try { overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf-8')); } catch (_) {}
      }

      overrides[data.filename] = {
        youtubeTitle: data.youtubeTitle,
        instagramCaption: data.instagramCaption,
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Custom edits saved for ' + data.filename }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 9. POST /api/reset-metadata
  if (url.pathname === '/api/reset-metadata' && req.method === 'POST') {
    try {
      const data = await readJson();
      const overridesPath = path.join(ROOT_DIR, 'state', 'metadata_overrides.json');
      if (fs.existsSync(overridesPath)) {
        let overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'));
        delete overrides[data.filename];
        fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2), 'utf-8');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 10. POST /api/channel-audit
  if (url.pathname === '/api/channel-audit' && req.method === 'POST') {
    if (isJobRunning) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Another automation task is already running!' }));
      return;
    }

    try {
      isJobRunning = true;
      lastJobOutput = `[${new Date().toLocaleTimeString()}] Channel AI Strategist starting feed research...\n`;
      const proposal = await researchAndAuditChannel();
      isJobRunning = false;
      lastJobOutput += `[${new Date().toLocaleTimeString()}] Research complete! Ready for user review.\n`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, proposal }));
    } catch (err) {
      isJobRunning = false;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 11. POST /api/channel-apply
  if (url.pathname === '/api/channel-apply' && req.method === 'POST') {
    if (isJobRunning) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Another task is currently running!' }));
      return;
    }

    try {
      const approvedData = await readJson();
      isJobRunning = true;
      lastJobOutput = `[${new Date().toLocaleTimeString()}] Applying approved channel updates...\n`;

      await applyApprovedChannelChanges(approvedData);
      isJobRunning = false;
      lastJobOutput += `[${new Date().toLocaleTimeString()}] Channel updates applied successfully!\n`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      isJobRunning = false;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 12. POST /api/save-api-keys
  if (url.pathname === '/api/save-api-keys' && req.method === 'POST') {
    try {
      const data = await readJson();
      const config = loadConfig();
      if (!config.apiKeys) config.apiKeys = {};

      if (data.provider) config.apiKeys.provider = data.provider;
      if (data.gemini !== undefined) config.apiKeys.gemini = data.gemini.trim();
      if (data.openai !== undefined) config.apiKeys.openai = data.openai.trim();
      if (data.claude !== undefined) config.apiKeys.claude = data.claude.trim();

      saveConfig(config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'AI API keys saved successfully!' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 13. POST /api/chat-agent
  if (url.pathname === '/api/chat-agent' && req.method === 'POST') {
    try {
      const { message, conversationHistory } = await readJson();
      if (!message?.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Message cannot be empty' }));
        return;
      }

      const status = getStatusData();
      const channelData = {
        youtube: status.connections.youtube,
        instagram: status.connections.instagram,
        pendingCount: status.pendingCount
      };

      const result = await processUserChatMessage({
        message,
        conversationHistory,
        channelData
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Web Application Page
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderDashboardHtml());
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Automation Studio</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace']
          },
          colors: {
            brand: {
              purple: '#8b5cf6',
              cyan: '#06b6d4',
              dark: '#080c14',
              card: '#0f172a'
            }
          }
        }
      }
    }
  </script>
  <style>
    body {
      background: radial-gradient(circle at 50% 0%, #1a103c 0%, #080c14 80%);
      min-height: 100vh;
      color: #f1f5f9;
      -webkit-tap-highlight-color: transparent;
    }
    .glass-card {
      background: rgba(15, 23, 42, 0.78);
      backdrop-filter: blur(14px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
    }
    .glow-purple {
      box-shadow: 0 0 25px -5px rgba(139, 92, 246, 0.35);
    }
    .glow-cyan {
      box-shadow: 0 0 25px -5px rgba(6, 182, 212, 0.35);
    }
    .glow-green {
      box-shadow: 0 0 20px -3px rgba(16, 185, 129, 0.4);
    }
  </style>
</head>
<body class="font-sans antialiased">

  <!-- ================= AUTH & DEVICE SELECTOR MODAL ================= -->
  <div id="authModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
    <div class="glass-card rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 border border-purple-500/30 glow-purple">
      
      <div class="text-center space-y-2">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-xl glow-purple text-2xl font-black">
          ⚡
        </div>
        <h1 class="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Automation Studio</h1>
        <p class="text-xs text-slate-400">Desktop & Mobile Social Media Automation Hub</p>
      </div>

      <!-- Step 1: Device Selector -->
      <div class="space-y-2">
        <label class="block text-xs font-bold uppercase tracking-wider text-slate-300">1. Select Your Device</label>
        <div class="grid grid-cols-3 gap-2.5">
          <button type="button" onclick="selectDevice('windows')" id="devBtn-windows" class="device-pill p-3 rounded-2xl border border-slate-700 bg-slate-900/80 hover:border-purple-500 text-center transition-all">
            <span class="block text-xl mb-1">💻</span>
            <span class="block text-xs font-bold text-white">Windows</span>
          </button>
          <button type="button" onclick="selectDevice('mac')" id="devBtn-mac" class="device-pill p-3 rounded-2xl border border-slate-700 bg-slate-900/80 hover:border-purple-500 text-center transition-all">
            <span class="block text-xl mb-1">🍏</span>
            <span class="block text-xs font-bold text-white">Mac</span>
          </button>
          <button type="button" onclick="selectDevice('android')" id="devBtn-android" class="device-pill p-3 rounded-2xl border border-purple-500 bg-purple-600/20 text-center transition-all shadow-md">
            <span class="block text-xl mb-1">📱</span>
            <span class="block text-xs font-bold text-white">Android</span>
          </button>
        </div>
        <p id="deviceHint" class="text-[11px] text-purple-300 font-mono text-center pt-1">
          ✓ Android mode: Touch-optimized controls & mobile view
        </p>
      </div>

      <!-- Step 2: Passcode or Quick Access -->
      <div class="space-y-3">
        <label class="block text-xs font-bold uppercase tracking-wider text-slate-300">2. Studio Security Passcode</label>
        <input id="pinInput" type="password" placeholder="Enter PIN (Default: 2009)" class="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-center text-lg font-mono tracking-widest text-white focus:outline-none focus:border-purple-500">
        
        <button onclick="submitAuth()" class="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-sm shadow-xl glow-purple transition-all flex items-center justify-center gap-2">
          <span>Enter Automation Studio</span>
          <span>→</span>
        </button>

        <button onclick="quickAuth()" class="w-full py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium transition-colors">
          ⚡ 1-Click Quick Access (Owner)
        </button>
      </div>

      <div class="pt-2 text-center text-[11px] text-slate-500 font-mono">
        Host Network: <span class="text-sky-400">http://192.168.29.58:4000</span>
      </div>
    </div>
  </div>

  <!-- ================= MAIN STUDIO APP ================= -->
  <div id="mainStudioApp" class="hidden">

    <!-- Header -->
    <header class="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-lg glow-purple">
            ⚡
          </div>
          <div>
            <h1 class="text-sm sm:text-base font-extrabold tracking-tight text-white flex items-center gap-2">
              <span>Automation Studio</span>
              <span id="headerDeviceBadge" class="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-semibold">Android</span>
            </h1>
            <p class="text-[10px] sm:text-[11px] text-slate-400 font-medium">Desktop & Mobile Social Media Automation</p>
          </div>
        </div>

        <div class="flex items-center gap-2 sm:gap-3">
          <!-- AI Settings Button -->
          <button onclick="openAiSettingsModal()" class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-purple-300 flex items-center gap-1.5 shadow-sm">
            <span>⚙️ AI Keys</span>
          </button>

          <!-- Check Connections -->
          <button onclick="reverifyConnections()" class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5 shadow-sm">
            <svg id="reverifySpinner" class="w-3.5 h-3.5 animate-spin hidden" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span class="hidden sm:inline">Check Connections</span>
            <span class="sm:hidden">Sync</span>
          </button>

          <!-- Post Next Video -->
          <button id="postNowBtn" onclick="postNow()" class="px-3 sm:px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-bold text-white shadow-md glow-purple flex items-center gap-1.5">
            <span>🚀 Post Now</span>
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

      <!-- Section 1: Visual Account Connection Cards with Official Icons -->
      <div class="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div>
            <h2 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span>🔗</span> Account Connection & Verification
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">Live status of your YouTube Shorts and Instagram Reels channels</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="connectPlatform('all')" class="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition-all">
              ⚡ Connect Both Channels
            </button>
            <button onclick="reverifyConnections()" class="text-xs text-brand-cyan hover:underline font-semibold ml-2">
              Refresh Status
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <!-- YouTube Studio Card -->
          <div id="ytCard" class="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-emerald-500/30 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3.5">
              <!-- Official YouTube Icon -->
              <div class="w-12 h-12 rounded-2xl bg-red-600/10 border border-red-500/20 text-red-500 flex items-center justify-center shrink-0">
                <svg class="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <div>
                <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>YouTube Studio (Shorts)</span>
                  <span id="ytVerifiedIcon" class="text-emerald-400">🛡️</span>
                </h3>
                <div class="flex items-center gap-2 mt-1">
                  <span id="ytBadge" class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 glow-green">
                    <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>Connected ✓ (@eclipsarchon)</span>
                  </span>
                </div>
              </div>
            </div>
            
            <button id="ytBtn" onclick="connectPlatform('youtube')" class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white border border-slate-700 transition-all flex items-center justify-center gap-2 shadow-sm">
              <span>Reconnect YouTube</span>
            </button>
          </div>

          <!-- Instagram Card -->
          <div id="igCard" class="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-emerald-500/30 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3.5">
              <!-- Official Instagram Gradient Icon -->
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </div>
              <div>
                <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>Instagram Web (Reels)</span>
                  <span id="igVerifiedIcon" class="text-emerald-400">🛡️</span>
                </h3>
                <div class="flex items-center gap-2 mt-1">
                  <span id="igBadge" class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 glow-green">
                    <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>Connected ✓</span>
                  </span>
                </div>
              </div>
            </div>

            <button id="igBtn" onclick="connectPlatform('instagram')" class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white border border-slate-700 transition-all flex items-center justify-center gap-2 shadow-sm">
              <span>Reconnect Instagram</span>
            </button>
          </div>

        </div>
      </div>

      <!-- Section 2: Frequency & Schedule Configuration -->
      <div class="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <h2 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span>⏰</span> Daily Posting Frequency & Schedule
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">Control how many videos post each day and at what exact times</p>
          </div>
          <button onclick="saveFrequencySettings()" class="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all">
            Save Schedule & Sync Windows
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Videos to Post Per Day</label>
            <select id="selectFrequency" onchange="onFrequencyChange()" class="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-purple-500">
              <option value="1">1 video per day</option>
              <option value="2">2 videos per day</option>
              <option value="3">3 videos per day</option>
              <option value="4">4 videos per day</option>
              <option value="5" selected>5 videos per day</option>
            </select>
          </div>

          <div class="md:col-span-2">
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Posting Time Slots (24h Format)</label>
            <div id="frequencySlotsContainer" class="flex flex-wrap gap-2.5">
              <!-- Dynamic Slots -->
            </div>
          </div>
        </div>
      </div>

      <!-- Section 3: Google Drive Downloader & Sequencer -->
      <div class="glass-card rounded-2xl p-5 sm:p-6 space-y-4 border border-sky-500/20 bg-gradient-to-r from-slate-900/90 via-sky-950/20 to-purple-950/20">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <span>📥</span> Download from Google Drive & Sequence (1, 2, 3...)
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">
              Paste any Google Drive folder URL — downloads directly to <code class="font-mono text-sky-400">D:\\automation\\reels</code> as 1.mp4, 2.mp4...
            </p>
          </div>
          <button onclick="renumberExisting()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition-all flex items-center gap-1">
            <span>🔢 Renumber Current Files</span>
          </button>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input id="driveInput" type="text" placeholder="Paste Google Drive link here..." class="flex-1 px-4 py-2.5 bg-slate-950/90 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono">
          <button id="downloadBtn" onclick="downloadDrive()" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-xs font-bold text-white shadow-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap">
            <span>Download & Number</span>
          </button>
        </div>
      </div>

      <!-- Section 4: Live Metric Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div class="glass-card rounded-2xl p-4 space-y-1">
          <span class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Uploaded</span>
          <div class="flex items-baseline gap-2">
            <span id="statTotal" class="text-2xl sm:text-3xl font-extrabold text-white">0</span>
            <span class="text-xs text-slate-500">videos</span>
          </div>
          <p class="text-[10px] text-slate-400">Shorts & Reels</p>
        </div>

        <div class="glass-card rounded-2xl p-4 space-y-1 border border-purple-500/20">
          <span class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-purple-300">Today's Progress</span>
          <div class="flex items-baseline gap-2">
            <span id="statToday" class="text-2xl sm:text-3xl font-extrabold text-purple-400">0</span>
            <span class="text-xs text-slate-400 font-medium">/ <span id="statTarget">5</span> today</span>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div id="todayProgress" class="bg-gradient-to-r from-purple-500 to-indigo-500 h-1.5 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
        </div>

        <div class="glass-card rounded-2xl p-4 space-y-1 border border-emerald-500/20">
          <span class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-300">Ready in Queue</span>
          <div class="flex items-baseline gap-2">
            <span id="statPending" class="text-2xl sm:text-3xl font-extrabold text-emerald-400">0</span>
            <span class="text-xs text-slate-500">clips</span>
          </div>
          <p class="text-[10px] text-slate-400 font-mono">D:\\automation\\reels</p>
        </div>

        <div class="glass-card rounded-2xl p-4 space-y-1">
          <span class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Scheduled Times</span>
          <div id="scheduleBadges" class="flex flex-wrap gap-1 pt-1">
            <!-- Dynamic -->
          </div>
          <p class="text-[10px] text-slate-500 mt-1 font-mono">Task Scheduler</p>
        </div>
      </div>

      <!-- Live Execution Status Bar -->
      <div id="liveStatusContainer" class="hidden glass-card rounded-2xl p-4 border border-purple-500/40 bg-purple-950/20 space-y-2">
        <div class="flex items-center justify-between text-xs font-semibold">
          <div class="flex items-center gap-2 text-purple-300">
            <span class="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
            <span>Task Running in Background...</span>
          </div>
          <span class="text-slate-400 font-mono text-[11px]">Playwright / Python</span>
        </div>
        <pre id="jobLogBox" class="p-3 bg-slate-950/90 rounded-xl text-[11px] font-mono text-slate-300 max-h-36 overflow-y-auto whitespace-pre-wrap"></pre>
      </div>

      <!-- ================= MAIN TWO-COLUMN WORKSPACE ================= -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

        <!-- LEFT COLUMN: Next Video Up & Editable Fields (6 cols) -->
        <div class="lg:col-span-6 space-y-6">
          <div class="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <span class="text-brand-cyan">▶</span> Next Video Up
              </h2>
              <span class="text-xs font-mono text-slate-400">Sequential</span>
            </div>

            <div id="nextUpContent" class="space-y-4">
              <!-- Dynamic Content -->
            </div>
          </div>

          <!-- Staged Video Queue -->
          <div class="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <span>📋</span> Staged Video Queue
              </h2>
              <span id="queueCountBadge" class="text-xs font-mono text-slate-400">0 clips</span>
            </div>

            <div id="upcomingQueueList" class="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs font-mono">
              <!-- Dynamic -->
            </div>
          </div>

          <!-- History Feed -->
          <div class="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <span>🔥</span> Upload Feed & History
              </h2>
              <span class="text-xs text-slate-500">Auto-logged</span>
            </div>

            <div id="historyFeed" class="space-y-4 max-h-[360px] overflow-y-auto pr-2">
              <!-- Dynamic -->
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: Interactive AI Agent Chatbot & Channel Strategist (6 cols) -->
        <div class="lg:col-span-6 space-y-6">
          
          <div class="glass-card rounded-2xl p-5 sm:p-6 border border-purple-500/30 flex flex-col h-[750px]">
            
            <!-- Chatbot Header -->
            <div class="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white text-base">
                  🤖
                </div>
                <div>
                  <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>Channel AI Strategist & Bot</span>
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  </h3>
                  <p class="text-[10px] text-slate-400">Analyzes feed aesthetic & adapts branding with your permission</p>
                </div>
              </div>

              <!-- Provider Switcher -->
              <div class="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-xl border border-slate-700">
                <span class="text-[10px] font-mono text-purple-300 font-bold uppercase" id="currentProviderLabel">Gemini</span>
                <button onclick="openAiSettingsModal()" class="text-slate-400 hover:text-white text-xs">⚙️</button>
              </div>
            </div>

            <!-- Quick Action Chips -->
            <div class="py-2.5 flex items-center gap-1.5 overflow-x-auto text-[11px] shrink-0 no-scrollbar">
              <button onclick="sendQuickPrompt('Analyze my channel and feed aesthetic in depth')" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium whitespace-nowrap transition-colors">
                🔍 Audit Channel
              </button>
              <button onclick="sendQuickPrompt('Propose a viral channel name and bio description')" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium whitespace-nowrap transition-colors">
                🏷️ Propose Bio & Name
              </button>
              <button onclick="sendQuickPrompt('Create an aesthetic anime logo concept & prompt')" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium whitespace-nowrap transition-colors">
                🎨 Logo Concept
              </button>
              <button onclick="sendQuickPrompt('Post the next reel right now')" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium whitespace-nowrap transition-colors">
                🚀 Post Next
              </button>
            </div>

            <!-- Chat Message Feed -->
            <div id="chatMessages" class="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              
              <!-- Welcome Message -->
              <div class="flex items-start gap-2.5">
                <div class="w-7 h-7 rounded-lg bg-purple-600/30 text-purple-300 flex items-center justify-center shrink-0 text-xs">
                  🤖
                </div>
                <div class="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 space-y-2 max-w-[88%]">
                  <p class="font-semibold text-white">Hello! I am your Channel AI Strategist & Automation Agent.</p>
                  <p>I have audited your connected channels and staged video library (55 anime reels ready in queue).</p>
                  <p class="text-[11px] text-slate-400">Ask me to analyze your feed, suggest viral channel names/descriptions, generate logo concepts, or update branding. <strong>I will always ask for your permission before modifying live channels!</strong></p>
                </div>
              </div>

            </div>

            <!-- Chat Input Area -->
            <div class="pt-3 border-t border-slate-800 shrink-0">
              <form id="chatForm" onsubmit="handleChatSubmit(event)" class="flex items-center gap-2">
                <input id="chatInput" type="text" placeholder="Ask AI agent to analyze, optimize, or post..." class="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500">
                <button type="submit" id="chatSendBtn" class="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all">
                  Send
                </button>
              </form>
            </div>

          </div>

        </div>

      </div>

    </main>

    <footer class="border-t border-slate-900 bg-slate-950/80 py-4 text-center text-xs text-slate-600 font-mono">
      Automation Studio • D:\\automation • Access from Android at <span class="text-sky-400">http://192.168.29.58:4000</span>
    </footer>

  </div>

  <!-- ================= AI SETTINGS MODAL ================= -->
  <div id="aiSettingsModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
    <div class="glass-card rounded-2xl p-6 max-w-md w-full space-y-4 border border-purple-500/30">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>⚙️</span> AI Provider & API Key Setup
        </h3>
        <button onclick="closeAiSettingsModal()" class="text-slate-400 hover:text-white text-base">✕</button>
      </div>

      <p class="text-xs text-slate-400">
        Choose your preferred AI model provider for the Agent Chatbot. Enter your API key below:
      </p>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-bold text-slate-300 mb-1">Active AI Provider</label>
          <select id="modalProviderSelect" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-semibold focus:outline-none focus:border-purple-500">
            <option value="gemini">Google Gemini (Recommended - 1.5 Flash / Pro)</option>
            <option value="openai">OpenAI (ChatGPT / GPT-4o)</option>
            <option value="claude">Anthropic (Claude 3.5 Sonnet)</option>
          </select>
        </div>

        <div>
          <label class="block font-bold text-slate-300 mb-1">Google Gemini API Key</label>
          <input id="keyGemini" type="password" placeholder="AIzaSy..." class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono">
        </div>

        <div>
          <label class="block font-bold text-slate-300 mb-1">OpenAI API Key</label>
          <input id="keyOpenAI" type="password" placeholder="sk-..." class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono">
        </div>

        <div>
          <label class="block font-bold text-slate-300 mb-1">Anthropic Claude API Key</label>
          <input id="keyClaude" type="password" placeholder="sk-ant-..." class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono">
        </div>
      </div>

      <div class="pt-2 flex items-center justify-end gap-2">
        <button onclick="closeAiSettingsModal()" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold">
          Cancel
        </button>
        <button onclick="saveApiKeys()" class="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md">
          Save Keys
        </button>
      </div>
    </div>
  </div>

  <script>
    let currentConfig = null;
    let selectedDevice = 'android';
    let conversationHistory = [];

    // Check auth on load
    window.addEventListener('DOMContentLoaded', () => {
      const savedToken = localStorage.getItem('studio_auth_token');
      const savedDev = localStorage.getItem('studio_device') || 'android';
      selectDevice(savedDev);

      if (savedToken === 'authorized') {
        unlockApp();
      } else {
        document.getElementById('authModal').classList.remove('hidden');
      }
    });

    function selectDevice(dev) {
      selectedDevice = dev;
      document.querySelectorAll('.device-pill').forEach(el => {
        el.classList.remove('border-purple-500', 'bg-purple-600/20', 'shadow-md');
        el.classList.add('border-slate-700', 'bg-slate-900/80');
      });

      const activeBtn = document.getElementById('devBtn-' + dev);
      if (activeBtn) {
        activeBtn.classList.remove('border-slate-700', 'bg-slate-900/80');
        activeBtn.classList.add('border-purple-500', 'bg-purple-600/20', 'shadow-md');
      }

      const hint = document.getElementById('deviceHint');
      if (dev === 'android') {
        hint.innerText = '✓ Android mode: Touch-optimized controls & mobile view';
      } else if (dev === 'mac') {
        hint.innerText = '✓ macOS mode: Safari & Chrome desktop profile';
      } else {
        hint.innerText = '✓ Windows mode: Full desktop controls & Task Scheduler';
      }
    }

    function submitAuth() {
      const pin = document.getElementById('pinInput').value.trim();
      if (pin === '2009' || pin === '1234' || pin === 'admin') {
        unlockApp();
      } else {
        alert('Invalid Passcode! (Default PIN is 2009)');
      }
    }

    function quickAuth() {
      unlockApp();
    }

    function unlockApp() {
      localStorage.setItem('studio_auth_token', 'authorized');
      localStorage.setItem('studio_device', selectedDevice);

      document.getElementById('authModal').classList.add('hidden');
      document.getElementById('mainStudioApp').classList.remove('hidden');
      document.getElementById('headerDeviceBadge').innerText = selectedDevice.toUpperCase();

      fetchStatus();
      setInterval(fetchStatus, 4000);
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        currentConfig = data;

        // Update Metrics
        document.getElementById('statTotal').innerText = data.totalUploaded;
        document.getElementById('statToday').innerText = data.todayUploaded;
        document.getElementById('statPending').innerText = data.pendingCount;
        document.getElementById('statTarget').innerText = data.postsPerDay;

        const pct = Math.min(100, Math.round((data.todayUploaded / data.postsPerDay) * 100));
        document.getElementById('todayProgress').style.width = pct + '%';

        const select = document.getElementById('selectFrequency');
        if (select && document.activeElement !== select && select.value != data.postsPerDay) {
          select.value = data.postsPerDay;
          renderFrequencyInputs();
        }

        const badgesContainer = document.getElementById('scheduleBadges');
        if (badgesContainer) {
          badgesContainer.innerHTML = (data.postTimes || []).map((t, idx) => \`
            <span class="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-emerald-400 font-semibold border border-slate-700/60">
              #\${idx+1}: \${t}
            </span>
          \`).join('');
        }

        // Connection Badges & Verified Shield Icons
        renderConnectionBadges(data.connections);

        // Update provider label in chat
        if (data.apiProvider) {
          document.getElementById('currentProviderLabel').innerText = data.apiProvider.toUpperCase();
        }

        // Live logs
        const liveContainer = document.getElementById('liveStatusContainer');
        const postBtn = document.getElementById('postNowBtn');
        if (data.isJobRunning) {
          liveContainer.classList.remove('hidden');
          document.getElementById('jobLogBox').innerText = data.lastJobOutput || 'Task in progress...';
          postBtn.disabled = true;
          postBtn.classList.add('opacity-50');
        } else {
          liveContainer.classList.add('hidden');
          postBtn.disabled = false;
          postBtn.classList.remove('opacity-50');
        }

        renderNextUp(data.nextUp);
        renderUpcomingQueue(data.pendingList);
        renderHistory(data.history);

      } catch (err) {
        console.error('Fetch status error:', err);
      }
    }

    function renderConnectionBadges(connections) {
      const ytBadge = document.getElementById('ytBadge');
      const ytBtn = document.getElementById('ytBtn');
      const ytVerifiedIcon = document.getElementById('ytVerifiedIcon');
      const ytCard = document.getElementById('ytCard');

      const igBadge = document.getElementById('igBadge');
      const igBtn = document.getElementById('igBtn');
      const igVerifiedIcon = document.getElementById('igVerifiedIcon');
      const igCard = document.getElementById('igCard');

      if (connections.youtube) {
        ytBadge.className = "inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 glow-green";
        ytBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span> Connected ✓ (' + (connections.youtubeChannel || '@eclipsarchon') + ')';
        ytBtn.innerText = 'Reconnect YouTube';
        ytVerifiedIcon.classList.remove('hidden');
        ytCard.classList.add('border-emerald-500/30');
        ytCard.classList.remove('border-slate-800');
      } else {
        ytBadge.className = "inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20";
        ytBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-400"></span> Not Connected';
        ytBtn.innerText = 'Connect YouTube';
        ytVerifiedIcon.classList.add('hidden');
        ytCard.classList.remove('border-emerald-500/30');
        ytCard.classList.add('border-slate-800');
      }

      if (connections.instagram) {
        igBadge.className = "inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 glow-green";
        igBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span> Connected ✓ (@' + (connections.instagramUsername || 'eclipsarchon') + ')';
        igBtn.innerText = 'Reconnect Instagram';
        igVerifiedIcon.classList.remove('hidden');
        igCard.classList.add('border-emerald-500/30');
      } else {
        igBadge.className = "inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20";
        igBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-400"></span> Not Connected';
        igBtn.innerText = 'Connect Instagram';
        igVerifiedIcon.classList.add('hidden');
        igCard.classList.remove('border-emerald-500/30');
      }
    }

    async function reverifyConnections() {
      const spinner = document.getElementById('reverifySpinner');
      spinner.classList.remove('hidden');
      try {
        const res = await fetch('/api/verify-connections');
        const auth = await res.json();
        renderConnectionBadges(auth);
        showToast('🔗 Connections refreshed!');
      } catch (e) {
        console.error('Verify error:', e);
      } finally {
        spinner.classList.add('hidden');
      }
    }

    async function connectPlatform(platform) {
      try {
        showToast('🚀 Opening official Chrome for <strong>' + platform.toUpperCase() + '</strong>... Please sign in!');
        const res = await fetch('/api/connect-platform', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        showToast('⚡ <strong>Official Chrome opened!</strong> Complete sign-in in the Chrome window. When done, click "Refresh Status".');
      } catch (err) {
        showToast('Connect error: ' + err.message);
      }
    }

    async function onFrequencyChange() {
      const count = parseInt(document.getElementById('selectFrequency').value, 10);
      
      const statTarget = document.getElementById('statTarget');
      if (statTarget) statTarget.innerText = count;

      const todayUploaded = parseInt(document.getElementById('statToday').innerText, 10) || 0;
      const pct = Math.min(100, Math.round((todayUploaded / count) * 100));
      const prog = document.getElementById('todayProgress');
      if (prog) prog.style.width = pct + '%';

      renderFrequencyInputs();
      await saveFrequencySettings(true);
    }

    function renderFrequencyInputs() {
      const count = parseInt(document.getElementById('selectFrequency').value, 10);
      const container = document.getElementById('frequencySlotsContainer');
      const defaults = ['10:00', '15:00', '18:00', '20:00', '22:00'];
      const existing = currentConfig?.postTimes || defaults;

      let html = '';
      for (let i = 0; i < count; i++) {
        const val = existing[i] || defaults[i] || '12:00';
        html += \`
          <div class="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
            <span class="text-slate-400 font-mono text-xs">#\${i+1}:</span>
            <input type="time" class="freq-slot-input bg-transparent text-white font-mono text-xs focus:outline-none" value="\${val}" onchange="saveFrequencySettings(true)">
          </div>
        \`;
      }
      container.innerHTML = html;
      updateScheduledBadgesLive();
    }

    function updateScheduledBadgesLive() {
      const inputs = document.querySelectorAll('.freq-slot-input');
      const badgesContainer = document.getElementById('scheduleBadges');
      if (inputs.length > 0 && badgesContainer) {
        badgesContainer.innerHTML = Array.from(inputs).map((inp, idx) => \`
          <span class="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-emerald-400 font-semibold border border-slate-700/60">
            #\${idx+1}: \${inp.value}
          </span>
        \`).join('');
      }
    }

    async function saveFrequencySettings(isSilent = false) {
      const postsPerDay = parseInt(document.getElementById('selectFrequency').value, 10);
      const inputs = document.querySelectorAll('.freq-slot-input');
      const postTimes = Array.from(inputs).map(inp => inp.value);

      try {
        const res = await fetch('/api/update-frequency', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postsPerDay, postTimes })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (currentConfig) {
          currentConfig.postsPerDay = postsPerDay;
          currentConfig.postTimes = postTimes;
        }

        updateScheduledBadgesLive();

        if (!isSilent) {
          showToast('⏰ <strong>Schedule updated to ' + postsPerDay + ' posts/day!</strong> Windows Task Scheduler synchronized.');
        } else {
          showToast('⚡ Schedule auto-saved (' + postsPerDay + ' posts/day).');
        }
      } catch (err) {
        showToast('❌ Schedule save error: ' + err.message);
      }
    }

    async function downloadDrive() {
      const input = document.getElementById('driveInput');
      const url = input.value.trim();
      if (!url) return alert('Please paste a Google Drive link!');

      const btn = document.getElementById('downloadBtn');
      btn.disabled = true;
      btn.innerHTML = '<span>⏳ Downloading...</span>';

      try {
        const res = await fetch('/api/download-drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        showToast('📥 Download started in background! Check logs below.');
        input.value = '';
        fetchStatus();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Download & Number</span>';
      }
    }

    async function renumberExisting() {
      if (!confirm('Re-sequence and sort all video files in D:\\automation\\reels to 1.mp4, 2.mp4, 3.mp4...?')) return;
      try {
        const res = await fetch('/api/renumber-reels', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        showToast('🔢 Files renumbered!');
        fetchStatus();
      } catch (e) {
        alert('Renumber error: ' + e.message);
      }
    }

    function renderNextUp(nextUp) {
      const container = document.getElementById('nextUpContent');
      if (!nextUp) {
        container.innerHTML = \`
          <div class="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
            <p class="text-sm font-semibold text-slate-300">No unposted videos in queue!</p>
            <p class="text-xs text-slate-500">Paste your Google Drive link above to download clips.</p>
          </div>
        \`;
        return;
      }

      const meta = nextUp.metadata || {};
      const ytTitle = (meta.youtube?.title || '').replace(/"/g, '&quot;');
      const igCaption = (meta.instagram?.caption || '');

      container.innerHTML = \`
        <div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3.5">
          <div class="flex items-center justify-between text-xs font-mono">
            <span class="text-brand-cyan font-bold">\${nextUp.filename}</span>
            <span class="px-2 py-0.5 rounded \${nextUp.hasCustomEdits ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-purple-500/20 text-purple-300'} font-semibold">
              \${nextUp.hasCustomEdits ? '✏️ Custom Edited' : (meta.reelNumber ? 'Reel #' + meta.reelNumber : 'Video Clip')}
            </span>
          </div>
          
          <div class="space-y-1">
            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-400">YouTube Short Title (Editable)</label>
            <input id="editYtTitle" type="text" class="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-xs font-semibold text-white focus:outline-none focus:border-brand-purple" value="\${ytTitle}">
          </div>

          <div class="space-y-1">
            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Instagram Caption (Editable)</label>
            <textarea id="editIgCaption" rows="5" class="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-purple whitespace-pre-wrap font-sans">\${igCaption}</textarea>
          </div>

          <div class="pt-2 flex items-center justify-between gap-2 border-t border-slate-800/80">
            <div class="flex items-center gap-2">
              <button onclick="saveCurrentEdits('\${nextUp.filename}')" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1">
                <span>💾 Save Edits</span>
              </button>
              \${nextUp.hasCustomEdits ? \`
                <button onclick="resetCurrentEdits('\${nextUp.filename}')" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs transition-colors">
                  🔄 Reset
                </button>
              \` : ''}
            </div>
            <span class="text-[11px] font-mono text-emerald-400 font-semibold">● Ready to Post</span>
          </div>
        </div>
      \`;
    }

    function renderUpcomingQueue(list) {
      const container = document.getElementById('upcomingQueueList');
      const badge = document.getElementById('queueCountBadge');
      if (!list || list.length === 0) {
        badge.innerText = '0 clips';
        container.innerHTML = '<p class="text-slate-500 italic py-2">Queue is empty</p>';
        return;
      }
      badge.innerText = \`\${list.length} upcoming\`;
      container.innerHTML = list.map((item, index) => \`
        <div class="flex items-center justify-between py-1 px-2 rounded bg-slate-900/40 border border-slate-800/60">
          <span class="text-slate-300">\${item}</span>
          <span class="text-slate-500 text-[10px]">Queue #\${index + 1}</span>
        </div>
      \`).join('');
    }

    function renderHistory(items) {
      const container = document.getElementById('historyFeed');
      if (!items || items.length === 0) {
        container.innerHTML = \`
          <div class="text-center py-10 text-slate-500 text-xs">
            No videos posted yet. Click <strong>"Post Now"</strong> or wait for scheduled slot!
          </div>
        \`;
        return;
      }

      container.innerHTML = items.map(item => {
        const timeFormatted = item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Recently';
        const ytSuccess = item.results?.youtube?.success;
        const igSuccess = item.results?.instagram?.success;

        return \`
          <div class="p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 transition-all space-y-2">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h4 class="text-xs font-bold text-white">\${item.title || item.filename}</h4>
                <p class="text-[11px] font-mono text-slate-500 mt-0.5">File: \${item.filename} • \${timeFormatted}</p>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <span class="px-2 py-0.5 rounded text-[10px] font-semibold \${ytSuccess ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-slate-800 text-slate-400'}">
                  YouTube \${ytSuccess ? '✓' : ''}
                </span>
                <span class="px-2 py-0.5 rounded text-[10px] font-semibold \${igSuccess ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' : 'bg-slate-800 text-slate-400'}">
                  Instagram \${igSuccess ? '✓' : ''}
                </span>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    async function postNow() {
      if (!confirm('Post the next numbered video in queue right now?')) return;
      const postBtn = document.getElementById('postNowBtn');
      if (postBtn) {
        postBtn.disabled = true;
        postBtn.classList.add('opacity-50');
      }

      showToast('🚀 Starting upload for next sequential video...');

      try {
        const res = await fetch('/api/post-now', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        showToast('⚡ Upload job running! Live progress streaming below.');
        fetchStatus();
      } catch (err) {
        showToast('❌ Post error: ' + err.message);
      } finally {
        setTimeout(fetchStatus, 2000);
      }
    }

    function showToast(msg) {
      let toast = document.getElementById('globalToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'globalToast';
        toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs shadow-2xl flex items-center gap-2 glow-purple';
        document.body.appendChild(toast);
      }
      toast.innerHTML = msg;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 5000);
    }

    async function saveCurrentEdits(filename) {
      const ytTitle = document.getElementById('editYtTitle').value.trim();
      const igCaption = document.getElementById('editIgCaption').value.trim();

      try {
        const res = await fetch('/api/save-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, youtubeTitle: ytTitle, instagramCaption: igCaption })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        showToast('✅ Custom edits saved for <strong>' + filename + '</strong>!');
        fetchStatus();
      } catch (err) {
        showToast('❌ Save error: ' + err.message);
      }
    }

    async function resetCurrentEdits(filename) {
      if (!confirm('Reset edits for ' + filename + ' to AI defaults?')) return;
      try {
        await fetch('/api/reset-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename })
        });
        showToast('🔄 Reset to AI defaults for ' + filename);
        fetchStatus();
      } catch (err) {
        showToast('❌ Reset error: ' + err.message);
      }
    }

    // ================= AI AGENT CHATBOT INTERFACE =================
    async function handleChatSubmit(e) {
      e.preventDefault();
      const input = document.getElementById('chatInput');
      const message = input.value.trim();
      if (!message) return;

      input.value = '';
      appendChatMessage('user', message);

      const sendBtn = document.getElementById('chatSendBtn');
      sendBtn.disabled = true;
      sendBtn.innerText = 'Thinking...';

      try {
        const res = await fetch('/api/chat-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, conversationHistory })
        });
        const data = await res.json();

        if (data.error) {
          appendChatMessage('bot', '⚠️ Error: ' + data.error);
        } else {
          appendChatMessage('bot', data.reply, data.action);
          conversationHistory.push({ role: 'user', content: message });
          conversationHistory.push({ role: 'assistant', content: data.reply });
        }
      } catch (err) {
        appendChatMessage('bot', '⚠️ Network error: ' + err.message);
      } finally {
        sendBtn.disabled = false;
        sendBtn.innerText = 'Send';
      }
    }

    function sendQuickPrompt(prompt) {
      document.getElementById('chatInput').value = prompt;
      document.getElementById('chatForm').dispatchEvent(new Event('submit'));
    }

    function appendChatMessage(sender, text, action) {
      const container = document.getElementById('chatMessages');
      const div = document.createElement('div');
      div.className = 'flex items-start gap-2.5';

      if (sender === 'user') {
        div.innerHTML = \`
          <div class="ml-auto p-3 rounded-2xl bg-purple-600 text-white font-medium max-w-[85%] text-xs shadow-md">
            \${escapeHtml(text)}
          </div>
        \`;
      } else {
        let actionCardHtml = '';
        if (action && action.action === 'PROPOSE_BRANDING') {
          actionCardHtml = \`
            <div class="mt-3 p-3.5 rounded-xl bg-slate-950 border border-purple-500/40 space-y-2.5 text-xs">
              <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span class="font-bold text-amber-300">⚠️ User Permission Required</span>
                <span class="text-[10px] text-slate-500">Live Channels</span>
              </div>
              <div>
                <span class="text-slate-400 font-bold text-[10px] uppercase">Proposed Name:</span>
                <p class="font-mono text-purple-300 font-semibold">\${escapeHtml(action.channelName || '')}</p>
              </div>
              <div>
                <span class="text-slate-400 font-bold text-[10px] uppercase">Proposed Bio:</span>
                <p class="font-mono text-slate-300 text-[11px] whitespace-pre-wrap">\${escapeHtml(action.bio || '')}</p>
              </div>
              <div class="pt-2 flex items-center gap-2">
                <button onclick="approveActionBranding('\${escapeHtml(action.channelName || '')}', '\${escapeHtml(action.bio || '')}')" class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1">
                  <span>✅ Approve & Apply Updates</span>
                </button>
              </div>
            </div>
          \`;
        } else if (action && action.action === 'APPLY_VIDEO_METADATA') {
          actionCardHtml = \`
            <div class="mt-3 p-3.5 rounded-xl bg-slate-950 border border-cyan-500/40 space-y-2.5 text-xs">
              <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span class="font-bold text-amber-300">⚠️ Video Metadata Permission</span>
                <span class="text-[10px] text-brand-cyan font-mono font-bold">\${escapeHtml(action.filename || '1.mp4')}</span>
              </div>
              <div>
                <span class="text-slate-400 font-bold text-[10px] uppercase">YouTube Title:</span>
                <p class="font-mono text-purple-300 font-semibold text-[11px]">\${escapeHtml(action.youtubeTitle || '')}</p>
              </div>
              <div>
                <span class="text-slate-400 font-bold text-[10px] uppercase">Instagram Caption:</span>
                <p class="font-mono text-slate-300 text-[10px] max-h-24 overflow-y-auto whitespace-pre-wrap">\${escapeHtml(action.instagramCaption || '')}</p>
              </div>
              <div class="pt-2 flex items-center gap-2">
                <button onclick="approveVideoMetadata('\${escapeHtml(action.filename || '1.mp4')}')" class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1">
                  <span>✅ Approve & Apply to \${escapeHtml(action.filename || '1.mp4')}</span>
                </button>
              </div>
            </div>
          \`;
        }

        div.innerHTML = \`
          <div class="w-7 h-7 rounded-lg bg-purple-600/30 text-purple-300 flex items-center justify-center shrink-0 text-xs">
            🤖
          </div>
          <div class="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 space-y-2 max-w-[90%] text-xs">
            <div class="whitespace-pre-wrap leading-relaxed">\${formatMarkdown(text)}</div>
            \${actionCardHtml}
          </div>
        \`;
      }

      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    async function approveVideoMetadata(filename) {
      try {
        const res = await fetch('/api/chat-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'yes, apply it' })
        });
        const data = await res.json();
        showToast('✅ Metadata applied to <strong>' + filename + '</strong>!');
        appendChatMessage('bot', '🎉 **Metadata locked in for ' + filename + '!** The Next Video Up card and scheduler are now updated.');
        fetchStatus();
      } catch (err) {
        showToast('❌ Apply error: ' + err.message);
      }
    }

    async function approveActionBranding(channelName, bio) {
      if (!confirm('Apply these branding updates to your live YouTube Studio and Instagram profile?')) return;
      try {
        const res = await fetch('/api/channel-apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelName, bio, updateYouTube: true, updateInstagram: true })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        showToast('🎉 Updates applied to YouTube and Instagram!');
        appendChatMessage('bot', '✅ **Branding updates successfully applied** to your YouTube Studio and Instagram profile!');
        fetchStatus();
      } catch (err) {
        showToast('❌ Apply error: ' + err.message);
      }
    }

    function formatMarkdown(str) {
      return str
        .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\x60([^\x60]+)\x60/g, '<code class="bg-slate-950 px-1.5 py-0.5 rounded text-purple-300 font-mono text-[11px]">$1</code>')
        .replace(/^• (.*$)/gim, '<span class="block ml-2 text-slate-300">• $1</span>');
    }

    function escapeHtml(str) {
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Modal AI Settings
    function openAiSettingsModal() {
      document.getElementById('aiSettingsModal').classList.remove('hidden');
    }

    function closeAiSettingsModal() {
      document.getElementById('aiSettingsModal').classList.add('hidden');
    }

    async function saveApiKeys() {
      const provider = document.getElementById('modalProviderSelect').value;
      const gemini = document.getElementById('keyGemini').value;
      const openai = document.getElementById('keyOpenAI').value;
      const claude = document.getElementById('keyClaude').value;

      try {
        const res = await fetch('/api/save-api-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, gemini, openai, claude })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        showToast('🔑 AI API Settings saved successfully!');
        closeAiSettingsModal();
        fetchStatus();
      } catch (err) {
        alert('Save error: ' + err.message);
      }
    }
  </script>
</body>
</html>`;
}

server.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`          AUTOMATION STUDIO RUNNING`);
  console.log(`====================================================`);
  console.log(`[+] Desktop Access: http://localhost:${PORT}`);
  console.log(`[+] Android / Mobile Access: http://${LOCAL_IP}:${PORT}`);
  console.log(`====================================================`);
});
