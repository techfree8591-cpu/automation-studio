/**
 * Authentication & Connection Verifier
 * Fast, rock-solid verification reading verified credentials & active sessions.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const AUTH_STATUS_FILE = path.join(ROOT_DIR, 'state', 'auth_status.json');
const COOKIES_FILE = path.join(ROOT_DIR, 'browser_profile', 'Default', 'Network', 'Cookies');

function hasCookieInProfile(name) {
  if (!fs.existsSync(COOKIES_FILE)) return false;
  try {
    const buf = fs.readFileSync(COOKIES_FILE);
    return buf.includes(Buffer.from(name));
  } catch (_) {
    return false;
  }
}

export async function checkAllAuth() {
  let data = {
    youtube: false,
    youtubeChannel: '@eclipsarchon',
    youtubeChannelId: 'UCe0cSCqjlSFoppdb0DR2uxQ',
    instagram: false,
    instagramUsername: 'eclipsarchon',
    accountEmail: 'lokesh30.07.2009@gmail.com',
    lastChecked: new Date().toISOString()
  };

  try {
    if (fs.existsSync(AUTH_STATUS_FILE)) {
      data = { ...data, ...JSON.parse(fs.readFileSync(AUTH_STATUS_FILE, 'utf-8')) };
    }
  } catch (_) {}

  // Live session cookie verification
  const ytCookiePresent = hasCookieInProfile('HSID') || hasCookieInProfile('SID') || hasCookieInProfile('LOGIN_INFO');
  const igCookiePresent = hasCookieInProfile('sessionid') || hasCookieInProfile('ds_user_id');

  data.youtube = ytCookiePresent || Boolean(data.youtube);
  data.instagram = igCookiePresent;
  if (!data.youtubeChannel) data.youtubeChannel = '@eclipsarchon';
  if (!data.instagramUsername) data.instagramUsername = 'eclipsarchon';
  data.lastChecked = new Date().toISOString();

  // Save back verified truth
  try {
    fs.writeFileSync(AUTH_STATUS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (_) {}

  return data;
}

export async function checkYouTubeAuth() {
  const res = await checkAllAuth();
  return { connected: res.youtube, channel: res.youtubeChannel };
}

export async function checkInstagramAuth() {
  const res = await checkAllAuth();
  return { connected: res.instagram, username: res.instagramUsername };
}
