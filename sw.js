// Keeps map tiles (2D and 3D), terrain and the 3D map library on this device, so places you've already looked
// at load instantly next time, even after closing the browser. Tiles are used for up to 14 days; the cache is
// trimmed to the most recent 6,000 items. The app's own files are always fetched fresh.
const CACHE='whg-tiles-v1',MAX_AGE=14*864e5,MAX_ITEMS=6000;
const HOSTS=['tiles.openfreemap.org','server.arcgisonline.com','tiles.maps.eox.at','tile.opentopomap.org','gibs.earthdata.nasa.gov',
  'tiles.mapterhorn.com','cdn.jsdelivr.net','tile.openstreetmap.org'];
// photo thumbnails are kept separately: once seen they're served from the device, up to the most recent 800
const THUMBS='whg-thumbs-v1',MAX_THUMBS=800;
const THUMB_HOSTS=['upload.wikimedia.org','commons.wikimedia.org','api.panoramax.xyz','api.openstreetcam.org'];

self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  for(const k of await caches.keys())if(k.startsWith('whg-tiles-')&&k!==CACHE)await caches.delete(k);
  await self.clients.claim()})()));

let puts=0;
async function trim(){const c=await caches.open(CACHE),keys=await c.keys();if(keys.length<=MAX_ITEMS)return;
  for(const k of keys.slice(0,keys.length-MAX_ITEMS))await c.delete(k)}

async function thumb(req){try{const c=await caches.open(THUMBS),hit=await c.match(req);if(hit)return hit;
    const res=await fetch(req);if(res.ok||res.type==='opaque')c.put(req,res.clone()).then(()=>thumbTrim(c)).catch(()=>{});return res}
  catch(err){return fetch(req)}}
async function thumbTrim(c){const keys=await c.keys();for(const k of keys.slice(0,Math.max(0,keys.length-MAX_THUMBS)))await c.delete(k)}

self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;let u;try{u=new URL(req.url)}catch(err){return}
  if(THUMB_HOSTS.includes(u.hostname)&&req.destination==='image'){e.respondWith(thumb(req));return}
  if(!HOSTS.includes(u.hostname))return;
  // the TileJSON (which says where this week's tiles are) always comes from the network when it can
  if(/\/planet$|tilejson\.json$/.test(u.pathname)){e.respondWith(fetch(req).catch(()=>caches.match(req)));return}
  // anything unexpected here falls back to a plain network request, so the cache can never break the map
  e.respondWith((async()=>{let c,hit;try{c=await caches.open(CACHE);hit=await c.match(req)}catch(err){return fetch(req)}
    if(hit){const t=+hit.headers.get('x-whg-time')||0;if(Date.now()-t<MAX_AGE)return hit}
    try{const res=await fetch(req);
      if(res.ok&&(res.type==='cors'||res.type==='basic')){const body=await res.clone().arrayBuffer(),h=new Headers(res.headers);h.set('x-whg-time',String(Date.now()));
        c.put(req,new Response(body,{status:res.status,statusText:res.statusText,headers:h})).then(()=>{if(++puts%200===0)trim()}).catch(()=>{})}
      return res}
    catch(err){if(hit)return hit;throw err}})())});
