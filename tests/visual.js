// Integrated visual checks: the page is opened in a real browser, screenshots are taken, and the pixels are checked,
// along with the state of the map. Run it against a live or local copy; it exits with 1 if any check fails.
//
//   BASE=https://granterogers.github.io/working_hours_globe/ node tests/visual.js
//   BASE=http://127.0.0.1:8123/ node tests/visual.js
const { chromium } = require('playwright');

const BASE = (process.env.BASE || 'http://127.0.0.1:8123/').replace(/\/?$/, '/');
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')) };
const step = async (name, fn) => { try { await fn() } catch (e) { check(name + ' (threw)', false, e.message.split('\n')[0]) } };

// pixel statistics of a screenshot, computed in the page (the screenshot is decoded there with a canvas)
async function pixelStats(page, png, box) {
  return page.evaluate(async ({ b64, box }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const x0 = Math.round(box.x0 * img.width), x1 = Math.round(box.x1 * img.width), y0 = Math.round(box.y0 * img.height), y1 = Math.round(box.y1 * img.height);
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let n = 0, black = 0, sum = 0, sumsq = 0;
    for (let i = 0; i < d.length; i += 4) {
      n++; if (d[i] < 10 && d[i + 1] < 10 && d[i + 2] < 10) black++;
      const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; sum += l; sumsq += l * l;
    }
    const mean = sum / n, sd = Math.sqrt(Math.max(0, sumsq / n - mean * mean));
    return { n, blackFrac: black / n, mean, sd };
  }, { b64: png.toString('base64'), box });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
  const MAP = { x0: 0.3, x1: 0.99, y0: 0.05, y1: 0.97 };   // the map area, without the panels along the left and the top right

  // 1. startup: the map is on screen soon, the loading message goes, and the older canvas is not shown first
  const t0 = Date.now();
  await page.goto(BASE + 'index.html?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  await step('startup hides the canvas while the map starts', async () => {
    const s = await page.evaluate(() => ({ booting: document.body.classList.contains('booting'), canvasOp: getComputedStyle(document.getElementById('c')).opacity }));
    check('canvas hidden while the map starts', s.booting && s.canvasOp === '0', JSON.stringify(s));
  });
  await page.waitForFunction(() => window.whg && window.whg.ready(), null, { timeout: 90000 }).catch(() => {});
  const readyIn = ((Date.now() - t0) / 1000).toFixed(1);
  await step('map is ready and the loading message is gone', async () => {
    const s = await page.evaluate(() => ({ ready: window.whg.ready(), loading: !!document.getElementById('loading'), booting: document.body.classList.contains('booting') }));
    check('map becomes ready', s.ready && !s.loading && !s.booting, readyIn + 's, ' + JSON.stringify(s));
  });
  await page.waitForTimeout(6000);

  // 2. the globe is solid: no pure-black see-through patches in the globe, at the opening view
  await step('globe is solid at the opening view', async () => {
    const png = await page.screenshot({ timeout: 150000 });
    const st = await pixelStats(page, png, MAP);
    check('no see-through (pure black) patches on the globe', st.blackFrac < 0.02, 'black ' + (st.blackFrac * 100).toFixed(2) + '%');
  });

  // 3. zoomed in on street level, the map is still solid (this is where the see-through patches appeared)
  await step('zoomed-in street map is solid', async () => {
    await page.evaluate(() => window.whg.map3d().jumpTo({ center: [2.35, 48.85], zoom: 6.5, pitch: 0, bearing: 0 }));
    await page.waitForTimeout(9000);
    const png = await page.screenshot({ timeout: 150000 });
    const st = await pixelStats(page, png, MAP);
    check('no see-through patches when zoomed in', st.blackFrac < 0.03, 'black ' + (st.blackFrac * 100).toFixed(2) + '%');
    await page.evaluate(() => window.whg.map3d().jumpTo({ center: [-20, 25], zoom: 1.4, pitch: 0, bearing: 0 }));
    await page.waitForTimeout(4000);
  });

  // 4. the working-hours colours: one colour per hour, all different, running once round the day
  await step('working-hours colours do not repeat', async () => {
    const cols = await page.evaluate(() => {
      const bar = document.querySelector('.bgrad'); if (!bar) return null;
      return [...bar.style.background.matchAll(/#[0-9a-f]{6}/gi)].map(m => m[0].toLowerCase());
    });
    const distinct = cols ? new Set(cols).size : 0;
    check('a colour for every hour, all different', cols && cols.length >= 24 && distinct >= 20, (cols ? cols.length : 0) + ' stops, ' + distinct + ' distinct');
  });

  // 5. the night is a graduated shade: its alpha takes many values, not one flat step
  await step('night shade is graduated', async () => {
    const alphas = await page.evaluate(async () => {
      const src = window.whg.map3d().getSource('m3d-nightimg'); if (!src) return null;
      const im = new Image(); im.src = src.url; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; const set = new Set();
      for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 0) set.add(d[i]);
      return set.size;
    });
    check('night alpha varies smoothly', alphas !== null && alphas > 20, 'distinct alpha levels: ' + alphas);
  });

  // 6. the hour labels are on the map, with the hours in them
  await step('hour labels are on the map', async () => {
    const labels = await page.evaluate(() => { const src = window.whg.map3d().getSource('m3d-lab'); return src ? src.serialize().data.features.map(f => f.properties.t) : [] });
    check('hour labels with times', labels.length > 100 && /\d\d:\d\d/.test(labels[0] || ''), labels.length + ' labels');
  });

  // 7. the Layers rows: the cogs and filters all sit on the same right-hand edge
  await step('layer controls line up', async () => {
    const rights = await page.evaluate(() => [...document.querySelectorAll('#lyr .bmtick .lslot button')].map(b => Math.round(b.getBoundingClientRect().right)));
    check('cogs and filters share one edge', rights.length >= 3 && new Set(rights).size === 1, JSON.stringify(rights));
  });

  // 8. light only: no theme switch is left
  await step('light only', async () => {
    const s = await page.evaluate(() => ({ themebtn: !!document.getElementById('themebtn'), theme: document.documentElement.dataset.theme }));
    check('light theme only', !s.themebtn && s.theme === 'light', JSON.stringify(s));
  });

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(`${results.length - failed} of ${results.length} visual checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('visual test error:', e.message.split('\n')[0]); process.exit(1) });
