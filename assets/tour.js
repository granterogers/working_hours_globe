// Guided tour. It works the real controls the way a person would (a cursor moves to them and clicks, typing goes into
// the search, layers, filters, photos, the forecast, base maps and 3D are all opened from their buttons) and points at
// real places on the map. Every step waits for the thing it shows to be ready, with a time limit, so a slow service
// can't hold the tour up; if something cannot be found the step still shows its card and says so in the console.
// When the tour ends, the layers, base map, 3D view, working-hours settings and favourites are put back as they were.
// To change the tour, edit STEPS below. The app exposes what the tour needs on window.whg and window.whgTour.
(function(){
const $=s=>document.querySelector(s);
// the first element matching `sel` that is actually on screen (panels and galleries stay in the page while hidden)
const shown=sel=>[...document.querySelectorAll(sel)].find(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1})||null;
const ABORT={};
const PAD=10,GAP=18,EDGE=12;
// sample photos for the tour, from Wikimedia Commons (CC BY-SA 4.0), used only when the live services have none nearby
const SAMPLES=[['photo-1.jpg','Forte da Esquerda','FortSimplicio1.jpg',1900],['photo-2.jpg','Fort of Carvalha','FortofCarvalha1.jpg',2400],
  ['photo-3.jpg','Forte da Retaguarda','ForteNovo1.jpg',2000],['photo-4.jpg','Fort of Alqueidão','FortAlqueid%C3%A3o4.jpg',2000]]
  .map(([img,title,file,d],i)=>({key:'tour'+i,thumb:'assets/tour/'+img,full:'assets/tour/'+img,lat:38.72,lon:-9.14,d,src:'Wikimedia Commons',author:'',lic:'CC BY-SA 4.0',date:'',link:'https://commons.wikimedia.org/wiki/File:'+file,title}));
const BARCELONA=[2.1686,41.3874],BERLIN=[13.405,52.52],MADRID=[-3.7038,40.4168],LISBON=[-9.1393,38.7223];
// city centres for the cities the tour visits: the search finds regions, so after the region is chosen the tour flies on
// to the city itself
const CITIES={Lisbon:{n:'Lisbon',sub:'Portugal',lon:-9.1393,lat:38.7223,size:0.12,minDeg:0.05,tz:'Europe/London'},
  Barcelona:{n:'Barcelona',sub:'Spain',lon:2.1686,lat:41.3874,size:0.12,minDeg:0.05,tz:'Europe/Paris'},
  Berlin:{n:'Berlin',sub:'Germany',lon:13.405,lat:52.52,size:0.12,minDeg:0.05,tz:'Europe/Paris'},
  Madrid:{n:'Madrid',sub:'Spain',lon:-3.7038,lat:40.4168,size:0.12,minDeg:0.05,tz:'Europe/Paris'}};

// the item of a list nearest to a point
const nearest=(list,[lon,lat])=>list.reduce((best,p)=>{const d=(p.lon-lon)**2+(p.lat-lat)**2;return!best||d<best.d?{p,d}:best},null)?.p||null;

// ---- the engine ------------------------------------------------------------------------------------------------------
let run=null,cursorEl,veil,ring,card,glowEl,cursor,busy=false;
// a wait stops as soon as the tour is ended or moves on, so an old step never carries on into the next one
// a step's waits stop as soon as its tour has ended, so nothing carries on into the view being put back
function wait(ms){const mine=run;return new Promise((res,rej)=>setTimeout(()=>mine&&mine.ended?rej(ABORT):res(),ms))}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// wait for a test to be true, up to `ms`; resolves true or false and never throws for a timeout
async function until(test,ms){const end=Date.now()+ms;for(;;){let ok=false;try{ok=!!test()}catch(e){}if(ok)return true;if(Date.now()>end)return false;await wait(150)}}
async function untilP(test,ms){const end=Date.now()+ms;for(;;){let ok=false;try{ok=!!test()}catch(e){}if(ok)return true;if(Date.now()>end)return false;await pause(150)}}
// the cursor glides to a point, makes a ripple, and then the element is clicked (found again at the moment of the click)
async function moveTo(x,y){cursor.classList.add('on');cursor.style.transform=`translate(${x-4}px,${y-3}px)`;await wait(700)}
function ripple(){cursor.classList.remove('tap');void cursor.offsetWidth;cursor.classList.add('tap')}
async function tap(sel){const el=shown(sel);if(!el){console.warn('Tour could not find:',sel);return false}
  const r=el.getBoundingClientRect();await moveTo(r.left+r.width/2,r.top+r.height/2);ripple();await wait(220);
  (shown(sel)||el).click();await wait(140);return true}
// the cursor points at a place on the map (the map itself is not clicked)
async function pointAt(lon,lat){const p=window.whg.screen(lon,lat);if(!p)return;await moveTo(p.x,p.y);ripple();await wait(400)}
const panelOpen=sel=>{const e=$(sel);return!!e&&!e.hidden&&getComputedStyle(e).display!=='none'};

// ---- interface actions: each acts only when the interface is not already in the wanted state -------------------------
async function ensure2D(){if(window.whg.tilted()){await tap('#b3d');await until(()=>!window.whg.tilted(),6000);await wait(400)}}
// the 3D view opens its map from scratch, so wait for the map's style too
async function set3D(on){if(window.whg.tilted()!==on){await tap('#b3d');await until(()=>window.whg.tilted()===on,9000);
  if(on)await until(()=>{const m=window.whg.map3d();return!!m&&m.isStyleLoaded()},30000);await wait(900)}}
async function setHours(open){const h=$('#hoursset');if(!h||h.hidden===!open)return;await tap('#hoursgear');await wait(300)}
async function setLayer(key,on){const cb=$(`[data-show="${key}"]`);if(!cb){console.warn('Tour: no layer',key);return}
  if(cb.checked!==on)await tap(`label:has([data-show="${key}"])`);await wait(500)}
async function bmOpen(open){const m=$('#bmmenu');if(!m||m.hidden===!open)return;await tap('#bmbtn');await wait(300)}
async function switchBase(id){await bmOpen(true);await tap(`#bmmenu [data-id="${id}"]`);await wait(1500)}
// the shift start time is changed through its input, one hour at a time, so the colours visibly move
async function setShift(times){const s=$('#s');if(!s)return;for(const t of times){s.value=t;s.dispatchEvent(new Event('input',{bubbles:true}));await wait(500)}}
// type a place into the search box letter by letter, choose the first match, then fly on to the city
async function searchPlace(text){await tap('#q');const q=$('#q');q.value='';q.dispatchEvent(new Event('input'));
  for(const ch of text){q.value+=ch;q.dispatchEvent(new Event('input',{bubbles:true}));await wait(90)}
  await wait(500);await tap('#res li button');await until(()=>{const i=$('#info');return!!i&&i.classList.contains('show')},6000);
  await wait(900);
  if(CITIES[text]){window.whg.select(CITIES[text]);await until(()=>{const i=$('#info');return!!i&&i.classList.contains('show')},6000);await wait(1600)}}
async function zoomOut(){window.whg.zoomTo(1);await wait(1200)}
// turn the globe a number of degrees over a number of milliseconds
async function spin(deg,ms){const t0=performance.now();let last=t0;
  while(performance.now()-t0<ms){const now=performance.now();window.whg.rotate(deg*(now-last)/ms);last=now;await wait(40)}}
// the camera circles a city in 3D: move there, tilt, then turn a half circle, with `halfway` run midway (a new base map
// stops the turn, so the second half carries on from there)
async function orbitCity([lon,lat],halfway){const map=window.whg.map3d();if(!map)return;
  map.easeTo({center:[lon,lat],zoom:14.6,pitch:62,bearing:0,duration:1800});await wait(1900);
  const b0=map.getBearing();
  map.easeTo({bearing:b0+180,duration:6000,easing:t=>t});await wait(3000);if(halfway)await halfway();
  await wait(1200);map.easeTo({bearing:map.getBearing()+120,duration:3000,easing:t=>t});await wait(3200)}
// the photo gallery is closed by its own ×, and by Escape if that doesn't work, so it can't cover the rest of the tour
async function closeGallery(){for(let n=0;n<3;n++){const box=$('.phbox');if(!box||box.hidden)return;const x=$('.phbox .phx');if(x)x.click();await wait(350)}
  const box=$('.phbox');if(box&&!box.hidden)document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(250)}

// ---- the steps --------------------------------------------------------------------------------------------------------
// Each step: title, text, target (a selector that is on screen while the step shows, or null), and enter() which sets the
// interface up and acts the step out. enter() may set glow to a place on the map to light up for the step.
const STEPS=[
  {title:'Plan your working life around the world',
    text:'This map is for digital nomads. Set your working hours in UK time and see, country by country, when a working day falls, then find where to stay: co-living and coworking spaces, the weather and photos for each place. This short tour shows how. Press Esc at any time to stop.',
    target:null,enter:ensure2D},
  {title:'The globe',target:'.m3dmap',
    text:'Every country and time zone is coloured by when a working day falls in UK time. The globe is drawn on your graphics card, so spinning and zooming stay smooth. Drag to spin, scroll or pinch to zoom.',
    enter:ensure2D},
  {title:'Working hours settings',target:'#hoursset',
    text:'The cog beside Working hours opens its settings. Set your shift in UK time and choose winter or summer; the colours move as you change them.',
    enter:async()=>{await setHours(true);await setShift(['09:00'])}},
  {title:'What the colours mean',target:'#bandkey',
    text:'Each colour is one band of UK working hours: six bands in all, each in its own colour. The key stays here while the working-hours layer is on.',
    enter:async()=>{await setHours(false);await setLayer('hours',true)}},
  {title:'Search any place',target:'#search',
    text:'Search a country, state or island. The place is pinned and selected, its card opens, and the globe zooms in on it.',
    enter:()=>searchPlace('Lisbon')},
  {title:'The place card',target:'#info',
    text:'The pin marks the place. The card gives its local time, working-hours band, weather, nearby photos and flights.',
    enter:()=>until(()=>{const i=$('#info');return!!i&&i.classList.contains('show')},6000)},
  {title:'Save a favourite',target:'label:has([data-show="fav"])',
    text:'Click the heart to save a place. It appears on the map as a heart, and in your list.',
    enter:async()=>{await setLayer('fav',true);
      // a place that is already saved would show Remove instead, so the tour starts this step from a clean place
      if(window.whg.favourites().some(f=>Math.abs(f.lon-LISBON[0])<0.01&&Math.abs(f.lat-LISBON[1])<0.01)){
        window.whg.setFavourites(window.whg.favouriteList().filter(f=>!(Math.abs(f.lon-LISBON[0])<0.01&&Math.abs(f.lat-LISBON[1])<0.01)));
        // the card shows the saved state until it is drawn again, so the place is opened afresh
        window.whg.select(CITIES.Lisbon);await until(()=>!!shown('#favadd'),6000);await wait(500)}
      await until(()=>!!shown('#favadd'),3000);await tap('#favadd');
      const f=window.whg.favourites().at(-1);if(f)glowAt(f.lon,f.lat);await wait(1100)}},
  {title:'Photos nearby',target:'#phg',
    text:'The first photos taken close by show straight away. Click one to open the gallery and use the arrows to move through them. All photos nearby opens every picture found.',
    enter:async()=>{await pointAt(LISBON[0],LISBON[1]);
      await until(()=>!!shown('#phg .pht'),12000);
      // the live services sometimes have nothing near a place, so the tour then shows its own credited sample photos
      if(!shown('#phg .pht')){window.whg.setPhotos(SAMPLES);await until(()=>!!shown('#phg .pht'),4000)}
      await wait(500);
      if(shown('#phg .pht')){await tap('#phg .pht');await wait(2200);await tap('.phbox .phnext');await wait(2200);await closeGallery()}
      await tap('#phbtn');await wait(2200);const g=$('.phgrid .phx');if(g)g.click();await wait(350)}},
  {title:'Open in Google Maps',target:'#info a.gmaps',
    text:'Every place has an Open in Google Maps link. It opens the same spot in Google Maps in a new tab, so you can check the streets, transport and reviews, and come back to the map afterwards.'},
  {title:'Flights from here',target:'#fltog',
    text:'Choose a nearby airport and a date, and the route opens in Google Flights.',
    enter:async()=>{await tap('#fltog');await wait(2400)}},
  {title:'Your favourites list',target:'#favgear',
    text:'The gear icon opens your list. The × removes a favourite, so tidy up after yourself.',
    enter:async()=>{await tap('#favgear');await until(()=>!!shown('#favlist .favs .favx'),3000);await wait(1800);
      if(shown('#favlist .favs .favx')){await tap('#favlist .favs li:last-child .favx');await wait(1200)}}},
  {title:'Co-living spaces',target:'label:has([data-show="cl"])',
    text:'Co-living spaces show as green dots. Each one opens to its details when you click it.',
    enter:async()=>{await searchPlace('Barcelona');await setLayer('cl',true);glowAt(...nearestXY(window.whg.coliving(),BARCELONA));await wait(1200)}},
  {title:'Filter co-living spaces',target:'#clf',
    text:'The funnel opens the filters, beside the Layers panel. Filter by type, price, rooms and rating. Here, pop-up stays are switched off and on again.',
    enter:async()=>{await tap('#clfb');await until(()=>!!shown('#clf'),3000);await wait(500);
      await tap('#clf .clchip[data-v="u"]');await wait(1500);await tap('#clf .clchip[data-v="u"]');await wait(2200)}},
  {title:'Coworking spaces',target:'label:has([data-show="cw"])',
    text:'Coworking spaces show as purple dots. They group together when you zoom out, and open up as you zoom in.',
    enter:async()=>{await searchPlace('Berlin');await setLayer('cw',true);glowAt(...nearestXY(window.whg.cowork(),BERLIN));await wait(1200)}},
  {title:'Filter coworking spaces',target:'#cwf',
    text:'Filter by type, operator, opening hours, facilities and more. Here, independent spaces only, then all of them again.',
    enter:async()=>{await tap('#cwfb');await until(()=>!!shown('#cwf'),3000);await wait(500);
      await tap('#cwf [data-cwk="indep"]');await wait(1500);await tap('#cwf [data-cwk="all"]');await wait(2200)}},
  {title:'Each layer’s settings',target:'#lyr',
    text:'The cog and the funnel beside a layer open its settings. Working hours, favourites, co-living and coworking have them. Webcams, current weather, day and night and place names simply switch on and off.',
    enter:async()=>{await setLayer('hours',true);await wait(1000)}},
  {title:'Webcams',target:'label:has([data-show="cams"])',
    text:'Popular webcams in every country. Click a camera to watch its live view.',
    enter:async()=>{await setLayer('cams',true);await wait(1000)}},
  {title:'Current weather',target:'label:has([data-show="weather"])',
    text:'The current temperature at each place shown. The glowing point reads the temperature right now.',
    enter:async()=>{await searchPlace('Madrid');await setLayer('weather',true);
      await until(()=>window.whg.weather().some(p=>p.temp!=null),9000);
      const p=nearest(window.whg.weather().filter(p=>p.temp!=null),{lon:MADRID[0],lat:MADRID[1]});
      if(p)glow(p.lon,p.lat,Math.round(p.temp)+'°C');await wait(1100)}},
  {title:'The forecast',target:'#wx',
    text:'Click Weather on any place card to see the forecast for the coming days.',
    enter:async()=>{await tap('#wxbtn');await until(()=>!!shown('#wxb .wxdays'),9000);await wait(2400);await tap('#wxbtn');await wait(300)}},
  {title:'Day and night',target:'label:has([data-show="night"])',
    text:'The night side of the Earth is shaded, darker the further the sun is below the horizon. The night moves round as the Earth turns.',
    enter:async()=>{for(const k of['cams','cw','cl','weather'])await setLayer(k,false);await setLayer('night',true);await zoomOut();await spin(120,4000)}},
  {title:'Base maps',target:'#bmbtn',
    text:'Switch between base maps. Here: satellite, then topographic, then back to the street map.',
    enter:async()=>{for(const id of['satellite','topo','street'])await switchBase(id)}},
  {title:'3D view',target:'#b3d',
    text:'The 3D button tilts the same globe into real terrain, and tilts it back. Barcelona is just an example: the camera circles the centre of the city, and halfway round it switches to satellite.',
    enter:async()=>{await bmOpen(false);await searchPlace('Barcelona');await set3D(true);await orbitCity(BARCELONA,()=>switchBase('satellite'))}},
  {title:'Compass and location',target:'.tools',
    text:'Point north, or go to your own location.',
    enter:async()=>{await ensure2D();await zoomOut()}},
  {title:'That is the tour',target:null,
    text:'Your layers, panels, favourites and base map are back as they were. The Start the tour button stays at the bottom of the screen until you hide it with its ×.',
    enter:ensure2D}
];

// a glowing point on the map, and the place it is for
function glow(lon,lat,label){run.glow={lon,lat,label}}
function glowAt(lon,lat){run.glow={lon,lat}}
function nearestXY(list,ll){const p=nearest(list,ll);return p?[p.lon,p.lat]:[ll[0],ll[1]]}

// ---- showing a step ---------------------------------------------------------------------------------------------------
// the card stays in one place for the whole tour: the open space between the left-hand column and the right-hand card,
// at the bottom. On a narrow screen it is centred at the bottom.
function place(){if(!run)return;const W=innerWidth,H=innerHeight,root=getComputedStyle(document.documentElement),px=v=>parseFloat(root.getPropertyValue(v))||0;
  const col=px('--col')||280,colr=px('--colr')||300,cw=card.offsetWidth,ch=card.offsetHeight;
  const r=run.steps[run.i].target&&shown(run.steps[run.i].target)?shown(run.steps[run.i].target).getBoundingClientRect():null;
  const hole=r?[Math.max(0,r.left-PAD),Math.max(0,r.top-PAD),Math.min(W,r.right+PAD),Math.min(H,r.bottom+PAD)]:[W/2,H/2,W/2,H/2];
  const[x1,y1,x2,y2]=hole;
  veil.style.clipPath=`polygon(evenodd,0px 0px,${W}px 0px,${W}px ${H}px,0px ${H}px,0px 0px,${x1}px ${y1}px,${x2}px ${y1}px,${x2}px ${y2}px,${x1}px ${y2}px,${x1}px ${y1}px)`;
  if(r){Object.assign(ring.style,{left:x1+'px',top:y1+'px',width:(x2-x1)+'px',height:(y2-y1)+'px'});ring.classList.add('on')}
  else ring.classList.remove('on');
  // the glowing point on the map
  const g=run.glow,p=g&&window.whg.screen(g.lon,g.lat);
  if(p&&p.x>0&&p.y>0&&p.x<W&&p.y<H){glowEl.style.transform=`translate(${p.x-17}px,${p.y-17}px)`;glowEl.classList.add('on');glowEl.firstChild.textContent=g.label||'';glowEl.classList.toggle('lab',!!g.label)}
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

// each step starts from a clean view: the popouts an earlier step opened are closed, so the step's own window is what shows
function tidy(){const g=$('.phgrid');if(g&&!g.hidden)$('.phgrid .phx')?.click();const box=$('.phbox');if(box&&!box.hidden)$('.phbox .phx')?.click();
  for(const[sel,close]of[['#hoursset','#hoursx'],['#clf','#clfx'],['#cwf','#cwfx'],['#favlist','#favlistx'],['#bmmenu','#bmbtn']]){
    const el=$(sel),b=$(close);if(el&&!el.hidden&&b)b.click()}}

async function go(i){if(!run)return;const mine=run;mine.i=i;cursor.classList.remove('on');tidy();render(i);
  mine.glow=null;busy=true;
  try{if(run.steps[i].enter)await run.steps[i].enter()}
  catch(e){if(e!==ABORT)console.warn('Tour step did not finish:',e&&e.message||e)}
  if(run===mine){busy=false;cursor.classList.remove('on');place()}}

// ---- starting and ending ----------------------------------------------------------------------------------------------
function snapshot(){return{boxes:[...document.querySelectorAll('[data-show]')].map(c=>[c.dataset.show,c.checked]),
  folded:$('#lyr')?$('#lyr').classList.contains('folded'):false,start:$('#s')?$('#s').value:'',end:$('#e')?$('#e').value:'',
  basemap:window.whg.basemap(),favs:window.whg.favouriteList()}}
// put the view back: layers, working hours, favourites, base map, 2D, and no panels open
async function restore(s){
  for(const[k,on]of s.boxes){const cb=$(`[data-show="${k}"]`);if(cb&&cb.checked!==on)cb.closest('label').click()}
  const st=$('#s'),en=$('#e');
  if(st&&s.start&&st.value!==s.start){st.value=s.start;st.dispatchEvent(new Event('input',{bubbles:true}))}
  if(en&&s.end&&en.value!==s.end){en.value=s.end;en.dispatchEvent(new Event('input',{bubbles:true}))}
  if(panelOpen('#hoursset'))$('#hoursx').click();
  const l=$('#lyr');if(l&&l.classList.contains('folded')!==s.folded)$('#lyrh').click();
  if(panelOpen('#bmmenu'))$('#bmbtn').click();
  if(window.whg.basemap()!==s.basemap){$('#bmbtn').click();await pause(200);$(`#bmmenu [data-id="${s.basemap}"]`)?.click();if(panelOpen('#bmmenu'))$('#bmbtn').click()}
  if(panelOpen('#clf'))$('#clfx').click();
  if(panelOpen('#cwf'))$('#cwfx').click();
  if(panelOpen('#favlist'))$('#favlistx')?.click();
  if($('#info').classList.contains('show'))$('#infox').click();
  window.whg.setFavourites(s.favs);
  if(window.whg.tilted()){$('#b3d').click();await untilP(()=>!window.whg.tilted(),6000)}}

function start(){if(run)return;
  run={id:Math.random(),steps:STEPS,i:0,glow:null,saved:snapshot()};
  document.body.classList.add('touring');veil.hidden=false;ring.hidden=false;card.hidden=false;glowEl.hidden=false;cursor.hidden=false;
  timer=setInterval(place,300);go(0)}
let timer=null;
async function end(){if(!run)return;const mine=run;mine.ended=true;run=null;clearInterval(timer);cursor.classList.remove('on');busy=false;
  document.body.classList.remove('touring');
  try{await restore(mine.saved)}catch(e){console.warn('Tour could not put everything back:',e&&e.message||e)}
  setTimeout(()=>{if(!run){veil.hidden=ring.hidden=card.hidden=glowEl.hidden=cursor.hidden=true}},600)}

document.body.insertAdjacentHTML('beforeend','<div class="tveil" id="tveil" hidden></div><div class="tring" id="tring" hidden></div><div class="tglow" id="tglow" hidden><span></span></div>'+
  '<svg class="tcursor" id="tcursor" viewBox="0 0 24 24" hidden aria-hidden="true"><path d="M4 2.5v17.2l4.6-4.4 3 6.7 3.2-1.4-3-6.6H19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'+
  '<section class="tcard glass" id="tcard" role="dialog" aria-label="Guided tour" hidden></section>');
veil=$('#tveil');ring=$('#tring');card=$('#tcard');glowEl=$('#tglow');cursor=$('#tcursor');
$('#tour').onclick=start;
addEventListener('resize',place);
// the tour's state, for its test: whether a step is still acting, which step is on show, and whether its target is on screen
window.whgTour={busy:()=>busy,step:()=>run?run.i:-1,steps:()=>STEPS.length,running:()=>!!run,
  targetShown:()=>{if(!run)return false;const t=run.steps[run.i].target;return!t||!!shown(t)},
  title:()=>{const h=card.querySelector('h3');return h?h.textContent:''}};
document.addEventListener('keydown',e=>{if(!run)return;
  if(e.key==='Escape')end();
  else if(e.target.matches('input'))return;
  else if(e.key==='ArrowRight'||e.key==='Enter'){if(run.i===run.steps.length-1)end();else go(run.i+1);e.preventDefault()}
  else if(e.key==='ArrowLeft'&&run.i>0){go(run.i-1);e.preventDefault()}});
})();
