const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        for (const img of document.querySelectorAll('main img')) img.loading = 'eager';
        await Promise.all([...document.querySelectorAll('main img')].map(img => img.decode().catch(() => {})));
        await document.fonts.ready;
      });
      await page.screenshot({ path: `projects/fankkuk/workspace/home-material-${width}.png`, fullPage: true });
      const result = await page.evaluate(() => ({
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        broken: [...document.querySelectorAll('main img')].filter(img => !img.complete || !img.naturalWidth).map(img => img.getAttribute('src')),
        images: document.querySelectorAll('img[src*="/images/home/"]').length,
        title: document.title,
      }));
      console.log(JSON.stringify(result));
      if (result.overflow || result.broken.length || result.images !== 13) process.exitCode = 1;
    }
    console.log('page errors', errors);
    if (errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
