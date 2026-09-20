// Render the original vector mark for Expo launcher, splash and favicon use.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assets = path.resolve(__dirname, '..', 'assets');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
    const svg = fs.readFileSync(path.join(assets, 'media-cleaner.svg'), 'utf8');
    await page.setContent(`<style>body{margin:0}svg{display:block}</style>${svg}`);
    // Keep the padded mark transparent for Android launcher masks.
    await page.screenshot({ path: path.join(assets, 'media-cleaner-adaptive.png'), omitBackground: true });
    // Standard/iOS icons are opaque; match the configured splash background.
    await page.addStyleTag({ content: 'body{background:#F7FAF7}' });
    await page.screenshot({ path: path.join(assets, 'media-cleaner.png'), omitBackground: false });
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
