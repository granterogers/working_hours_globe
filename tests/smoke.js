// Smoke test for the globe: opens the page, turns the coworking layer on, and checks the count, the country
// filter and the 3D view, reporting any page errors. Needs Playwright (see the README).
//
//   BASE=https://granterogers.github.io/working_hours_globe/ node tests/smoke.js
//   BASE=http://127.0.0.1:8000/ node tests/smoke.js        (after python -m http.server 8000)
const { chromium } = require('playwright');

const BASE = (process.env.BASE || 'http://127.0.0.1:8000/').replace(/\/?$/, '/');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) });
  await page.addInitScript(() => { try { localStorage.setItem('whg.cw', 'on') } catch (e) {} });
  await page.goto(BASE + 'index.html?t=' + Date.now(), { waitUntil: 'load' });
  await page.waitForTimeout(6000);

  const failures = [];
  const count = await page.textContent('#cwcnt');
  if (!count || !/^\d+$/.test(count.trim())) failures.push('coworking count not shown: ' + JSON.stringify(count));
  console.log('coworking places shown:', count);

  await page.click('#cwfb');
  await page.waitForTimeout(300);
  const countries = await page.$$eval('#cwcc option', o => o.length);
  if (countries < 2) failures.push('country list is empty');
  console.log('country options:', countries);
  if (countries > 1) {
    const code = await page.$eval('#cwcc', s => s.options[1].value);
    await page.selectOption('#cwcc', code);
    await page.waitForTimeout(300);
    const narrowed = await page.textContent('#cwcnt');
    if (narrowed === count) failures.push('country filter did not narrow the count');
    console.log('after country ' + code + ':', narrowed);
    await page.click('#cwreset');
  }

  await page.click('#b3d');
  await page.waitForTimeout(12000);
  const in3d = await page.isVisible('.m3d');
  if (!in3d) failures.push('3D view did not open');
  console.log('3D view open:', in3d);

  if (errors.length) failures.push(...errors.slice(0, 5));
  await browser.close();
  if (failures.length) {
    console.error('FAILED:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('all checks passed');
})().catch(e => { console.error('smoke test error:', e.message); process.exit(1) });
