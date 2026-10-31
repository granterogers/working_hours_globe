// Guided tour. It drives the real controls (a cursor moves to them and clicks, typing goes into the search, layers,
// filters, photos, the forecast, base maps and 3D are all opened the way a person would open them) and points at real
// places on the map. It keeps working as the interface changes: a step's `target` is a CSS selector, and a missing
// target just shows the card. To change the tour, edit STEPS below. The app exposes what the tour needs on window.whg.
(function(){
const $=s=>document.querySelector(s);
// the first element matching `sel` that is actually on screen (the photo viewer and filters stay in the page while hidden)
const shown=sel=>[...document.querySelectorAll(sel)].find(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1})||null;
const CANCEL={};
const PAD=10,GAP=18,EDGE=12;
// sample photos for the tour, from Wikimedia Commons (CC BY-SA 4.0), used only when the live services have none nearby
const SAMPLES=[['photo-1.jpg','Forte da Esquerda','FortSimplicio1.jpg',1900],['photo-2.jpg','Fort of Carvalha','FortofCarvalha1.jpg',2400],
  ['photo-3.jpg','Forte da Retaguarda','ForteNovo1.jpg',2000],['photo-4.jpg','Fort of Alqueidão','FortAlqueid%C3%A3o4.jpg',2000]]
  .map(([img,title,file,d],i)=>({key:'tour'+i,thumb:'assets/tour/'+img,full:'assets/tour/'+img,lat:38.72,lon:-9.14,d,src:'Wikimedia Commons',author:'',lic:'CC BY-SA 4.0',date:'',link:'https://commons.wikimedia.org/wiki/File:'+file,title}));
const BARCELONA=[2.17,41.385],BERLIN=[13.405,52.52],MADRID=[-3.70,40.42];

// the item of a list nearest to a point
const nearest=(list,[lon,lat])=>list.reduce((best,p)=>{const d=(p.lon-lon)**2+(p.lat-lat)**2;return!best||d<best.d?{p,d}:best},null)?.p||null;

// Each step: title, text, target (selector or null), and enter(c) which sets the interface up and acts out the step.
// enter(c) can set c.glow to a place on the map to light up for the step.
const STEPS=[
  {title:'Welcome to the Working Hours Globe',
    text:'A short guided tour. The cursor does the clicks for you. Press Esc at any time to stop, or use the arrow keys to move between steps.',
    target:null,enter:c=>ensure2D(c)},
  {title:'The globe',target:'#c',
    text:'Every country and time zone is coloured by when a working day falls in UK time. Drag to spin, scroll or pinch to zoom.',
    enter:c=>ensure2D(c)},
  {title:'Working hours settings',target:'#hoursset',
    text:'The cog beside Working hours opens its settings. Set your shift in UK time and choose winter or summer; the colours move as you change them.',
    enter:async c=>{await setHours(c,true);await setShift(c,['12:00','11:00','10:00','09:00'])}},
  {title:'What the colours mean',target:'#bandkey',
    text:'Each colour is a band of UK working hours. The key stays here while the working-hours layer is on.',
    enter:async c=>{await setHours(c,false);await setLayer(c,'hours',true)}},
  {title:'Search any place',target:'#search',
    text:'Search a country, state or island. The place is pinned and selected, its card opens, and the globe zooms in on it.',
    enter:c=>searchPlace(c,'Lisbon')},
  {title:'The place card',target:'#info',
    text:'The pin marks the place. The card gives its local time, working-hours band, weather, nearby photos and flights.',
    enter:c=>waitFor(c,()=>{const i=$('#info');return i&&i.classList.contains('show')},5000)},
  {title:'Save a favourite',target:'#favadd',
    text:'Click the heart to save a place. It appears on the map as a heart, and in your list.',
    enter:async c=>{await setLayer(c,'fav',true);await tap(c,'#favadd');c.glow=window.whg.favourites().at(-1);await c.sleep(1200)}},
  {title:'Photos nearby',target:'#phbtn',
    text:'Click Photos nearby to see pictures taken close by. Click a picture to open the gallery, then use the arrows to move through them.',
    enter:async c=>{const f=window.whg.favourites().at(-1);if(f)await pointAt(c,f.lon,f.lat);await tap(c,'#phbtn');
      await waitFor(c,()=>!!shown('#phg .pht'),12000);
      // the live services sometimes have nothing near a place, so the tour then shows its own credited sample photos
      if(!shown('#phg .pht')){window.whg.setPhotos(SAMPLES);await waitFor(c,()=>!!shown('#phg .pht'),4000)}
      await c.sleep(900);
      if(shown('#phg .pht')){await tap(c,'#phg .pht');await c.sleep(2600);await tap(c,'.phbox .phnext');await c.sleep(2600);await tap(c,'.phbox .phx');await c.sleep(400)}}},
  {title:'Flights from here',target:'#fltog',
    text:'Choose a nearby airport and a date, and the route opens in Google Flights.',
    enter:async c=>{await tap(c,'#fltog');await c.sleep(2400);await tap(c,'#fltog');await c.sleep(300)}},
  {title:'Your favourites list',target:'#favgear',
    text:'The gear icon opens your list. The × removes a favourite, so tidy up after yourself.',
    enter:async c=>{await tap(c,'#favgear');await waitFor(c,()=>!!shown('#favlist .favs .favx'),3000);await c.sleep(2200);
      if(shown('#favlist .favs .favx')){await tap(c,'#favlist .favs li:last-child .favx');await c.sleep(1400)}
      await tap(c,'#favlistx');await c.sleep(300)}},
  {title:'Co-living spaces',target:'label:has([data-show="cl"])',
    text:'Co-living spaces show as green dots. Each one opens to its details when you click it.',
    enter:async c=>{await searchPlace(c,'Barcelona');await setLayer(c,'cl',true);c.glow=nearest(window.whg.coliving(),BARCELONA);await c.sleep(1400)}},
  {title:'Filter co-living spaces',target:'#clf',
    text:'The funnel opens the filters, beside the Layers panel. Filter by type, price, rooms and rating. Here, pop-up stays are switched off and on again.',
    enter:async c=>{await tap(c,'#clfb');await waitFor(c,()=>!!shown('#clf'),3000);await c.sleep(600);
      await tap(c,'#clf .clchip[data-v="u"]');await c.sleep(1800);await tap(c,'#clf .clchip[data-v="u"]');await c.sleep(3200);await tap(c,'#clfx');await c.sleep(300)}},
  {title:'Coworking spaces',target:'label:has([data-show="cw"])',
    text:'Coworking spaces show as purple dots. They group together when you zoom out, and open up as you zoom in.',
    enter:async c=>{await searchPlace(c,'Berlin');await setLayer(c,'cw',true);c.glow=nearest(window.whg.cowork(),BERLIN);await c.sleep(1400)}},
  {title:'Filter coworking spaces',target:'#cwf',
    text:'Filter by type, operator, opening hours, facilities and more. Here, independent spaces only, then all of them again.',
    enter:async c=>{await tap(c,'#cwfb');await waitFor(c,()=>!!shown('#cwf'),3000);await c.sleep(600);
      await tap(c,'#cwf [data-cwk="indep"]');await c.sleep(1800);await tap(c,'#cwf [data-cwk="all"]');await c.sleep(3200);await tap(c,'#cwfx');await c.sleep(300)}},
  {title:'Each layer’s settings',target:'#lyr',
    text:'The cog and the funnel beside a layer open its settings. Working hours, favourites, co-living and coworking have them. Webcams, current weather, day and night and place names simply switch on and off.',
    enter:async c=>{await setLayer(c,'hours',true);await c.sleep(1200)}},
  {title:'Webcams',target:'label:has([data-show="cams"])',
    text:'Popular webcams in every country. Click a camera to watch its live view.',
    enter:async c=>{await setLayer(c,'cams',true);await c.sleep(1200)}},
  {title:'Current weather',target:'label:has([data-show="weather"])',
    text:'The current temperature at each place shown. The glowing point reads the temperature right now.',
    enter:async c=>{await searchPlace(c,'Madrid');await setLayer(c,'weather',true);
      await waitFor(c,()=>window.whg.weather().some(p=>p.temp!=null),9000);
      const p=nearest(window.whg.weather().filter(p=>p.temp!=null),MADRID);if(p)c.glow={lon:p.lon,lat:p.lat,label:Math.round(p.temp)+'°C'};await c.sleep(1200)}},
  {title:'The forecast',target:'#wx',
    text:'Click Weather on any place card to see the forecast for the coming days.',
    enter:async c=>{await tap(c,'#wxbtn');await waitFor(c,()=>!!shown('#wxb .wxdays'),9000);await c.sleep(2600);await tap(c,'#wxbtn');await c.sleep(300)}},
  {title:'Day and night',target:'label:has([data-show="night"])',
    text:'Shades the night side of the Earth, with the city lights shining through. Zoomed out to the globe, the night moves round as the Earth turns.',
    enter:async c=>{for(const k of['cams','cw','cl','weather'])await setLayer(c,k,false);await setLayer(c,'night',true);await zoomOut(c);await spin(c,180,7000)}},
  {title:'Base maps',target:'#bmbtn',
    text:'Switch between base maps. Here: satellite, then topographic, then back to the street map.',
    enter:async c=>{for(const id of['satellite','topo','street']){await switchBase(c,id)}}},
  {title:'3D view',target:'#b3d',
    text:'Real terrain in 3D. Barcelona is just an example: the camera circles the centre of the city, and halfway round it switches to satellite.',
    enter:async c=>{await bmOpen(c,false);await searchPlace(c,'Barcelona');await set3D(c,true);await orbitCity(c,BARCELONA,()=>switchBase(c,'satellite'))}},
  {title:'Compass and location',target:'.tools',
    text:'Point north, go to your own location, or open the full screen.',
    enter:async c=>{await ensure2D(c);await zoomOut(c)}},
  {title:'That is the tour',target:null,
    text:'Your layers, panels, favourites and base map are back as they were. The Start the tour button stays at the bottom of the screen until you hide it with its ×.',
    enter:c=>ensure2D(c)}
];

let active=false,gen=0,idx=0,saved=null,timer=null,cur=null,busy=false,veil,ring,card,glowEl,cursor,pill;

// sleeping and waiting stop as soon as the user moves on, so an old step never carries on into the next one
function sleep(c,ms){return new Promise((res,rej)=>setTimeout(()=>c.my===gen?res():rej(CANCEL),ms))}
async function waitFor(c,test,ms){const end=Date.now()+ms;while(!test()){if(Date.now()>end)return;await sleep(c,120)}}
function ctx(my){const c={my,glow:null};c.sleep=ms=>sleep(c,ms);return c}

// The cursor glides to a point, makes a ripple, then the element is clicked.
async function moveTo(c,x,y){cursor.classList.add('on');cursor.style.transform=`translate(${x-4}px,${y-3}px)`;await c.sleep(850)}
function ripple(){cursor.classList.remove('tap');void cursor.offsetWidth;cursor.classList.add('tap')}
// the element is found again at the moment of the click, because the Layers rows are redrawn as the map changes
async function tap(c,sel){const el=shown(sel);if(!el)return false;const r=el.getBoundingClientRect();
  await moveTo(c,r.left+r.width/2,r.top+r.height/2);ripple();await c.sleep(260);(shown(sel)||el).click();await c.sleep(160);return true}
// the cursor points at a place on the map (the map itself is not clicked)
async function pointAt(c,lon,lat){const p=window.whg.screen(lon,lat);if(!p)return;await moveTo(c,p.x,p.y);ripple();await c.sleep(500)}

// Interface actions. Each one only acts when the interface is not already in the wanted state.
async function ensure2D(c){if(document.body.classList.contains('in3d')){await tap(c,'#b3d');await waitFor(c,()=>!document.body.classList.contains('in3d'),6000);await c.sleep(600)}}
// the 3D view is switched on before its map has loaded, so wait for the map's style too
async function set3D(c,on){if(document.body.classList.contains('in3d')!==on){await tap(c,'#b3d');await waitFor(c,()=>document.body.classList.contains('in3d')===on,9000);
  if(on)await waitFor(c,()=>{const m=window.whg.map3d();return!!m&&m.isStyleLoaded()},30000);await c.sleep(1200)}}
async function setHours(c,open){const h=$('#hoursset');if(!h||h.hidden===!open)return;await tap(c,'#hoursgear');await c.sleep(400)}
async function setLayer(c,key,on){const cb=$(`[data-show="${key}"]`);if(!cb)return;if(cb.checked!==on)await tap(c,`label:has([data-show="${key}"])`);await c.sleep(900)}
async function bmOpen(c,open){const m=$('#bmmenu');if(!m||m.hidden===!open)return;await tap(c,'#bmbtn');await c.sleep(500)}
async function switchBase(c,id){await bmOpen(c,true);await tap(c,`#bmmenu [data-id="${id}"]`);await c.sleep(2400)}
// the shift start time is changed through its input, one hour at a time, so the bands visibly move
async function setShift(c,times){const s=$('#s');if(!s)return;for(const t of times){s.value=t;s.dispatchEvent(new Event('input',{bubbles:true}));await c.sleep(650)}}
// type a place into the search box letter by letter, choose the first match, then zoom in on it
async function searchPlace(c,text){await tap(c,'#q');const q=$('#q');q.value='';q.dispatchEvent(new Event('input'));
  for(const ch of text){q.value+=ch;q.dispatchEvent(new Event('input',{bubbles:true}));await c.sleep(110+Math.random()*80)}
  await c.sleep(800);await tap(c,'#res li button');await waitFor(c,()=>{const i=$('#info');return i&&i.classList.contains('show')},5000);
  await c.sleep(1800);window.whg.zoomBy(1.7);await c.sleep(1100);window.whg.zoomBy(1.5);await c.sleep(1400)}
// zoom out to the whole globe, gently
async function zoomOut(c){window.whg.zoomTo(1);await c.sleep(1400)}
// turn the globe a number of degrees over a number of milliseconds
async function spin(c,deg,ms){const t0=performance.now();let last=t0;
  while(performance.now()-t0<ms){const now=performance.now();window.whg.rotate(deg*(now-last)/ms);last=now;await c.sleep(16)}}
// orbit the camera slowly around a city in 3D: move there, tilt, then turn a full circle. The map animates the turn
// itself. `halfway` runs once, midway round, and the turn stops if the step is left early.
async function orbitCity(c,[lon,lat],halfway){const map=window.whg.map3d();if(!map)return;
  map.easeTo({center:[lon,lat],zoom:14.6,pitch:62,bearing:0,duration:2000});await c.sleep(2100);
  const b0=map.getBearing();
  try{map.easeTo({bearing:b0+300,duration:10000,easing:t=>t});await c.sleep(5000);if(halfway)await halfway();await c.sleep(5000)}
  catch(e){map.stop();throw e}}

// The card stays in one place for the whole tour: the open space between the left-hand column and the right-hand
// card, at the bottom. On a narrow screen it is centred at the bottom.
function place(){if(!active)return;const W=innerWidth,H=innerHeight,root=getComputedStyle(document.documentElement),px=v=>parseFloat(root.getPropertyValue(v))||0;
  const col=px('--col')||280,colr=px('--colr')||300,cw=card.offsetWidth,ch=card.offsetHeight;
  const r=shown(STEPS[idx].target)?.getBoundingClientRect(),hole=r?[Math.max(0,r.left-PAD),Math.max(0,r.top-PAD),Math.min(W,r.right+PAD),Math.min(H,r.bottom+PAD)]:[W/2,H/2,W/2,H/2];
  const[x1,y1,x2,y2]=hole;
  veil.style.clipPath=`polygon(evenodd,0px 0px,${W}px 0px,${W}px ${H}px,0px ${H}px,0px 0px,${x1}px ${y1}px,${x2}px ${y1}px,${x2}px ${y2}px,${x1}px ${y2}px,${x1}px ${y1}px)`;
  if(r){Object.assign(ring.style,{left:x1+'px',top:y1+'px',width:(x2-x1)+'px',height:(y2-y1)+'px'});ring.classList.add('on')}
  else ring.classList.remove('on');
  // the glowing point on the map
  const g=cur&&cur.glow,p=g&&window.whg.screen(g.lon,g.lat);
  if(p&&p.x>0&&p.y>0&&p.x<W&&p.y<H){glowEl.style.transform=`translate(${p.x-17}px,${p.y-17}px)`;glowEl.classList.add('on');glowEl.firstChild.textContent=g.label||'';glowEl.classList.toggle('lab',!!g.label)}
  else glowEl.classList.remove('on');
  let x,y;
  if(W<1000){x=(W-cw)/2;y=H-ch-24}
  else{const left=EDGE+col+28+col+GAP,right=W-EDGE-colr-GAP;x=(left+right)/2-cw/2;y=H-ch-24}
  card.style.left=Math.max(EDGE,x)+'px';card.style.top=Math.max(EDGE,y)+'px'}

function render(i){const s=STEPS[i],last=STEPS.length-1;
  card.innerHTML=`<p class="tstep">${i+1} of ${STEPS.length}</p><h3>${s.title}</h3><p>${s.text}</p>
    <div class="tbar"><i style="width:${((i+1)/STEPS.length*100).toFixed(0)}%"></i></div>
    <div class="tbtns"><button type="button" id="tback"${i?'':' disabled'}>Back</button><button type="button" class="tprimary" id="tnext">${i===last?'Done':'Next'}</button></div>
    <button type="button" class="tx" id="tclose" aria-label="End tour">×</button>`;
  card.querySelector('#tback').onclick=()=>go(idx-1);
  card.querySelector('#tnext').onclick=()=>idx===last?end():go(idx+1);
  card.querySelector('#tclose').onclick=end;
  card.querySelector('#tnext').focus({preventScroll:true})}

async function go(i){const my=++gen;idx=i;cursor.classList.remove('on');render(i);
  const c=cur=ctx(my);place();busy=true;
  try{if(STEPS[i].enter)await STEPS[i].enter(c)}
  catch(e){if(e!==CANCEL)console.warn('Tour step skipped:',e)}
  if(my===gen){busy=false;cursor.classList.remove('on');place()}}

function snapshot(){return{boxes:[...document.querySelectorAll('[data-show]')].map(c=>[c.dataset.show,c.checked]),
  lyr:$('#lyr')?$('#lyr').classList.contains('folded'):false,
  start:$('#s')?$('#s').value:'',end:$('#e')?$('#e').value:'',basemap:window.whg.basemap()}}
function restore(){if(!saved)return;
  for(const[k,on]of saved.boxes){const cb=$(`[data-show="${k}"]`);if(cb&&cb.checked!==on)cb.closest('label').click()}
  const s=$('#s'),e=$('#e');
  if(s&&saved.start&&s.value!==saved.start){s.value=saved.start;s.dispatchEvent(new Event('input',{bubbles:true}))}
  if(e&&saved.end&&e.value!==saved.end){e.value=saved.end;e.dispatchEvent(new Event('input',{bubbles:true}))}
  if($('#hoursset')&&!$('#hoursset').hidden)$('#hoursx').click();
  const l=$('#lyr');if(l&&l.classList.contains('folded')!==saved.lyr)$('#lyrh').click();
  if(!$('#bmmenu').hidden)$('#bmbtn').click();
  if(window.whg.basemap()!==saved.basemap){$('#bmbtn').click();$(`#bmmenu [data-id="${saved.basemap}"]`)?.click();if(!$('#bmmenu').hidden)$('#bmbtn').click()}
  if($('#clf')&&!$('#clf').hidden)$('#clfx').click();
  if($('#cwf')&&!$('#cwf').hidden)$('#cwfx').click();
  if($('#favlist')&&!$('#favlist').hidden)$('#favlistx')?.click();
  if($('#info').classList.contains('show'))$('#infox').click();
  if(document.body.classList.contains('in3d'))$('#b3d').click()}

function start(){if(active)return;active=true;saved=snapshot();
  document.body.classList.add('touring');veil.hidden=false;ring.hidden=false;card.hidden=false;glowEl.hidden=false;cursor.hidden=false;
  timer=setInterval(place,300);go(0)}
function end(){if(!active)return;active=false;gen++;clearInterval(timer);cur=null;cursor.classList.remove('on');
  document.body.classList.remove('touring');restore();saved=null;
  setTimeout(()=>{if(!active){veil.hidden=ring.hidden=card.hidden=glowEl.hidden=cursor.hidden=true}},600)}

document.body.insertAdjacentHTML('beforeend','<div class="tveil" id="tveil" hidden></div><div class="tring" id="tring" hidden></div><div class="tglow" id="tglow" hidden><span></span></div>'+
  '<svg class="tcursor" id="tcursor" viewBox="0 0 24 24" hidden aria-hidden="true"><path d="M4 2.5v17.2l4.6-4.4 3 6.7 3.2-1.4-3-6.6H19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'+
  '<section class="tcard glass" id="tcard" role="dialog" aria-label="Guided tour" hidden></section>');
veil=$('#tveil');ring=$('#tring');card=$('#tcard');glowEl=$('#tglow');cursor=$('#tcursor');pill=$('#tourpill');
$('#tour').onclick=start;
addEventListener('resize',place);
// true while the current step is still acting things out
window.whgTour={busy:()=>busy};
document.addEventListener('keydown',e=>{if(!active)return;
  if(e.key==='Escape')end();
  else if(e.target.matches('input'))return;
  else if(e.key==='ArrowRight'||e.key==='Enter'){if(idx===STEPS.length-1)end();else go(idx+1);e.preventDefault()}
  else if(e.key==='ArrowLeft'&&idx>0){go(idx-1);e.preventDefault()}});
})();
