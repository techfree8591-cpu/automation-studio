# 24/7 Cloud Deployment Guide (PC Turned OFF)

This guide shows you how to run **Automation Studio Pro** 100% in the cloud so it posts to YouTube Shorts & Instagram Reels 24/7/365 **even when your computer is completely turned off**.

---

### Option 1: Render.com (Easiest — Direct from GitHub)
Since you already have a Render dashboard account:

1. **Push your code to a private GitHub repository**:
   ```bash
   git init
   git add .
   git commit -m "Automation Studio Pro Cloud Ready"
   git branch -M main
   git remote add origin https://github.com/<your-username>/automation-studio.git
   git push -u origin main
   ```
2. **Deploy on Render**:
   - Go to your [Render Dashboard](https://dashboard.render.com/).
   - Click **New +** → **Web Service** (or Background Worker).
   - Select your GitHub repository.
   - Environment: **Docker** (it automatically uses our included `Dockerfile`).
   - Click **Deploy**.
3. **Access from Android Phone**:
   - Render gives you a permanent HTTPS URL (e.g., `https://automation-studio-xyz.onrender.com`).
   - Open it on your phone, enter PIN: `2009`, and control the studio anytime!

---

### Option 2: Oracle Cloud Always Free VPS (Best Overall — 100% Free Forever)
Oracle gives **4 Ampere CPU cores, 24 GB RAM, 200 GB SSD storage, free forever**:

1. Complete the free signup on [Oracle Cloud Free Tier](https://signup.cloud.oracle.com/).
2. Create an **Ubuntu 24.04** Compute Instance.
3. SSH into your VPS:
   ```bash
   sudo apt update && sudo apt install -y nodejs npm python3 git
   git clone https://github.com/<your-username>/automation-studio.git
   cd automation-studio
   npm install
   npx playwright install chromium
   ```
4. Start with PM2 so it stays online 24/7 forever:
   ```bash
   npm install -g pm2
   pm2 start src/dashboard_server.mjs --name studio
   pm2 startup
   pm2 save
   ```
5. Run Cloudflare Tunnel for your Android phone:
   ```bash
   cloudflared tunnel --url http://localhost:4000
   ```
   Now you have a permanent 24/7 cloud autopilot running day and night with your PC completely turned off!

---

### Option 3: GitHub Actions Scheduled Cron (Zero Server Required)
If you don't even want a server:
- Runs automatically at your scheduled times (10:00, 15:00, 18:00) using GitHub's free cloud runner.
- Each run boots up, uploads the next sequential clip from your Google Drive, updates history, and shuts down.
