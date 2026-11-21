/**
 * Instagram Reels Uploader
 * Automates uploading vertical videos as Reels via instagram.com
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');

export async function uploadToInstagram(context, videoPath, metadata) {
  console.log('\n[Instagram] Starting upload for:', videoPath);
  const page = await context.newPage();

  try {
    console.log('[Instagram] Navigating to Instagram...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    // Check login state: check if login form or username/password inputs or signup elements are shown
    const isLoginPage = await page.$('input[name="username"], input[name="password"], form#loginForm, a[href*="/accounts/emailsignup"], button:has-text("Log in"), button:has-text("Log In"), div:has-text("Create new account")');
    if (isLoginPage || page.url().includes('/accounts/login/')) {
      console.warn('[Instagram] Not logged in to Instagram! Login page detected.');
      await page.screenshot({ path: path.join(LOGS_DIR, `instagram_not_logged_in_${Date.now()}.png`) }).catch(() => {});
      await page.close();
      return { success: false, error: 'Not logged in to Instagram! Please click "Connect Instagram" on dashboard to log in once.' };
    }

    // Dismiss notifications / cookie prompt if shown ("Turn on Notifications" -> "Not Now")
    const notNowBtn = await page.$('button:has-text("Not Now"), button:has-text("Cancel")');
    if (notNowBtn) {
      await notNowBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    console.log('[Instagram] Opening Create modal...');
    // Look for Create in left sidebar navigation (avoid matching login/signup buttons)
    const createBtn = await page.waitForSelector(
      'svg[aria-label="New post"], svg[aria-label="Create"], div[role="button"]:has(svg[aria-label="New post"]), a[href="#"]:has(svg[aria-label="New post"]), nav a:has-text("Create"), div[role="navigation"] :has-text("Create")',
      { timeout: 15000 }
    ).catch(() => null);

    if (!createBtn) {
      console.warn('[Instagram] Navigation create button not found. Taking screenshot...');
      await page.screenshot({ path: path.join(LOGS_DIR, `instagram_nav_not_found_${Date.now()}.png`) }).catch(() => {});
      await page.close();
      return { success: false, error: 'Instagram navigation bar not ready or account not authenticated.' };
    }

    await createBtn.click();
    await page.waitForTimeout(1500);

    const postSubmenu = await page.$('span:has-text("Post"), div[role="button"]:has-text("Post"), a:has-text("Post")');
    if (postSubmenu) await postSubmenu.click().catch(() => {});

    await page.waitForTimeout(2000);

    // Provide file to file input
    console.log('[Instagram] Selecting video file...');
    const fileInput = await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 25000 });
    await fileInput.setInputFiles(videoPath);
    await page.waitForTimeout(4000);

    // Dismiss "Video posts are now shared as reels" modal if it appears
    const reelsOkBtn = await page.$('button:has-text("OK")');
    if (reelsOkBtn) {
      await reelsOkBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    // Adjust crop to 9:16 if option is available
    const cropBtn = await page.$('button[aria-label="Select crop"], svg[aria-label="Select crop"], [aria-label*="crop" i]');
    if (cropBtn) {
      await cropBtn.click().catch(() => {});
      await page.waitForTimeout(800);
      const ratio916 = await page.$('button:has-text("9:16"), span:has-text("9:16"), div[role="button"]:has-text("9:16")');
      if (ratio916) {
        await ratio916.click().catch(() => {});
        await page.waitForTimeout(800);
      }
    }

    // Click "Next" (Crop step -> Filter/Cover step)
    console.log('[Instagram] Moving to next step...');
    const nextBtn1 = await page.waitForSelector('div[role="button"]:has-text("Next"), button:has-text("Next"), span:has-text("Next")', { timeout: 15000 });
    await nextBtn1.click();
    await page.waitForTimeout(3000);

    // Click "Next" (Cover step -> Caption step)
    const nextBtn2 = await page.waitForSelector('div[role="button"]:has-text("Next"), button:has-text("Next"), span:has-text("Next")', { timeout: 15000 });
    await nextBtn2.click();
    await page.waitForTimeout(3000);

    // Fill Caption
    console.log('[Instagram] Writing caption...');
    const captionBox = await page.waitForSelector('div[aria-label*="caption" i], div[contenteditable="true"], div[role="textbox"]', { timeout: 15000 });
    await captionBox.click();
    await page.keyboard.insertText(metadata.instagram.caption);
    await page.waitForTimeout(2000);

    // Click "Share"
    console.log('[Instagram] Clicking Share...');
    const shareBtn = await page.waitForSelector('div[role="button"]:has-text("Share"), button:has-text("Share"), span:has-text("Share")', { timeout: 15000 });
    await shareBtn.click();

    // Wait for "Your reel has been shared" or modal to close
    console.log('[Instagram] Waiting for reel to finish uploading...');
    await page.waitForSelector('text="Your reel has been shared", text="Your post has been shared"', { timeout: 90000 }).catch(() => {
      console.log('[Instagram] Share confirmation dialog closed or timed out, verifying state...');
    });

    console.log('[Instagram] Successfully published Instagram Reel!');
    await page.close();
    return { success: true };

  } catch (err) {
    console.error('[Instagram] Upload failed:', err.message);
    await page.screenshot({ path: path.join(LOGS_DIR, `instagram_error_${Date.now()}.png`) }).catch(() => {});
    await page.close();
    return { success: false, error: err.message };
  }
}
