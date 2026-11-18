// Guided tour. It works the real controls the way a person would: a cursor moves to them and clicks, typing goes into the
// search, and the layers, their settings and filters, the place card, photos, forecast, flights, favourites, base maps,
// 3D view and compass are all opened from their own buttons. It points at real places on the map.
// It starts from a known state whatever the reader had switched on, so it looks the same every time. Every step waits for
// what it shows to be ready, with a time limit, so a slow service can't hold it up. When the tour ends, the layers, base
// map, 3D view, working-hours settings and favourites are put back as they were.
// To change the tour, edit STEPS below. The app exposes what the tour needs on window.whg and window.whgTour.
(function(){
const $=s=>document.querySelector(s);
// the first element matching `sel` that is actually on screen (panels and galleries stay in the page while hidden)
const shown=sel=>[...document.querySelectorAll(sel)].find(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1})||null;
const isOpenEl=sel=>{const e=$(sel);return!!e&&!e.hidden&&e.getBoundingClientRect().width>1};
const ABORT={};
const trace=(...a)=>{if(window.whgTourDebug)console.log('TRACE',...a)};
const PAD=3,GAP=18,EDGE=12;

// the layers the tour starts from, whatever the reader had on or off: the working-hours colours, saved places, night and names
const BASE_LAYERS={hours:true,fav:true,cl:false,cw:false,cams:false,weather:false,night:true,names:true};
// sample photos for the tour, from Wikimedia Commons (CC BY-SA 4.0), used only when the live services have none nearby
const SAMPLES=[['photo-1.jpg','Forte da Esquerda','FortSimplicio1.jpg',1900],['photo-2.jpg','Fort of Carvalha','FortofCarvalha1.jpg',2400],
  ['photo-3.jpg','Forte da Retaguarda','ForteNovo1.jpg',2000],['photo-4.jpg','Fort of Alqueidão','FortAlqueid%C3%A3o4.jpg',2000]]
  .map(([img,title,file,d],i)=>({key:'tour'+i,thumb:'assets/tour/'+img,full:'assets/tour/'+img,lat:38.72,lon:-9.14,d,src:'Wikimedia Commons',author:'',lic:'CC BY-SA 4.0',date:'',link:'https://commons.wikimedia.org/wiki/File:'+file,title}));
const LISBON=[-9.1393,38.7223],BARCELONA=[2.1686,41.3874],BERLIN=[13.405,52.52],MADRID=[-3.7038,40.4168];
// the cities the tour visits: the search finds a region, then the tour flies on to the city itself
const CITIES={Lisbon:{n:'Lisbon',sub:'Portugal',lon:-9.1393,lat:38.7223,size:0.12,minDeg:0.05,tz:'Europe/London'},
  Barcelona:{n:'Barcelona',sub:'Spain',lon:2.1686,lat:41.3874,size:0.12,minDeg:0.05,tz:'Europe/Paris'},
  Berlin:{n:'Berlin',sub:'Germany',lon:13.405,lat:52.52,size:0.12,minDeg:0.05,tz:'Europe/Paris'},
  Madrid:{n:'Madrid',sub:'Spain',lon:-3.7038,lat:40.4168,size:0.12,minDeg:0.05,tz:'Europe/Paris'},
  Tokyo:{n:'Tokyo',sub:'Japan',lon:139.6917,lat:35.6895,size:0.12,minDeg:0.05,tz:'Asia/Tokyo'},
  Sydney:{n:'Sydney',sub:'Australia',lon:151.2093,lat:-33.8688,size:0.12,minDeg:0.05,tz:'Australia/Sydney'}};

// the item of a list nearest to a point
const nearest=(list,[lon,lat])=>list.reduce((best,p)=>{const d=(p.lon-lon)**2+(p.lat-lat)**2;return!best||d<best.d?{p,d}:best},null)?.p||null;
const nearestXY=(list,ll)=>{const p=nearest(list,ll);return p?[p.lon,p.lat]:[ll[0],ll[1]]};

// ---- the engine ------------------------------------------------------------------------------------------------------
let run=null,veil,ring,card,glowEl,cursor,busy=false,timer=null,restored=false;
// a wait stops as soon as the tour has ended or moved on, so an old step never carries on into the next one
function wait(ms){const mine=run,st=mine&&mine.step;return new Promise((res,rej)=>setTimeout(()=>mine&&(mine.ended||mine.step!==st)?rej(ABORT):res(),ms))}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// wait for a test to be true, up to `ms`; resolves true or false and never throws for a timeout
async function until(test,ms){const end=Date.now()+ms;for(;;){let ok=false;try{ok=!!test()}catch(e){}if(ok)return true;if(Date.now()>end)return false;await wait(150)}}
async function untilP(test,ms){const end=Date.now()+ms;for(;;){let ok=false;try{ok=!!test()}catch(e){}if(ok)return true;if(Date.now()>end)return false;await pause(150)}}
// the cursor glides to a point, then makes a ripple
async function moveTo(x,y){cursor.classList.add('on');cursor.style.transform=`translate(${x-4}px,${y-3}px)`;await wait(700)}
function ripple(){cursor.classList.remove('tap');void cursor.offsetWidth;cursor.classList.add('tap')}
// wait for an element to be on screen, move the cursor to it and click it (found again at the moment of the click)
async function tap(sel,ms=5000){const ok=await until(()=>!!shown(sel),ms);
  if(!ok){console.warn('Tour could not find:',sel);return false}
  const el=shown(sel);const r=el.getBoundingClientRect();await moveTo(r.left+r.width/2,r.top+r.height/2);ripple();await wait(220);
  (shown(sel)||el).click();await wait(160);return true}
// a city is flown to straight from the list of cities (no typing), and the tour waits until its card shows
async function goCity(name){trace('city',name);window.whg.select(CITIES[name]);await until(()=>isOpenEl('#info')&&cardName().includes(CITIES[name].n),9000);await wait(1000)}
// the cursor moves onto an element and rests there, without clicking it
async function tapHover(sel){const ok=await until(()=>!!shown(sel),5000);if(!ok)return false;const el=shown(sel);const r=el.getBoundingClientRect();await moveTo(r.left+r.width/2,r.top+r.height/2);ripple();await wait(500);return true}
// the cursor points at a place on the map (the map itself is not clicked)
async function pointAt(lon,lat){const p=window.whg.screen(lon,lat);if(!p)return;await moveTo(p.x,p.y);ripple();await wait(400)}
const panelOpen=sel=>{const e=$(sel);return!!e&&!e.hidden&&getComputedStyle(e).display!=='none'};

// a panel's open state, found by its button: the button is pressed until the panel really shows or hides (a few tries)
const PANELS={hoursset:['#hoursset','#hoursgear','#hoursx'],clf:['#clf','#clfb','#clfx'],cwf:['#cwf','#cwfb','#cwfx'],favlist:['#favlist','#favgear','#favlistx'],bmmenu:['#bmmenu','#bmbtn','#bmbtn']};
async function setPanel(panel,openBtn,closeBtn,open){
  for(let n=0;n<3&&isOpenEl(panel)!==open;n++){const b=(open?openBtn:(closeBtn||openBtn));const el=$(b);if(!el)return false;el.click();await until(()=>isOpenEl(panel)===open,1500)}
  await wait(250);return isOpenEl(panel)===open}
async function panel(name,open){const[p,o,c]=PANELS[name];return setPanel(p,o,c,open)}

// ---- interface actions ----------------------------------------------------------------------------------------------
// the 3D view opens its own map, so the tour waits for that map's style too
async function set3D(on){trace('set3D',on);if(window.whg.tilted()!==on){await tap('#b3d');await until(()=>window.whg.tilted()===on,9000);
  if(on)await until(()=>{const m=window.whg.map3d();return!!m&&m.isStyleLoaded()},30000);await wait(900)}}
// a layer is switched with its own row: the row is pressed, then the tour checks the box really changed
async function setLayer(key,on){const cb=$(`[data-show="${key}"]`);if(!cb){console.warn('Tour: no layer',key);return}
  if(cb.checked!==on)await tap(`label:has([data-show="${key}"])`);await until(()=>$(`[data-show="${key}"]`)?.checked===on,2000);await wait(450)}
// the same switch, made without moving the cursor, for setting up a step's starting state
function quietLayer(key,on){const cb=$(`[data-show="${key}"]`);if(cb&&cb.checked!==on)cb.click()}
async function switchBase(id){trace('switchBase',id);if(window.whg.basemap()===id)return;
  await panel('bmmenu',true);await tap(`#bmmenu [data-id="${id}"]`);await until(()=>window.whg.basemap()===id,6000);await wait(1400);await panel('bmmenu',false)}
// the shift start time is changed through its input, one step at a time, so the colours visibly move
async function setShift(times){const s=$('#s');if(!s)return;for(const t of times){s.value=t;s.dispatchEvent(new Event('input',{bubbles:true}));await wait(700)}}
const cardName=()=>(document.querySelector('#info h2')||{}).textContent||'';
// type a place into the search box letter by letter. A city the tour names is chosen from its own entry, so the search
// never lands on a different place of the same name; any other place is chosen from the first result
async function searchPlace(text){trace('search',text);await tap('#q');const q=$('#q');q.value='';q.dispatchEvent(new Event('input'));
  for(const ch of text){q.value+=ch;q.dispatchEvent(new Event('input',{bubbles:true}));await wait(70)}
  await wait(400);
  if(CITIES[text]){window.whg.select(CITIES[text]);await until(()=>isOpenEl('#info')&&cardName().includes(CITIES[text].n),9000);await wait(1600);return}
  await tap('#res li button');await until(()=>isOpenEl('#info'),7000);await wait(1200)}
// turn the globe a number of degrees over a number of milliseconds
async function spin(deg,ms){const t0=performance.now();let last=t0;
  while(performance.now()-t0<ms){const now=performance.now();window.whg.rotate(deg*(now-last)/ms);last=now;await wait(40)}}
// the camera circles a city in 3D: move there, tilt, then turn a half circle, with `halfway` run midway
async function orbitCity([lon,lat],halfway){const map=window.whg.map3d();if(!map)return;
  map.easeTo({center:[lon,lat],zoom:14.6,pitch:62,bearing:0,duration:1800});await wait(1900);
  const b0=map.getBearing();
  map.easeTo({bearing:b0+180,duration:6000,easing:t=>t});await wait(3000);if(halfway)await halfway();
  await wait(1200);map.easeTo({bearing:map.getBearing()+120,duration:3000,easing:t=>t});await wait(3200)}
// the photo gallery is closed by its own ×; the tour waits until it has really gone
async function closeGallery(){for(let n=0;n<4;n++){const box=$('.phbox');if(!box||box.hidden)return;const x=$('.phbox .phx');if(x)x.click();await wait(400)}}
async function openGallery(){await tap('#phg .pht');await until(()=>isOpenEl('.phbox'),5000);await wait(900)}
const cardOpen=()=>isOpenEl('#info');

// ---- the starting state ------------------------------------------------------------------------------------------------
// every step's start is the same: the panels and card closed, the layers as BASE_LAYERS, the street map, 2D, the globe
// whole and the working hours at the default shift and season
async function baseline(){
  for(const n of Object.keys(PANELS))await panel(n,false);
  if(isOpenEl('.phgrid')){$('.phgrid .phx')?.click();await until(()=>!isOpenEl('.phgrid'),2500)}
  if(isOpenEl('.phbox'))await closeGallery();
  if(cardOpen())$('#infox')?.click();
  for(const[k,on]of Object.entries(BASE_LAYERS))quietLayer(k,on);
  if(window.whg.basemap()!=='street'){$('#bmbtn').click();await pause(250);$('#bmmenu [data-id="street"]')?.click();await pause(300)}
  if(window.whg.tilted()){$('#b3d').click();await untilP(()=>!window.whg.tilted(),8000)}
  const s=$('#s'),e=$('#e');if(s&&s.value!=='12:00'){s.value='12:00';s.dispatchEvent(new Event('input',{bubbles:true}))}
  if(e&&e.value!=='20:00'){e.value='20:00';e.dispatchEvent(new Event('input',{bubbles:true}))}
  if($('#w')&&$('#w').getAttribute('aria-pressed')!=='true')$('#w').click();
  window.whg.zoomTo(1);await wait(1400)}

// ---- the steps --------------------------------------------------------------------------------------------------------
// Each step: title, text, target (the element to ring while the step shows, or null), and enter(), which sets the
// interface up and acts the step out. Glow puts a light on a place on the map for the step.
const STEPS=[
  {title:'Plan your working life around the world',
    text:'This map shows, country by country, when a working day falls in UK time. It also shows where to stay: co-living and coworking spaces, weather, photos and flights for every place. This tour walks through each part. Press Esc at any time to stop.',
    target:null,enter:baseline},

  {title:'Moving around the globe',
    text:'Drag to spin the globe. Scroll or pinch to zoom, double-click to zoom in on a spot, and use the + and − keys. The colours update everywhere as you move.',
    target:null,enter:async()=>{await spin(40,2600);window.whg.zoomTo(1.8);await wait(1700);window.whg.zoomTo(1);await wait(1300)}},

  {title:'Working hours',
    text:'Working hours colours every country by when a working day falls in UK time. The cog beside it opens the settings.',
    target:'#hoursgear',enter:async()=>{await setLayer('hours',true);await tap('#hoursgear');await until(()=>isOpenEl('#hoursset'),3000);await wait(700)}},

  {title:'Your shift and season',
    text:'Set when your working day starts in UK time. Winter and Summer follow the clocks, and the colours move with them. The opacity slider sets how strong the colours are.',
    target:'#hoursset',enter:async()=>{await panel('hoursset',true);await setShift(['09:00','10:00','11:00','12:00']);
      await tap('#su');await wait(1200);await tap('#w');await wait(900)}},

  {title:'What the colours mean',
    text:'Six bands, one colour each: Early bird, Classic day, Late start, Afternoon into evening, Evening into night and Overnight. The key stays here while Working hours is on.',
    target:'#bandkey',enter:async()=>{await panel('hoursset',false);await until(()=>isOpenEl('#bandkey'),3000);await wait(500)}},

  {title:'The Layers panel',
    text:'Every layer switches on and off from this panel. The cog or the funnel beside a layer opens its settings. The arrow at the top folds the panel away, and you can bring it back the same way.',
    target:'#lyr',enter:async()=>{await tap('#lyrh');await wait(1100);await tap('#lyrh');await wait(700)}},

  {title:'Favourites',
    text:'Places you save appear on the map as hearts. Switch the layer off and on to see them come and go.',
    target:'label:has([data-show="fav"])',enter:async()=>{await setLayer('fav',false);await wait(800);await setLayer('fav',true)}},

  {title:'Place names',
    text:'Place names label countries, regions, cities, towns and villages. They come in gradually as you zoom in, so the map never gets crowded.',
    target:'label:has([data-show="names"])',enter:async()=>{await setLayer('names',false);await wait(800);await setLayer('names',true);await wait(600)}},

  {title:'Search any place',
    text:'Search for a country, state, island or city. The place is pinned, its card opens and the globe flies to it. Here: Lisbon.',
    target:'#search',enter:()=>searchPlace('Lisbon')},

  {title:'The place card',
    text:'The card gives the place, its local time and the working-hours band there, and how far its hours are from the UK. Below are its time zone, a link to Google Maps, and the weather, photos and flights for this spot.',
    target:'#infob .big',enter:async()=>{await until(cardOpen,4000);await wait(900)}},

  {title:'Open in Google Maps',
    text:'The Open in Google Maps link opens this spot in a new tab, for streets, transport and reviews. The map is still here when you come back.',
    target:'#info a.gmaps',enter:async()=>{await until(cardOpen,4000);await tapHover('#info a.gmaps');await wait(900)}},

  {title:'Save a favourite',
    text:'Click Add to favourites to save a place. It appears as a heart on the map and in your favourites list, and opens again from the heart.',
    target:'#info',enter:async()=>{
      // a place already saved would show as saved, so the tour starts this step from a clean place
      if(window.whg.favourites().some(f=>Math.abs(f.lon-LISBON[0])<0.01&&Math.abs(f.lat-LISBON[1])<0.01)){
        window.whg.setFavourites(window.whg.favouriteList().filter(f=>!(Math.abs(f.lon-LISBON[0])<0.01&&Math.abs(f.lat-LISBON[1])<0.01)));
        window.whg.select(CITIES.Lisbon);await until(()=>!!shown('#favadd'),6000);await wait(500)}
      await until(()=>!!shown('#favadd'),3000);await tap('#favadd');
      const f=window.whg.favourites().at(-1);if(f)glowAt(f.lon,f.lat);await wait(1400)}},

  {title:'Your favourites list',
    text:'The cog beside Favourites opens your list. Each entry has a name, a note and its own card. The × removes a favourite you no longer need.',
    target:'#favgear',enter:async()=>{await tap('#favgear');await until(()=>isOpenEl('#favlist'),3000);await wait(1800)}},

  {title:'Photos nearby',
    text:'Photos taken close to the place show straight away. Click one to open the gallery and move through them with the arrows. All photos nearby opens every picture found.',
    target:'#phg',enter:async()=>{await panel('favlist',false);await pointAt(LISBON[0],LISBON[1]);
      await until(()=>!!shown('#phg .pht'),12000);
      // the live services sometimes have nothing near a place, so the tour then shows its own credited sample photos
      if(!shown('#phg .pht')){window.whg.setPhotos(SAMPLES);await until(()=>!!shown('#phg .pht'),4000)}
      await wait(500);
      if(shown('#phg .pht')){await openGallery();await tap('.phbox .phnext');await wait(1600);await closeGallery()}
      if(await tap('#phbtn')){await until(()=>isOpenEl('.phgrid'),4000);await wait(1800);$('.phgrid .phx')?.click();await until(()=>!isOpenEl('.phgrid'),3000)}}},

  {title:'Weather for a place',
    text:'The weather in the card gives the current conditions. Click it to open the forecast for the days ahead.',
    target:'#wxbtn',enter:async()=>{await tap('#wxbtn');await until(()=>!!shown('#wxb .wxdays')||isOpenEl('#wxb'),9000);await wait(2400);await tap('#wxbtn');await wait(400)}},

  {title:'Flights from here',
    text:'Flights here finds the airports near the place. Pick one and a date, and the route opens in Google Flights.',
    target:'#fltog',enter:async()=>{await tap('#fltog');await wait(2600);await tap('#fltog');await wait(400)}},

  {title:'Co-living spaces',
    text:'Co-living spaces show as green house icons. Turn the layer on, then click a house to see its room types, prices and community.',
    target:'label:has([data-show="cl"])',enter:async()=>{await searchPlace('Barcelona');await setLayer('cl',true);glowAt(...nearestXY(window.whg.coliving(),BARCELONA));await wait(1300)}},

  {title:'Filter co-living spaces',
    text:'The funnel opens the filters: search by name, type (permanent, pop-up or festival), price per month, rooms (private, shared or dorm), minimum stay, rating, region, pop-ups by month, and interests and vibe. A dot on the funnel means filters are on. Here, shared rooms are picked, then cleared again.',
    target:'#clf',enter:async()=>{await tap('#clfb');await until(()=>isOpenEl('#clf'),3000);await wait(1400);
      await tap('#clf .clchip[data-v="shared"]');await wait(1700);await tap('#clf .clchip[data-v="shared"]');await wait(1700)}},

  {title:'Coworking spaces',
    text:'Coworking spaces show as purple desk icons. They thin out when you zoom out, so the busiest areas come first, and open up as you zoom in.',
    target:'label:has([data-show="cw"])',enter:async()=>{await panel('clf',false);await searchPlace('Berlin');await setLayer('cw',true);glowAt(...nearestXY(window.whg.cowork(),BERLIN));await wait(1300)}},

  {title:'Filter coworking spaces',
    text:'The funnel opens the coworking filters: kind (all, independent or chain), brand, opening hours, the contact details that are listed, and facilities such as Wi-Fi, air conditioning and wheelchair access. Here, independent spaces only, then all of them again.',
    target:'#cwf',enter:async()=>{await tap('#cwfb');await until(()=>isOpenEl('#cwf'),3000);await wait(1400);
      await tap('#cwf [data-cwk="indep"]');await wait(1700);await tap('#cwf [data-cwk="all"]');await wait(1700)}},

  {title:'Webcams',
    text:'Public webcams show the view from a place right now. Click a camera to watch it.',
    target:'label:has([data-show="cams"])',enter:async()=>{await panel('cwf',false);await searchPlace('Madrid');await setLayer('cams',true);await wait(1500);
      const cams=window.whg.webcams();if(cams.length){const c=nearest(cams,MADRID);glowAt(c.lon,c.lat);await wait(800);
        if(window.whg.openWebcam(c.lon,c.lat)){await until(cardOpen,4000);await wait(2400);$('#infox')?.click();await wait(600)}}}},

  {title:'Current weather',
    text:'Current temperature for each place shown on the map. The glowing point shows the reading right now.',
    target:'label:has([data-show="weather"])',enter:async()=>{await setLayer('weather',true);
      await until(()=>window.whg.weather().some(p=>p.temp!=null),9000);
      const p=nearest(window.whg.weather().filter(p=>p.temp!=null),MADRID);
      if(p)glowAt(p.lon,p.lat);await wait(1400)}},

  {title:'Day and night',
    text:'The night side of the Earth is shaded, darker the further the sun sits below the horizon. The icon layers are switched off here so the night stands out; Working hours stays on, so you can see the colours against the night.',
    target:'label:has([data-show="night"])',enter:async()=>{for(const k of['cams','cw','cl','weather'])quietLayer(k,false);await setLayer('night',false);await wait(800);await setLayer('night',true);
      await toGlobe();await spin(120,4200)}},

  {title:'Base maps',
    text:'Map layers switches the base map: street, satellite, topographic or ocean. The working-hours colours stay on top of every one of them.',
    target:'#bmbtn',enter:async()=>{if(cardOpen())$('#infox')?.click();await until(()=>!cardOpen(),2000);for(const id of['satellite','topo','ocean','street'])await switchBase(id)}},

  {title:'3D view',
    text:'The 3D button tilts the globe into terrain and turns the camera. Here it circles Barcelona, and halfway round the map changes to satellite.',
    target:'#b3d',enter:async()=>{await searchPlace('Barcelona');await set3D(true);await orbitCity(BARCELONA,()=>switchBase('satellite'))}},

  {title:'Back to the globe',
    text:'The 3D button tilts the view back to the globe, and the street map returns.',
    target:'#b3d',enter:async()=>{await toGlobe();await switchBase('street')}},

  {title:'Point north and your location',
    text:'Point north turns the map back to north. Go to my location finds you on the map, once you allow it in the browser.',
    target:'#north',enter:async()=>{await tap('#north');await wait(1500)}},

  {title:'Around the world',
    text:'Every place works the same way: Berlin, Madrid, Tokyo, Sydney. Each one gets its own working-hours band, weather, photos and co-living.',
    target:null,enter:async()=>{for(const c of['Berlin','Madrid','Tokyo','Sydney']){await goCity(c);await wait(900)}}},

  {title:'That is the tour',
    text:'Your layers, panels, favourites and base map are put back as they were. The Get started button stays at the bottom of the screen, so you can take the tour again.',
    target:null,enter:async()=>{await toGlobe()}}
];

// the view on the whole globe: 3D is turned off first, then the map is zoomed out, and the tour waits for it to settle
async function toGlobe(){if(window.whg.tilted()){await tap('#b3d');await until(()=>!window.whg.tilted(),9000)}
  window.whg.zoomTo(1);await wait(1400)}
// a glowing point on the map, and the place it is for
function glowAt(lon,lat,label){run.glow={lon,lat,label}}

// ---- showing a step ---------------------------------------------------------------------------------------------------
// the card stays in one place for the whole tour: the open space at the bottom, between the left column and the right card.
// On a narrow screen it is centred at the bottom.
function place(){if(!run)return;const W=innerWidth,H=innerHeight,root=getComputedStyle(document.documentElement),px=v=>parseFloat(root.getPropertyValue(v))||0;
  const col=px('--col')||280,colr=px('--colr')||300,cw=card.offsetWidth,ch=card.offsetHeight;
  const t=run.steps[run.i].target,el=t&&shown(t),r=el?el.getBoundingClientRect():null;
  const hole=r?[Math.max(0,r.left-PAD),Math.max(0,r.top-PAD),Math.min(W,r.right+PAD),Math.min(H,r.bottom+PAD)]:[W/2,H/2,W/2,H/2];
  const[x1,y1,x2,y2]=hole;
  veil.style.clipPath=`polygon(evenodd,0px 0px,${W}px 0px,${W}px ${H}px,0px ${H}px,0px 0px,${x1}px ${y1}px,${x2}px ${y1}px,${x2}px ${y2}px,${x1}px ${y2}px,${x1}px ${y1}px)`;
  // while the photo gallery is open it covers the window, so the ring and the glow step aside until it closes
  const gal=$('.phbox');const galOpen=!!gal&&!gal.hidden;
  if(r&&!galOpen){Object.assign(ring.style,{left:x1+'px',top:y1+'px',width:(x2-x1)+'px',height:(y2-y1)+'px'});ring.classList.add('on')}
  else ring.classList.remove('on');
  // the glowing point on the map
  const g=run.glow,p=g&&window.whg.screen(g.lon,g.lat);
  if(p&&!galOpen&&p.x>0&&p.y>0&&p.x<W&&p.y<H){glowEl.style.transform=`translate(${p.x-17}px,${p.y-17}px)`;glowEl.classList.add('on');glowEl.firstChild.textContent=g.label||'';glowEl.classList.toggle('lab',!!g.label)}
  else glowEl.classList.remove('on');
  let x,y;
  if(W<1000){x=(W-cw)/2;y=H-ch-24}
  else{const left=EDGE+col+28+col+GAP,right=W-EDGE-colr-GAP;x=(left+right)/2-cw/2;y=H-ch-24}
  card.style.left=Math.max(EDGE,x)+'px';card.style.top=Math.max(EDGE,y)+'px'}

function render(i){const s=run.steps[i],last=run.steps.length-1;
  card.innerHTML=`<p class="tstep">${i+1} of ${run.steps.length}</p><h3>${s.title}</h3><p>${s.text}</p>
    <div class="tbar"><i style="width:${((i+1)/run.steps.length*100).toFixed(0)}%"></i></div>
    <div class="tbtns"><button type="button" id="tback"${i?'':' disabled'}>Back</button><button type="button" class="tprimary" id="tnext">${i===last?'Done':'Next'}</button></div>
    <button type="button" class="tx" id="tclose" aria-label="End tour">×</button>`;
  card.querySelector('#tback').onclick=()=>go(run.i-1);
  card.querySelector('#tnext').onclick=()=>run.i===last?end():go(run.i+1);
  card.querySelector('#tclose').onclick=end;
  card.querySelector('#tnext').focus({preventScroll:true})}

// each step starts from a clean view: a gallery or popout an earlier step opened is closed, and the tour waits for it
async function tidy(){if(isOpenEl('.phgrid')){$('.phgrid .phx')?.click();await until(()=>!isOpenEl('.phgrid'),2500)}
  if(isOpenEl('.phbox'))await closeGallery();
  for(const name of['hoursset','clf','cwf','favlist','bmmenu'])await panel(name,false)}

async function go(i){if(!run)return;trace('go',i);const mine=run;mine.i=i;mine.step=(mine.step||0)+1;busy=true;cursor.classList.remove('on');render(i);
  try{await tidy()}catch(e){if(e===ABORT)return}
  if(run!==mine)return;
  const my=mine.step;mine.glow=null;busy=true;
  // a step that has not finished within its time is left behind, so the tour can never stop on one step
  const dog=setTimeout(()=>{if(run===mine&&mine.step===my){console.warn('Tour step ran long, moving on:',run.steps[i].title);mine.step++;if(i+1<run.steps.length)go(i+1);else end()}},200000);
  try{if(run.steps[i].enter)await run.steps[i].enter()}
  catch(e){if(e!==ABORT)console.warn('Tour step did not finish:',e&&e.message||e)}
  clearTimeout(dog);
  if(run===mine&&mine.step===my){busy=false;place()}}

// ---- starting and ending ----------------------------------------------------------------------------------------------
function snapshot(){return{boxes:[...document.querySelectorAll('[data-show]')].map(c=>[c.dataset.show,c.checked]),
  folded:$('#lyr')?$('#lyr').classList.contains('folded'):false,start:$('#s')?$('#s').value:'',end:$('#e')?$('#e').value:'',
  season:$('#su')&&$('#su').getAttribute('aria-pressed')==='true'?'su':'w',
  basemap:window.whg.basemap(),favs:window.whg.favouriteList(),zoomable:true}}
// put the view back: layers, working hours, favourites, base map, 2D, and no panels open
async function restore(s){
  for(const[k,on]of s.boxes){const cb=$(`[data-show="${k}"]`);if(cb&&cb.checked!==on)cb.click()}
  const st=$('#s'),en=$('#e');
  if(st&&s.start&&st.value!==s.start){st.value=s.start;st.dispatchEvent(new Event('input',{bubbles:true}))}
  if(en&&s.end&&en.value!==s.end){en.value=s.end;en.dispatchEvent(new Event('input',{bubbles:true}))}
  const want=s.season==='su'?'#su':'#w';if($(want)&&$(want).getAttribute('aria-pressed')!=='true')$(want).click();
  for(const n of Object.keys(PANELS))if(panelOpen(PANELS[n][0]))$(PANELS[n][2])?.click();
  const l=$('#lyr');if(l&&l.classList.contains('folded')!==s.folded)$('#lyrh').click();
  if(window.whg.basemap()!==s.basemap){$('#bmbtn').click();await pause(250);$(`#bmmenu [data-id="${s.basemap}"]`)?.click();await pause(300);if(panelOpen('#bmmenu'))$('#bmbtn').click()}
  if(cardOpen())$('#infox').click();
  window.whg.setFavourites(s.favs);
  if(window.whg.tilted()){$('#b3d').click();await untilP(()=>!window.whg.tilted(),6000)}}

function start(){if(run)return;
  run={id:Math.random(),steps:STEPS,i:0,glow:null,saved:snapshot()};
  document.body.classList.add('touring');veil.hidden=false;ring.hidden=false;card.hidden=false;glowEl.hidden=false;cursor.hidden=false;
  restored=false;timer=setInterval(place,300);go(0)}
async function end(){if(!run)return;const mine=run;mine.ended=true;run=null;clearInterval(timer);cursor.classList.remove('on');busy=false;
  document.body.classList.remove('touring');
  try{await restore(mine.saved)}catch(e){console.warn('Tour could not put everything back:',e&&e.message||e)}
  restored=true;
  setTimeout(()=>{if(!run){veil.hidden=ring.hidden=card.hidden=glowEl.hidden=cursor.hidden=true}},600)}

document.body.insertAdjacentHTML('beforeend','<div class="tveil" id="tveil" hidden></div><div class="tring" id="tring" hidden></div><div class="tglow" id="tglow" hidden><span></span></div>'+
  '<svg class="tcursor" id="tcursor" viewBox="0 0 24 24" hidden aria-hidden="true"><path d="M4 2.5v17.2l4.6-4.4 3 6.7 3.2-1.4-3-6.6H19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'+
  '<section class="tcard glass" id="tcard" role="dialog" aria-label="Guided tour" hidden></section>');
veil=$('#tveil');ring=$('#tring');card=$('#tcard');glowEl=$('#tglow');cursor=$('#tcursor');
$('#tour').onclick=start;
// the small × hides the Get started button for this browser; it stays hidden until its saved mark is cleared
const pill=$('#tourpill');try{if(localStorage.getItem('whg.tourHidden')==='1')pill.hidden=true}catch(e){}
$('#tourx').onclick=()=>{pill.hidden=true;try{localStorage.setItem('whg.tourHidden','1')}catch(e){}};
addEventListener('resize',place);
// the tour's state, for its test: which step is on show, whether a step is still acting, and whether its target is on screen
window.whgTour={busy:()=>busy,step:()=>run?run.i:-1,steps:()=>STEPS.length,running:()=>!!run,
  targetShown:()=>{if(!run)return false;const t=run.steps[run.i].target;return!t||!!shown(t)},
  // true once the view has been put back after the tour ends
  restored:()=>restored,
  title:()=>{const h=card.querySelector('h3');return h?h.textContent:''}};
// only the reader's own keys act on the tour; the tour's own clicks and synthetic keys never end it
document.addEventListener('keydown',e=>{if(!run||!e.isTrusted)return;
  if(e.key==='Escape')end();
  else if(e.target.matches('input'))return;
  else if(e.key==='ArrowRight'||e.key==='Enter'){if(run.i===run.steps.length-1)end();else go(run.i+1);e.preventDefault()}
  else if(e.key==='ArrowLeft'&&run.i>0){go(run.i-1);e.preventDefault()}});
})();
