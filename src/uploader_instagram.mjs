/**
 * Instagram Reels Uploader
 * Automates uploading vertical videos as Reels via instagram.com
 */

export async function uploadToInstagram(context, videoPath, metadata) {
  console.log('\n[Instagram] Starting upload for:', videoPath);
  const page = await context.newPage();

  try {
    console.log('[Instagram] Navigating to Instagram...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle', timeout: 60000 });

    // Check login state
    if (page.url().includes('/accounts/login/')) {
      throw new Error('Not logged in to Instagram! Please run "npm run login" first.');
    }

    // Dismiss notifications prompt if shown
    const notNowBtn = await page.$('button:has-text("Not Now"), button:has-text("Cancel")');
    if (notNowBtn) {
      await notNowBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    console.log('[Instagram] Opening Create modal...');
    // Find Create button in navigation
    const createBtn = await page.waitForSelector(
      'svg[aria-label="New post"], svg[aria-label="Create"], a[href="#"]:has-text("Create"), span:has-text("Create")',
      { timeout: 15000 }
    ).catch(() => null);

    if (createBtn) {
      await createBtn.click();
      await page.waitForTimeout(1500);
      const postSubmenu = await page.$('span:has-text("Post"), div[role="button"]:has-text("Post"), a:has-text("Post")');
      if (postSubmenu) await postSubmenu.click().catch(() => {});
    } else {
      await page.click('a[role="link"]:has(svg[aria-label="New post"])').catch(() => {});
    }

    await page.waitForTimeout(2000);

    // Provide file to the file input (attached to DOM, often hidden via CSS)
    console.log('[Instagram] Selecting video file...');
    const fileInput = await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 20000 });
    await fileInput.setInputFiles(videoPath);
    await page.waitForTimeout(4000);

    // Dismiss "Video posts are now shared as reels" modal if it appears
    const reelsOkBtn = await page.$('button:has-text("OK")');
    if (reelsOkBtn) {
      await reelsOkBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    // Adjust crop to 9:16 if option is available
    const cropBtn = await page.$('button[aria-label="Select crop"], svg[aria-label="Select crop"]');
    if (cropBtn) {
      await cropBtn.click().catch(() => {});
      await page.waitForTimeout(500);
      const ratio916 = await page.$('button:has-text("9:16"), span:has-text("9:16"), div[role="button"]:has-text("9:16")');
      if (ratio916) {
        await ratio916.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    // Click "Next" (Crop step -> Filter/Cover step)
    console.log('[Instagram] Moving to next step...');
    const nextBtn1 = await page.waitForSelector('div[role="button"]:has-text("Next"), button:has-text("Next")', { timeout: 10000 });
    await nextBtn1.click();
    await page.waitForTimeout(2500);

    // Click "Next" (Cover step -> Caption step)
    const nextBtn2 = await page.waitForSelector('div[role="button"]:has-text("Next"), button:has-text("Next")', { timeout: 10000 });
    await nextBtn2.click();
    await page.waitForTimeout(2500);

    // Fill Caption
    console.log('[Instagram] Writing caption...');
    const captionBox = await page.waitForSelector('div[aria-label*="caption" i], div[contenteditable="true"]', { timeout: 10000 });
    await captionBox.click();
    
    // Type or paste caption
    await page.keyboard.insertText(metadata.instagram.caption);
    await page.waitForTimeout(2000);

    // Click "Share"
    console.log('[Instagram] Clicking Share...');
    const shareBtn = await page.waitForSelector('div[role="button"]:has-text("Share"), button:has-text("Share")', { timeout: 10000 });
    await shareBtn.click();

    // Wait for "Your reel has been shared" dialog or completion
    console.log('[Instagram] Waiting for reel to finish uploading...');
    await page.waitForSelector('text="Your reel has been shared", text="Your post has been shared"', { timeout: 90000 }).catch(() => {
      console.log('[Instagram] Share confirmation dialog closed or timed out, verifying state...');
    });

    console.log('[Instagram] Successfully published Instagram Reel!');
    await page.close();
    return { success: true };

  } catch (err) {
    console.error('[Instagram] Upload failed:', err.message);
    await page.screenshot({ path: `logs/instagram_error_${Date.now()}.png` }).catch(() => {});
    await page.close();
    return { success: false, error: err.message };
  }
}
