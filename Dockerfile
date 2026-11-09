# Production Cloud Container for Automation Studio Pro
FROM node:20-slim

# Install system dependencies & Chromium for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    python3 \
    python3-pip \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    cron \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
RUN npm install --production

# Install Playwright browser dependencies
RUN npx playwright install chromium

# Copy application files
COPY . .

# Expose Automation Studio port
EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

# Start Automation Studio
CMD ["node", "src/dashboard_server.mjs"]
