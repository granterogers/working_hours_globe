// Feature checks for the globe, run in a browser against a live or local copy. Each check prints PASS or FAIL, and
// the script exits with 1 if any check fails. Needs Playwright (see the README).
//
//   BASE=https://granterogers.github.io/working_hours_globe/ node tests/features.js
//   BASE=http://127.0.0.1:8000/ node tests/features.js      (after python -m http.server 8000)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = (process.env.BASE || 'http://127.0.0.1:8000/').replace(/\/?$/, '/');
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')) };

// 1. the opening-hours reader used by the coworking "Open now" filter, on fixed times
function openingHoursChecks() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const a = src.indexOf('const CW_DAYS='), b = src.indexOf('const CW_CATS=');
  if (a < 0 || b < 0) return check('opening-hours reader found in app.js', false);
  const cwOpen = new Function(src.slice(a, b) + '; return cwOpen;')();
  const cases = [
    ['09:00-21:00', 0, '2026-10-29T12:00:00Z', true],
    ['09:00-21:00', 0, '2026-10-29T22:00:00Z', false],
    ['Mo-Fr 09:00-18:00', 0, '2026-10-31T12:00:00Z', false],   // Saturday
    ['Mo-Fr 09:00-18:00', 0, '2026-10-29T12:00:00Z', true],    // Thursday
    ['Mo-Fr 09:00-18:00; Sa 10:00-14:00', 0, '2026-10-31T11:00:00Z', true],
    ['Mo-Su 09:00-18:00; Sa off', 0, '2026-10-31T11:00:00Z', false],
    ['24/7', 0, '2026-10-29T03:00:00Z', true],
    ['Mo-Su 22:00-02:00', 0, '2026-10-29T01:00:00Z', true],    // overnight
    ['by appointment', 0, '2026-10-29T12:00:00Z', false],
    ['', 0, '2026-10-29T12:00:00Z', false],
  ];
  const bad = cases.filter(([h, lon, iso, want]) => cwOpen(h, lon, new Date(iso)) !== want);
  check('opening hours read correctly (' + cases.length + ' cases)', bad.length === 0, bad.map(c => JSON.stringify(c[0])).join(', '));
}

(async () => {
  openingHoursChecks();

  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'index.html?t=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#tour', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 2. layout: the top-right row ends with Map layers, the menu has no horizontal scrollbar, no full screen button
  const order = await page.evaluate(() => [...document.querySelectorAll('.tools > *')].map(e => e.id || e.className));
  check('top-right buttons end with Map layers', order[order.length - 1] === 'bmwrap', order.join(' | '));
  check('no full screen button', await page.evaluate(() => !document.getElementById('fs')));
  await page.click('#bmbtn');
  await page.waitForTimeout(400);
  const scroll = await page.evaluate(() => { const m = document.getElementById('bmmenu'); return m.scrollWidth <= m.clientWidth });
  check('Map layers menu has no horizontal scrollbar', scroll);
  await page.click('#bmbtn');

  // 2b. layout: the Layers panel is at the top left, the working-hours settings open from its cog, and the old panel is gone
  const lyr = await page.evaluate(() => { const r = document.getElementById('lyr').getBoundingClientRect(); return [r.left, r.top] });
  check('Layers panel is at the top left', lyr[0] < 40 && lyr[1] < 40, lyr.map(Math.round).join(','));
  check('the old working-hours panel is gone', await page.evaluate(() => !document.getElementById('panel')));
  await page.click('#hoursgear');
  await page.waitForTimeout(400);
  check('the cog opens working hours settings', await page.evaluate(() => !document.getElementById('hoursset').hidden));
  await page.click('#hoursx');

  // 3. the tour button sits at the bottom right and has no close control
  const tourPos = await page.evaluate(() => { const r = document.getElementById('tour').getBoundingClientRect(); return innerWidth - r.right < 60 && innerHeight - r.bottom < 60 });
  check('Start the tour is at the bottom right', tourPos);
  check('Start the tour has no close control', await page.evaluate(() => !document.getElementById('tourx')));

  // 4. coworking filters: the count is shown, and "Open now" narrows it
  await page.evaluate(() => { const c = document.querySelector('[data-show="cw"]'); if (!c.checked) c.closest('label').click() });
  await page.waitForTimeout(800);
  await page.click('#cwfb');
  await page.waitForTimeout(600);
  const all = await page.textContent('#cwshow');
  await page.click('#cwf label:has(#cwopen)');
  await page.waitForTimeout(400);
  const open = await page.textContent('#cwshow');
  const n = s => +(s.match(/\d+/) || [NaN])[0];
  check('coworking filter shows a count', n(all) > 1000, all);
  check('"Open now" narrows the coworking results', n(open) > 0 && n(open) < n(all), all + ' -> ' + open);
  await page.click('#cwfx');

  // 5. photos: when the photo services can't be reached the panel says so and offers Try again; once they answer
  //    the photos show. The first run is blocked on purpose.
  const services = /wikimedia|panoramax|wikidata|openstreetcam|overpass|mapillary/;
  await page.route(services, r => r.abort());
  await page.fill('#q', 'Lisbon');
  await page.waitForTimeout(800);
  await page.click('#res li button');
  await page.waitForTimeout(3000);
  await page.click('#phbtn');
  await page.waitForTimeout(9000);
  const blocked = await page.evaluate(() => ({ retry: !!document.getElementById('phretry'), text: document.getElementById('phst').textContent }));
  check('photos: failure is reported with Try again', blocked.retry && blocked.text === 'not reached', JSON.stringify(blocked));
  await page.unroute(services);
  await page.click('#phretry');
  await page.waitForTimeout(15000);
  const shown = await page.evaluate(() => document.querySelectorAll('#phg .pht').length);
  check('photos: Try again brings photos back', shown > 0, shown + ' thumbnails');

  // 6. the gallery's close button is clickable (not covered by the photo)
  if (shown > 0) {
    await page.evaluate(() => document.querySelector('#phg .pht').click());
    await page.waitForTimeout(1500);
    const hit = await page.evaluate(() => { const x = document.querySelector('.phbox .phx'); const r = x.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === x });
    check('gallery close button is on top', hit);
    await page.evaluate(() => document.querySelector('.phbox .phx').click());
  }

  // 7. 3D: the 2D globe and the 3D view cross-fade when the view changes
  await page.evaluate(() => document.getElementById('b3d').click());
  await page.waitForTimeout(250);
  const mid = await page.evaluate(() => ({ globe: +getComputedStyle(document.getElementById('c')).opacity, view: +getComputedStyle(document.querySelector('.m3d')).opacity }));
  check('2D and 3D cross-fade on entering 3D', mid.globe < 1 && mid.view > 0, JSON.stringify(mid));
  await page.waitForFunction(() => document.body.classList.contains('in3d'), null, { timeout: 60000 });
  await page.evaluate(() => document.getElementById('b3d').click());
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(failed ? failed + ' check(s) failed' : 'all ' + results.length + ' checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('feature test error:', e.message); process.exit(1) });
