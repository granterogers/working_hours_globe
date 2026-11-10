// Walks the whole guided tour in a browser and checks each step: the step is reached, its target is on screen, its
// card sits inside the window, nothing throws, and ending the tour gives back the view it started from.
// It also saves a picture of each step, so the tour can be looked at after a run.
//
//   BASE=http://127.0.0.1:8123/ node tests/tour.js            (set SHOTS=dir to keep the pictures)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.env.BASE || 'http://127.0.0.1:8123/').replace(/\/?$/, '/');
const SHOTS = process.env.SHOTS || '';
const STEP_LIMIT = 75000;   // a step that takes longer than this has got stuck

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [], warnings = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
  page.on('console', m => { const t = m.text(); if (m.type() === 'warning' && /Tour/.test(t)) warnings.push(t.slice(0, 160)); });
  let failed = 0;
  const check = (name, ok, detail = '') => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };

  await page.goto(BASE + 'index.html?t=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.whg && window.whg.ready && window.whg.ready(), null, { timeout: 90000, polling: 500 });
  await page.waitForTimeout(1500);
  const state = () => page.evaluate(() => ({ boxes: [...document.querySelectorAll('[data-show]')].map(c => [c.dataset.show, c.checked]), basemap: window.whg.basemap(), tilted: window.whg.tilted(), favs: window.whg.favouriteList(), start: document.getElementById('s') ? document.getElementById('s').value : '', end: document.getElementById('e') ? document.getElementById('e').value : '' }));
  const before = await state();

  await page.click('#tour');
  const total = await page.evaluate(() => window.whgTour.steps());
  check('tour starts', total > 0, total + ' steps');
  for (let i = 1; i <= total; i++) {
    const t0 = Date.now();
    // wait until this step is the one on show and has finished acting
    const reached = await page.waitForFunction(n => {
      const t = document.querySelector('#tcard .tstep'); return t && +t.textContent.split(' of ')[0] === n && !(window.whgTour && window.whgTour.busy());
    }, i, { timeout: STEP_LIMIT, polling: 500 }).then(() => true).catch(() => false);
    const info = await page.evaluate(() => {
      const card = document.getElementById('tcard'), r = card.getBoundingClientRect();
      const title = card.querySelector('h3') ? card.querySelector('h3').textContent : '';
      return { title, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, targetShown: window.whgTour.targetShown() };
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    check(`step ${i} reached: ${info.title}`, reached, secs + 's');
    check(`step ${i} card inside the window`, info.inside);
    check(`step ${i} points at something on screen`, info.targetShown);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `step-${String(i).padStart(2, '0')}.png`) }); }
    if (!reached) break;
    // the step's own Next (a direct click, so the test doesn't depend on the page's animation frames)
    await page.evaluate(() => { const b = document.getElementById('tnext'); if (b) b.click(); });
  }
  // the last step's Done ends the tour, and the view is back as it was
  await page.waitForTimeout(1200);
  const after = await state();
  const running = await page.evaluate(() => window.whgTour.running());
  check('tour ends', !running && !(await page.evaluate(() => document.body.classList.contains('touring'))));
  check('the layers are back as they were', JSON.stringify(before.boxes) === JSON.stringify(after.boxes), '');
  check('the base map is back', before.basemap === after.basemap, before.basemap + ' → ' + after.basemap);
  check('the view is 2D again', before.tilted === after.tilted);
  check('the favourites are back as they were', JSON.stringify(before.favs) === JSON.stringify(after.favs), before.favs.length + ' → ' + after.favs.length);
  check('the working hours are back as they were', before.start === after.start && before.end === after.end, before.start + '–' + before.end + ' → ' + after.start + '–' + after.end);
  check('no tour warnings', warnings.length === 0, warnings.slice(0, 4).join(' | '));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(failed ? `${failed} tour check(s) failed` : 'tour checks passed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TOUR TEST ERROR', e.message); process.exit(1) });
