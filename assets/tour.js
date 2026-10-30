// Guided tour. It drives the real controls (a cursor moves to them and clicks, typing goes into the search, layers
// are switched on and off, 3D is opened and the camera is moved) and points at real places on the map. It keeps
// working as the interface changes: a step's `target` is a CSS selector, and a missing target just shows the card.
// To change the tour, edit STEPS below. Helpers that the app exposes for it are on window.whg in assets/app.js.
(function(){
const $=s=>document.querySelector(s);
// the first element matching `sel` that is actually on screen (the photo viewer and filters are kept in the page while hidden)
const shown=sel=>[...document.querySelectorAll(sel)].find(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1})||null;
const CANCEL={};
const PAD=10,GAP=18,EDGE=12;
BARCELONA=[2.17,41.385],BERLIN=[13.405,52.52],MADRID=[-3.70,40.42];

// the point of a list that is nearest to a place
const nearest=(list,[lon,lat])=>list.reduce((best,p)=>{const d=(p.lon-lon)**2+(p.lat-lat)**2;return!best||d<best.d?{p,d}:best},null)?.p||null;

// Each step: title, text, target (selector or null), and enter(c) which sets the interface up and acts out the step.
// `glow` is set by enter(c) to a place on the map to light up for the step.
const STEPS=[
  {title:'Welcome to the Working Hours Globe',
    text:'A short guided tour. The cursor does the clicks for you, and you can press Esc at any time to stop. The arrow keys move between steps.',
    target:null,enter:c=>ensure2D(c)},
  {title:'The globe',target:'#c',
    text:'Every country and time zone is coloured by when a working day falls in UK time. Drag to spin, scroll or pinch to zoom.',
    enter:c=>ensure2D(c)},
  {title:'Your working hours',target:'#panel',
    text:'Set your shift in UK time. Watch the colours move as the start time changes.',
    enter:async c=>{await setPanel(c,true);await setShift(c,['12:00','11:00','10:00','09:00'])}},
  {title:'What the colours mean',target:'#bandkey',
    text:'Each colour is a band of UK working hours. The key stays here while the working-hours layer is on.',
    enter:async c=>{await setPanel(c,false);await setLayer(c,'hours',true)}},
  {title:'Search any place',target:'#search',
    text:'Search a country, state or island. The cursor types, the globe flies there, and the place card opens.',
    enter:c=>searchPlace(c,'Lisbon')},
  {title:'Place details',target:'#info',
    text:'For any place: the local time, the working-hours band, the weather, nearby photos and flights.',
    enter:c=>waitFor(c,()=>{const i=$('#info');return i&&i.classList.contains('show')},5000)},
  {title:'Save a favourite',target:'#favadd',
    text:'Click the heart to save a place. It appears on the map as a heart, and in your list.',
    enter:async c=>{await setLayer(c,'fav',true);await tap(c,'#favadd');c.glow=window.whg.favourites().at(-1);await c.sleep(1200)}},
  {title:'Photos nearby',target:'#phbtn',
    text:'Photos taken near the place. Click one to open the gallery, then use the arrows to move through them.',
    enter:async c=>{await tap(c,'#phbtn');await waitFor(c,()=>!!shown('.pht'),6000);const p=shown('.pht');if(p){await tap(c,'.pht');await c.sleep(1600);await tap(c,'.phbox .phx, .phgp .phx');await c.sleep(300)}}},
  {title:'Flights from here',target:'#fltog',
    text:'Choose a nearby airport and a date, and the route opens in Google Flights.',
    enter:async c=>{await tap(c,'#fltog');await c.sleep(2200)}},
  {title:'Your favourites list',target:'#favgear',
    text:'The gear icon opens your list. The × removes a favourite, so tidy up after yourself.',
    enter:async c=>{await tap(c,'#favgear');await waitFor(c,()=>!!shown('#favlist .favs .favx'),3000);await c.sleep(2200);
      if(shown('#favlist .favs .favx')){await tap(c,'#favlist .favs li:last-child .favx');await c.sleep(1400)}
      await tap(c,'#favlistx');await c.sleep(300)}},
  {title:'Co-living spaces',target:'label:has([data-show="cl"])',
    text:'Co-living spaces show as green dots. Use the funnel to filter by type, price, rooms and rating.',
    enter:async c=>{await searchPlace(c,'Barcelona');await setLayer(c,'cl',true);const p=nearest(window.whg.coliving(),BARCELONA);c.glow=p;await c.sleep(600);await tap(c,'#clfb');await c.sleep(1200);await tap(c,'#clfb');await c.sleep(300)}},
  {title:'Coworking spaces',target:'label:has([data-show="cw"])',
    text:'Coworking spaces show as purple dots. Filter by kind, website, opening hours and confidence in the data.',
    enter:async c=>{await searchPlace(c,'Berlin');await setLayer(c,'cw',true);const p=nearest(window.whg.cowork(),BERLIN);c.glow=p;await c.sleep(600);await tap(c,'#cwfb');await c.sleep(1200);await tap(c,'#cwfb');await c.sleep(300)}},
  {title:'Webcams',target:'label:has([data-show="cams"])',
    text:'Popular webcams in every country. Click a camera to watch its live view.',
    enter:c=>setLayer(c,'cams',true)},
  {title:'Current weather',target:'label:has([data-show="weather"])',
    text:'The current temperature at each place shown. The glowing point reads the temperature right now.',
    enter:async c=>{await searchPlace(c,'Madrid');await setLayer(c,'weather',true);await waitFor(c,()=>window.whg.weather().some(p=>p.temp!=null),7000);
      const p=nearest(window.whg.weather().filter(p=>p.temp!=null),MADRID);if(p)c.glow={lon:p.lon,lat:p.lat,label:Math.round(p.temp)+'°C'};await c.sleep(600)}},
  {title:'Day and night',target:'label:has([data-show="night"])',
    text:'Shades the night side of the Earth, with the city lights shining through. The day and night line moves as time passes.',
    enter:c=>setLayer(c,'night',true)},
  {title:'Base maps',target:'#bmbtn',
    text:'Pick a base map, or add your own KML, KMZ or GeoJSON files from this menu.',
    enter:async c=>{await bmOpen(c,true)}},
  {title:'3D view around Barcelona',target:'#b3d',
    text:'Real terrain in 3D. The camera now circles the centre of Barcelona.',
    enter:async c=>{await bmOpen(c,false);await searchPlace(c,'Barcelona');await set3D(c,true);await orbitCity(c,BARCELONA)}},
  {title:'Compass and location',target:'.tools',
    text:'Point north, go to your own location, or open the full screen.',
    enter:async c=>{await ensure2D(c)}},
  {title:'That is the tour',target:null,
    text:'Your layers, panels and favourites are back as they were. You can take the tour again with the button at the top right.',
    enter:c=>ensure2D(c)}
];

let active=false,gen=0,idx=0,saved=null,timer=null,cur=null,veil,ring,card,glowEl,cursor;

// sleeping and waiting stop as soon as the user moves on, so an old step never carries on into the next one
function sleep(c,ms){return new Promise((res,rej)=>setTimeout(()=>c.my===gen?res():rej(CANCEL),ms))}
async function waitFor(c,test,ms){const end=Date.now()+ms;while(!test()){if(Date.now()>end)return;await sleep(c,120)}}
function ctx(my){const c={my,glow:null};c.sleep=ms=>sleep(c,ms);return c}

// The cursor glides to an element, makes a ripple, then the element is clicked.
async function moveTo(c,x,y){cursor.classList.add('on');cursor.style.transform=`translate(${x-4}px,${y-3}px)`;await c.sleep(850)}
async function tap(c,sel){const el=shown(sel);if(!el)return false;const r=el.getBoundingClientRect();
  await moveTo(c,r.left+r.width/2,r.top+r.height/2);
  cursor.classList.remove('tap');void cursor.offsetWidth;cursor.classList.add('tap');
  await c.sleep(260);el.click();await c.sleep(160);return true}

// Interface actions. Each one only acts when the interface is not already in the wanted state.
async function ensure2D(c){if(document.body.classList.contains('in3d')){await tap(c,'#b3d');await waitFor(c,()=>!document.body.classList.contains('in3d'),6000);await c.sleep(500)}}
async function set3D(c,on){if(document.body.classList.contains('in3d')!==on){await tap(c,'#b3d');await waitFor(c,()=>document.body.classList.contains('in3d')===on,9000);await c.sleep(1200)}}
async function setPanel(c,open){const p=$('#panel');if(!p||p.classList.contains('collapsed')!==open)return;await tap(c,'#ph');await c.sleep(400)}
async function setLayer(c,key,on){const cb=$(`[data-show="${key}"]`);if(!cb)return;if(cb.checked!==on){await tap(c,`label:has([data-show="${key}"])`);}await c.sleep(900)}
async function bmOpen(c,open){const m=$('#bmmenu');if(!m||m.hidden===!open)return;await tap(c,'#bmbtn');await c.sleep(500)}
// the shift start time is changed through its input, one hour at a time, so the bands visibly move
async function setShift(c,times){const s=$('#s');if(!s)return;for(const t of times){s.value=t;s.dispatchEvent(new Event('input',{bubbles:true}));await c.sleep(650)}}
// type a place into the search box letter by letter, then choose the first match
async function searchPlace(c,text){await tap(c,'#q');const q=$('#q');q.value='';q.dispatchEvent(new Event('input'));
  for(const ch of text){q.value+=ch;q.dispatchEvent(new Event('input',{bubbles:true}));await c.sleep(110+Math.random()*80)}
  await c.sleep(800);await tap(c,'#res li button');await waitFor(c,()=>{const i=$('#info');return i&&i.classList.contains('show')},5000);await c.sleep(1400)}
// orbit the camera slowly around a city in 3D: move there, tilt, then turn a full circle
async function orbitCity(c,[lon,lat]){const map=window.whg.map3d();if(!map)return;
  map.easeTo({center:[lon,lat],zoom:14.6,pitch:62,bearing:0,duration:2000});await c.sleep(2100);
  const b0=map.getBearing(),t0=performance.now(),ms=9000;
  while(performance.now()-t0<ms){map.setBearing(b0+300*(performance.now()-t0)/ms);await c.sleep(16)}}

// Spotlight: a light veil with a hole over the target, the ring outlines the hole and the card sits beside it.
function rectOf(sel){const el=sel&&shown(sel);return el?el.getBoundingClientRect():null}
function place(){if(!active)return;const W=innerWidth,H=innerHeight,r=rectOf(STEPS[idx].target);
  const hole=r?[Math.max(0,r.left-PAD),Math.max(0,r.top-PAD),Math.min(W,r.right+PAD),Math.min(H,r.bottom+PAD)]:[W/2,H/2,W/2,H/2];
  const[x1,y1,x2,y2]=hole;
  veil.style.clipPath=`polygon(evenodd,0px 0px,${W}px 0px,${W}px ${H}px,0px ${H}px,0px 0px,${x1}px ${y1}px,${x2}px ${y1}px,${x2}px ${y2}px,${x1}px ${y2}px,${x1}px ${y1}px)`;
  if(r){Object.assign(ring.style,{left:x1+'px',top:y1+'px',width:(x2-x1)+'px',height:(y2-y1)+'px'});ring.classList.add('on')}
  else ring.classList.remove('on');
  // the glowing point on the map
  const g=cur&&cur.glow,p=g&&window.whg.screen(g.lon,g.lat);
  if(p&&p.x>0&&p.y>0&&p.x<W&&p.y<H){glowEl.style.transform=`translate(${p.x-17}px,${p.y-17}px)`;glowEl.classList.add('on');glowEl.firstChild.textContent=g.label||'';glowEl.classList.toggle('lab',!!g.label)}
  else glowEl.classList.remove('on');
  const cw=card.offsetWidth,ch=card.offsetHeight;let x,y;
  if(W<640||!r){x=(W-cw)/2;y=H-ch-24}
  else{const fits=(l,t)=>l>=EDGE&&t>=EDGE&&l+cw<=W-EDGE&&t+ch<=H-EDGE;
    const clampX=v=>Math.min(Math.max(v,EDGE),W-cw-EDGE),clampY=v=>Math.min(Math.max(v,EDGE),H-ch-EDGE);
    const opts=[[clampX(r.left+r.width/2-cw/2),r.bottom+GAP],[clampX(r.left+r.width/2-cw/2),r.top-GAP-ch],
      [r.right+GAP,clampY(r.top+r.height/2-ch/2)],[r.left-GAP-cw,clampY(r.top+r.height/2-ch/2)]];
    const pick=opts.find(([l,t])=>fits(l,t))||[(W-cw)/2,H-ch-24];[x,y]=pick}
  card.style.left=x+'px';card.style.top=y+'px'}

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
  const c=cur=ctx(my);place();
  try{if(STEPS[i].enter)await STEPS[i].enter(c)}
  catch(e){if(e!==CANCEL)console.warn('Tour step skipped:',e)}
  if(my===gen){cursor.classList.remove('on');place()}}

function snapshot(){return{boxes:[...document.querySelectorAll('[data-show]')].map(c=>[c.dataset.show,c.checked]),
  panel:$('#panel')?$('#panel').classList.contains('collapsed'):true,lyr:$('#lyr')?$('#lyr').classList.contains('folded'):false,
  start:$('#s')?$('#s').value:'',end:$('#e')?$('#e').value:''}}
function restore(){if(!saved)return;
  for(const[k,on]of saved.boxes){const cb=$(`[data-show="${k}"]`);if(cb&&cb.checked!==on)cb.closest('label').click()}
  const s=$('#s'),e=$('#e');
  if(s&&saved.start&&s.value!==saved.start){s.value=saved.start;s.dispatchEvent(new Event('input',{bubbles:true}))}
  if(e&&saved.end&&e.value!==saved.end){e.value=saved.end;e.dispatchEvent(new Event('input',{bubbles:true}))}
  const p=$('#panel');if(p&&p.classList.contains('collapsed')!==saved.panel)$('#ph').click();
  const l=$('#lyr');if(l&&l.classList.contains('folded')!==saved.lyr)$('#lyrh').click();
  if(!$('#bmmenu').hidden)$('#bmbtn').click();
  if($('#clf')&&!$('#clf').hidden)$('#clfb').click();
  if($('#cwf')&&!$('#cwf').hidden)$('#cwfb').click();
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
veil=$('#tveil');ring=$('#tring');card=$('#tcard');glowEl=$('#tglow');cursor=$('#tcursor');
$('#tour').onclick=start;
addEventListener('resize',place);
document.addEventListener('keydown',e=>{if(!active)return;
  if(e.key==='Escape')end();
  else if(e.target.matches('input'))return;
  else if(e.key==='ArrowRight'||e.key==='Enter'){if(idx===STEPS.length-1)end();else go(idx+1);e.preventDefault()}
  else if(e.key==='ArrowLeft'&&idx>0){go(idx-1);e.preventDefault()}});
})();
