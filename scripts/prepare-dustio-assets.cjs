const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceIcon = path.join(root, ".temp", "dustio-icon.png");
const sourceBanner = path.join(root, ".temp", "dustio-banner.png");
const assets = path.join(root, "assets");

function dataUrl(filename) {
  return `data:image/png;base64,${fs.readFileSync(filename).toString("base64")}`;
}

async function render(browser, source, destination, size, scale) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(`
    <style>
      html, body { margin: 0; width: ${size}px; height: ${size}px; background: transparent; }
      body { display: grid; place-items: center; }
      img { display: block; width: ${Math.round(size * scale)}px; height: ${Math.round(size * scale)}px; object-fit: contain; }
    </style>
    <img src="${dataUrl(source)}" alt="" />
  `);
  await page.screenshot({ path: destination, omitBackground: true });
  await page.close();
}

(async () => {
  if (!fs.existsSync(sourceIcon) || !fs.existsSync(sourceBanner)) {
    throw new Error("Os arquivos .temp/dustio-icon.png e .temp/dustio-banner.png são necessários.");
  }
  fs.mkdirSync(assets, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    await render(browser, sourceIcon, path.join(assets, "dustio-icon.png"), 1024, 0.92);
    await render(browser, sourceIcon, path.join(assets, "dustio-icon-foreground.png"), 1024, 0.72);
    fs.copyFileSync(sourceBanner, path.join(assets, "dustio-banner.png"));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
