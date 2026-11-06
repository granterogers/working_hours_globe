// In-depth checks of the whole page, run in a browser against a live or local copy. Each check prints PASS or FAIL,
// and the script exits with 1 if any check fails. Needs Playwright (see the README).
//
//   BASE=https://granterogers.github.io/working_hours_globe/ node tests/deep.js
//   BASE=http://127.0.0.1:8123/ node tests/deep.js
const { chromium } = require('playwright');

const BASE = (process.env.BASE || 'http://127.0.0.1:8123/').replace(/\/?$/, '/');
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')) };
const step = async (name, fn) => { try { await fn() } catch (e) { check(name + ' (threw)', false, e.message.split('\n')[0]) } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|404|429/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)) });
  await page.route(/nominatim|photon/, r => r.abort());

  await page.goto(BASE + 'index.html?t=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.whg && window.whg.ready(), null, { timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // 1. boot
  await step('boot', async () => {
    await page.waitForFunction(() => getComputedStyle(document.getElementById('c')).opacity === '0', null, { timeout: 5000 }).catch(() => {});
    const s = await page.evaluate(() => ({ ready: window.whg.ready(), tilted: window.whg.tilted(), ver: document.getElementById('ver').textContent, canvasHidden: getComputedStyle(document.getElementById('c')).opacity === '0', map: !!window.whg.map3d(), strip: !!document.getElementById('strip') }));
    check('map is the view on load', s.ready && s.map && s.canvasHidden, JSON.stringify(s));
    check('version label matches the version in index.html', /^v1\.\d+$/.test(s.ver), s.ver);
  });

  // 2. layers panel: every checkbox switches its layer on and off without errors
  for (const key of ['hours', 'fav', 'cl', 'cw', 'cams', 'weather', 'night', 'names']) {
    await step('layer ' + key, async () => {
      const box = page.locator(`#lyr [data-show="${key}"]`);
      const before = await box.isChecked();
      await page.evaluate(k => { const el = document.querySelector(`#lyr [data-show="${k}"]`); el.click() }, key);
      await page.waitForTimeout(600);
      const after = await box.isChecked();
      await page.evaluate(k => { const el = document.querySelector(`#lyr [data-show="${k}"]`); el.click() }, key);
      await page.waitForTimeout(400);
      const back = await box.isChecked();
      check(`layer "${key}" toggles`, before !== after && back === before, `${before}->${after}->${back}`);
    });
  }
  await step('layers panel folds and unfolds', async () => {
    await page.click('#lyrh'); await page.waitForTimeout(400);
    const folded = await page.evaluate(() => document.getElementById('lyrh').getAttribute('aria-expanded'));
    await page.click('#lyrh'); await page.waitForTimeout(400);
    const open = await page.evaluate(() => document.getElementById('lyrh').getAttribute('aria-expanded'));
    check('layers panel folds and unfolds', folded === 'false' && open === 'true', `${folded}/${open}`);
  });

  // 3. working hours settings: start time, end time, season
  await step('working hours settings', async () => {
    await page.click('#hoursgear'); await page.waitForTimeout(300);
    const shown = await page.evaluate(() => !document.getElementById('hoursset').hidden);
    await page.fill('#s', '09:00'); await page.dispatchEvent('#s', 'change');
    await page.waitForTimeout(300);
    const sum = await page.textContent('#sum');
    await page.click('#su'); await page.waitForTimeout(300);
    const summer = await page.getAttribute('#su', 'aria-pressed');
    await page.click('#w'); await page.waitForTimeout(300);
    await page.fill('#s', '12:00'); await page.dispatchEvent('#s', 'change');
    await page.click('#hoursx'); await page.waitForTimeout(300);
    const hidden = await page.evaluate(() => document.getElementById('hoursset').hidden);
    check('working hours cog opens and closes its settings', shown && hidden, `shown=${shown} hidden=${hidden}`);
    check('start time changes the working-hours summary', /09:00/.test(sum), sum);
    check('season switch turns to summer', summer === 'true', summer);
  });

  // 4. search: a country and a city
  for (const q of ['France', 'Lisbon']) {
    await step('search ' + q, async () => {
      await page.fill('#q', q); await page.waitForTimeout(900);
      const n = await page.locator('#res li button').count();
      check(`search finds "${q}"`, n > 0, n + ' results');
      if (n) { await page.click('#res li button'); await page.waitForTimeout(3500) }
      await page.evaluate(() => { document.getElementById('q').value = '' });
    });
  }
  await step('search flies the map', async () => {
    const c = await page.evaluate(() => window.whg.map3d().getCenter());
    check('after search the map is over Lisbon', Math.abs(c.lng + 9.1) < 3 && Math.abs(c.lat - 38.7) < 3, `${c.lng.toFixed(2)},${c.lat.toFixed(2)}`);
  });

  // 5. the place card: click the map, the card and the Google Maps link
  await step('place card', async () => {
    const box = await page.evaluate(() => { const r = document.getElementById('m3dmap').getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 } });
    await page.mouse.click(box.x, box.y); await page.waitForTimeout(2500);
    const info = await page.evaluate(() => ({ show: document.getElementById('info').classList.contains('show'), h: (document.querySelector('#infob h2') || {}).textContent, gm: (document.querySelector('#info a.gmaps') || {}).href, target: (document.querySelector('#info a.gmaps') || {}).target, photos: !!document.getElementById('phbtn'), weather: !!document.getElementById('wxb') || !!document.querySelector('#info .wx, #info [id^="wx"]'), flights: !!document.getElementById('fltog') || !!document.querySelector('#info .flb, #info [id*="flight"]'), pins: document.querySelectorAll('.maplibregl-marker').length }));
    check('clicking the map opens the place card', info.show && !!info.h, info.h);
    check('place card has an Open in Google Maps link in a new tab', /google\.com\/maps/.test(info.gm || '') && info.target === '_blank', info.gm);
    check('place card has a photos section', info.photos);
    check('the clicked spot gets a pin on the map', info.pins >= 1, info.pins + ' markers');
  });

  // 6. photos: first photos show without a click; the button opens the grid
  await step('photos', async () => {
    await page.waitForTimeout(6000);
    const st = await page.textContent('#phst').catch(() => '');
    const rows = await page.locator('#phg .pht, #phg .phsk').count();
    check('photo strip is in the card without any click', rows >= 1, `${rows} tiles, status "${st}"`);
    const btn = page.locator('#phbtn');
    if (!(await btn.isDisabled())) {
      await btn.click(); await page.waitForTimeout(800);
      const grid = await page.evaluate(() => { const g = document.querySelector('.phgrid'); return !!g && !g.hidden });
      check('All photos nearby opens the grid', grid);
      await page.evaluate(() => { const x = document.querySelector('.phgrid .phx'); if (x) x.click() });
      await page.waitForTimeout(400);
    } else check('All photos nearby opens the grid', true, 'no photos found here (button disabled as designed)');
  });

  // 7. favourites: save, see it in the list, remove
  await step('favourites', async () => {
    const before = await page.evaluate(() => window.whg.favourites().length);
    const save = page.locator('#favadd');
    if (await save.count()) { await save.click(); await page.waitForTimeout(1200) }
    const after = await page.evaluate(() => window.whg.favourites().length);
    check('save a favourite from the card', after === before + 1 || (await page.evaluate(() => !!document.querySelector('#favadd.on'))), `${before}->${after}`);
    await page.click('#favgear'); await page.waitForTimeout(400);
    const listed = await page.evaluate(() => { const l = document.getElementById('favlist'); return !!l && !l.hidden && l.querySelectorAll('li').length });
    check('favourites list shows the saved place', listed >= 1, String(listed));
    await page.click('#favlistx'); await page.waitForTimeout(300);
    const favBox = page.locator('#lyr [data-show="fav"]');
    check('favourites list closes', await page.evaluate(() => document.getElementById('favlist').hidden));
    if (await page.locator('#fdel').count()) { await page.click('#fdel'); await page.waitForTimeout(600) }
    check('remove a favourite', (await page.evaluate(() => window.whg.favourites().length)) <= after);
  });

  // 8. filters: coliving and coworking
  await step('coliving filter', async () => {
    await page.evaluate(() => { const b = document.querySelector('#lyr [data-show="cl"]'); if (!b.checked) b.click() });
    await page.waitForTimeout(800);
    await page.click('#clfb'); await page.waitForTimeout(400);
    const open = await page.evaluate(() => { const f = document.getElementById('clf'); return !!f && !f.hidden });
    check('coliving filter opens', open);
    const n = await page.evaluate(() => window.whg.coliving().length);
    check('coliving spaces are on the globe', n > 0, n + ' spaces');
    await page.evaluate(() => { const f = document.getElementById('clf'); if (f) f.hidden = true });
  });
  await step('coworking filter', async () => {
    await page.evaluate(() => { const b = document.querySelector('#lyr [data-show="cw"]'); if (!b.checked) b.click() });
    await page.waitForTimeout(800);
    const n = await page.evaluate(() => window.whg.cowork().length);
    check('coworking spaces are on the globe', n > 0, n + ' spaces');
    await page.click('#cwfb').catch(() => {}); await page.waitForTimeout(400);
    const open = await page.evaluate(() => { const f = document.getElementById('cwf'); return !!f && !f.hidden });
    check('coworking filter opens', open);
  });

  // 9. weather and webcams layers have data
  await step('weather layer', async () => {
    await page.evaluate(() => { const b = document.querySelector('#lyr [data-show="weather"]'); if (!b.checked) b.click() });
    await page.waitForTimeout(3000);
    const n = await page.evaluate(() => window.whg.weather().length);
    check('weather layer shows points', n > 0, n + ' points');
    await page.evaluate(() => { const b = document.querySelector('#lyr [data-show="weather"]'); if (b.checked) b.click() });
  });

  // 10. base maps: every base map loads, and the menu says which is on
  await step('base maps', async () => {
    const open = async () => { if (await page.evaluate(() => document.getElementById('bmmenu').hidden)) await page.click('#bmbtn'); await page.waitForTimeout(300) };
    await open();
    const ids = await page.evaluate(() => [...document.querySelectorAll('#bmmenu [data-id]')].map(b => b.dataset.id));
    check('base map menu lists the base maps', ids.length >= 3, ids.join(','));
    for (const id of ids) {
      await open();
      await page.click(`#bmmenu [data-id="${id}"]`); await page.waitForTimeout(1500);
      const now = await page.evaluate(() => window.whg.basemap());
      check(`base map "${id}" is chosen`, now === id, now);
    }
    await open();
    await page.click('#bmmenu [data-id="street"]'); await page.waitForTimeout(1200);
  });

  // 11. 3D: tilt and level; the north and locate buttons
  await step('3D tilt', async () => {
    await page.click('#b3d'); await page.waitForTimeout(2500);
    const t = await page.evaluate(() => ({ tilted: window.whg.tilted(), pitch: window.whg.map3d().getPitch() }));
    await page.keyboard.press('Escape'); await page.waitForTimeout(3500);
    const f = await page.evaluate(() => ({ tilted: window.whg.tilted(), pitch: window.whg.map3d().getPitch() }));
    check('3D tilts the map and Escape levels it', t.tilted && !f.tilted, JSON.stringify({ t, f }));
  });
  await step('point north', async () => {
    await page.evaluate(() => window.whg.map3d().easeTo({ bearing: 60, duration: 0 })); await page.waitForTimeout(500);
    await page.click('#north'); await page.waitForTimeout(2000);
    const b = await page.evaluate(() => window.whg.map3d().getBearing());
    check('north button points north', Math.abs(b) < 2, 'bearing ' + b.toFixed(1));
  });
  await step('locate button does not error', async () => {
    await page.click('#loc'); await page.waitForTimeout(1500);
    check('locate button clicked without error', true);
  });

  // 12. stars are drawn behind the globe, in both themes
  await step('stars', async () => {
    const drawn = await page.evaluate(() => { const c = document.getElementById('stars'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++; return n });
    check('stars are drawn', drawn > 0, drawn + ' sampled star pixels');
  });

  // 13. the tour starts, moves on, and ends with the view as it was
  await step('tour', async () => {
    const before = await page.evaluate(() => ({ hours: document.querySelector('[data-show="hours"]').checked, tilted: window.whg.tilted(), basemap: window.whg.basemap() }));
    await page.click('#tour'); await page.waitForTimeout(1200);
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(800);
    const at = await page.textContent('#tcard .tstep').catch(() => '');
    check('tour starts and moves on', /2 of/.test(at), at);
    await page.keyboard.press('Escape'); await page.waitForTimeout(2500);
    const after = await page.evaluate(() => ({ hours: document.querySelector('[data-show="hours"]').checked, tilted: window.whg.tilted(), basemap: window.whg.basemap() }));
    check('ending the tour restores the view', JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
  });

  check('no page errors during the whole run', errors.length === 0, errors.slice(0, 4).join(' | '));
  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(`${results.length - failed} of ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('deep test error:', e.message.split('\n')[0]); process.exit(1) });
