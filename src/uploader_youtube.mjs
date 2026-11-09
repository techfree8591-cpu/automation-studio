/**
 * YouTube Studio Shorts Uploader
 * Automates uploading vertical videos as YouTube Shorts via studio.youtube.com
 */

export async function uploadToYouTube(context, videoPath, metadata) {
  console.log('\n[YouTube] Starting upload for:', videoPath);
  const page = await context.newPage();

  try {
    console.log('[YouTube] Navigating to YouTube Studio...');
    await page.goto('https://studio.youtube.com/', { waitUntil: 'networkidle', timeout: 60000 });

    // Check if redirected to login
    if (page.url().includes('accounts.google.com')) {
      throw new Error('Not logged in to YouTube Studio! Please run "npm run login" first.');
    }

    // Dismiss any popups/dialogs if present
    const dismissBtn = await page.$('ytcp-button#dismiss-button, tp-yt-paper-button#dismiss-button');
    if (dismissBtn) {
      await dismissBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    console.log('[YouTube] Opening Upload dialog...');
    // Look for Create button or Upload button
    const createBtn = await page.waitForSelector('ytcp-button#create-icon, button#create-icon, ytcp-icon-button#upload-icon, #upload-icon', { timeout: 15000 }).catch(() => null);
    
    if (createBtn) {
      await createBtn.click();
      await page.waitForTimeout(1000);
      
      const uploadMenuItem = await page.$('tp-yt-paper-item#text-item-0, ytcp-text-menu #text-item-0, text="Upload videos"');
      if (uploadMenuItem) {
        await uploadMenuItem.click();
        await page.waitForTimeout(1000);
      }
    }

    // Wait for file input and supply video file
    console.log('[YouTube] Selecting video file...');
    const fileInput = await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 20000 });
    await fileInput.setInputFiles(videoPath);
    console.log('[YouTube] File selected, waiting for upload dialog...');

    // Wait for the upload modal to appear
    await page.waitForSelector('ytcp-uploads-dialog, #dialog', { timeout: 30000 });
    await page.waitForTimeout(4000);

    // 1. Fill Title
    console.log('[YouTube] Setting title:', metadata.youtube.title);
    const titleBox = await page.waitForSelector('#title-textarea #textbox, #textbox[aria-label*="title" i], [contenteditable="true"]', { timeout: 15000 });
    await titleBox.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await titleBox.fill(metadata.youtube.title);
    await page.waitForTimeout(1000);

    // 2. Fill Description
    console.log('[YouTube] Setting description...');
    const descBox = await page.$('#description-textarea #textbox, #textbox[aria-label*="description" i]');
    if (descBox) {
      await descBox.click();
      await descBox.fill(metadata.youtube.description);
      await page.waitForTimeout(1000);
    }

    // 3. Set "Not made for kids"
    console.log('[YouTube] Selecting audience (Not made for kids)...');
    const notForKidsRadio = await page.waitForSelector('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"], [name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]', { timeout: 10000 }).catch(() => null);
    if (notForKidsRadio) {
      await notForKidsRadio.click();
    } else {
      // Fallback click by text
      const textRadio = await page.$('text="No, it\'s not made for kids"');
      if (textRadio) await textRadio.click();
    }
    await page.waitForTimeout(1000);

    // 4. Click Next through Video Elements and Checks to Visibility
    console.log('[YouTube] Navigating through wizard steps...');
    for (let step = 1; step <= 3; step++) {
      const nextBtn = await page.waitForSelector('#next-button, ytcp-button#next-button', { timeout: 10000 });
      await nextBtn.click();
      await page.waitForTimeout(2000);
    }

    // 5. Select Public Visibility
    console.log('[YouTube] Setting visibility to Public...');
    const publicRadio = await page.waitForSelector('tp-yt-paper-radio-button[name="PUBLIC"], [name="PUBLIC"], #radio-public', { timeout: 10000 }).catch(() => null);
    if (publicRadio) {
      await publicRadio.click();
    } else {
      const textPublic = await page.$('text="Public"');
      if (textPublic) await textPublic.click();
    }
    await page.waitForTimeout(2000);

    // 6. Click Publish / Done
    console.log('[YouTube] Publishing Short...');
    const publishBtn = await page.waitForSelector('#done-button, ytcp-button#done-button', { timeout: 10000 });
    await publishBtn.click();

    // Wait for completion dialog or close button
    console.log('[YouTube] Waiting for publish confirmation...');
    await page.waitForTimeout(6000);

    const closeBtn = await page.$('#close-button, ytcp-button#close-button');
    if (closeBtn) {
      await closeBtn.click().catch(() => {});
    }

    console.log('[YouTube] Successfully published YouTube Short!');
    await page.close();
    return { success: true };

  } catch (err) {
    console.error('[YouTube] Upload failed:', err.message);
    await page.screenshot({ path: `logs/youtube_error_${Date.now()}.png` }).catch(() => {});
    await page.close();
    return { success: false, error: err.message };
  }
}
