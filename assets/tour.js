// Guided tour. It drives the real controls (clicks, typing into search, layer toggles, 3D) and highlights them,
// so it keeps working as the interface changes. To change the tour, edit STEPS below. A step's `target` is a
// CSS selector; if it doesn't match anything, the card still shows, just without a highlight.
(function(){
const $=s=>document.querySelector(s);
const CANCEL={};
const PAD=10,GAP=18,EDGE=12;

// Each step: title, text, target (selector or null), and an optional enter(ctx) that sets the interface up.
const STEPS=[
  {title:'Welcome to the Working Hours Globe',
    text:'A short guided tour. It moves the globe and types into the search for you. Press Esc to stop, or use the arrow keys to move between steps.',
    target:null,enter:c=>ensure2D(c)},
  {title:'The globe',target:'#c',
    text:'Every country and time zone is coloured by when a working day falls in UK time. Drag to spin, scroll or pinch to zoom.',
    enter:c=>ensure2D(c)},
  {title:'Your working hours',target:'#panel',
    text:'Set your shift in UK time and choose winter or summer. The colours update straight away.',
    enter:c=>setPanel(c,true)},
  {title:'What the colours mean',target:'#bandkey',
    text:'Each colour is a band of UK working hours. The key stays here while the working-hours layer is on.',
    enter:c=>{setPanel(c,false);return setLayer(c,'hours',true)}},
  {title:'Search any place',target:'#search',
    text:'Search a country, state or island. Watch, and the globe flies there.',
    enter:c=>typeSearch(c,'Lisbon')},
  {title:'Place details',target:'#info',
    text:'Click anywhere for the local time, the working-hours band, weather and nearby photos. The heart saves a place as a favourite.',
    enter:c=>waitFor(c,()=>$('#info')&&$('#info').classList.contains('show'),4000)},
  {title:'Layers',target:'#lyr',
    text:'Switch layers on and off. Each one fades in and out, and each one keeps its own filters.',
    enter:c=>{setFolded(c,false);return setLayer(c,'hours',true)}},
  {title:'Co-living spaces',target:'label:has([data-show="cl"])',
    text:'Co-living spaces show as green dots. Click one for details, or use the funnel to filter them.',
    enter:c=>setLayer(c,'cl',true)},
  {title:'Coworking spaces',target:'label:has([data-show="cw"])',
    text:'Coworking spaces show as purple dots. They group together when zoomed out, and open up as you zoom in.',
    enter:c=>setLayer(c,'cw',true)},
  {title:'Current weather',target:'label:has([data-show="weather"])',
    text:'Current temperatures from weather stations around the world.',
    enter:c=>setLayer(c,'weather',true)},
  {title:'Day and night',target:'label:has([data-show="night"])',
    text:'Shows where it is night right now, with city lights on the dark side. The day and night line moves as time passes.',
    enter:c=>setLayer(c,'night',true)},
  {title:'Map layers',target:'#bmbtn',
    text:'Pick a base map, or add your own KML, KMZ or GeoJSON files.',
    enter:c=>{setFolded(c,false);return bmOpen(c,true)}},
  {title:'Favourites',target:'label:has([data-show="fav"])',
    text:'Hearts mark the places you have saved. The gear icon opens your list, where you can remove them.',
    enter:c=>{bmOpen(c,false);return setLayer(c,'fav',true)}},
  {title:'3D view',target:'#b3d',
    text:'Switch to 3D to see real terrain. The day and night and the stars carry across. Press 2D to come back.',
    enter:c=>{bmOpen(c,false);return set3D(c,true)}},
  {title:'Compass and location',target:'.tools',
    text:'Point north, go to your own location, or open the full screen.',
    enter:c=>ensure2D(c)},
  {title:'That is the tour',target:null,
    text:'Your layers and panels are back as they were. You can take the tour again at any time with the button at the top right.',
    enter:c=>ensure2D(c)}
];

let active=false,gen=0,idx=0,saved=null,timer=null,veil,ring,card;

function sleep(c,ms){return new Promise((res,rej)=>setTimeout(()=>c.my===gen?res():rej(CANCEL),ms))}
function waitFor(c,test,ms){const end=Date.now()+ms;return(async function loop(){while(!test()){if(Date.now()>end)return;await sleep(c,120)}})()}
function ctx(my){return{my,sleep:ms=>{const c={my};return sleep(c,ms)}}}

// Interface actions. Each one changes state only when it isn't already in the wanted state.
async function ensure2D(c){if(document.body.classList.contains('in3d')){$('#b3d').click();await waitFor(c,()=>!document.body.classList.contains('in3d'),6000);await c.sleep(600)}}
async function set3D(c,on){const is=document.body.classList.contains('in3d');if(is!==on){$('#b3d').click();await waitFor(c,()=>document.body.classList.contains('in3d')===on,9000);await c.sleep(1500)}}
function setPanel(c,open){const p=$('#panel');if(!p)return;if(p.classList.contains('collapsed')===open)$('#ph').click();return c.sleep(450)}
function setFolded(c,folded){const l=$('#lyr');if(!l)return;if(l.classList.contains('folded')!==folded)$('#lyrh').click();return c.sleep(450)}
function bmOpen(c,open){const m=$('#bmmenu');if(!m)return;if(m.hidden===open)$('#bmbtn').click();return c.sleep(500)}
async function setLayer(c,key,on){const cb=$(`[data-show="${key}"]`);if(!cb)return;if(cb.checked!==on)cb.closest('label').click();await c.sleep(1100)}
async function typeSearch(c,text){const q=$('#q');q.focus();q.value='';q.dispatchEvent(new Event('input'));
  for(const ch of text){q.value+=ch;q.dispatchEvent(new Event('input',{bubbles:true}));await c.sleep(120+Math.random()*90)}
  await c.sleep(900);const first=$('#res li button');if(first)first.click();await c.sleep(1500)}

// Spotlight: the veil blurs everything except the hole, the ring outlines the hole and the card sits beside it.
function rectOf(sel){const el=sel&&$(sel);if(!el)return null;const r=el.getBoundingClientRect();return r.width<2||r.height<2?null:r}
function place(){if(!active)return;const W=innerWidth,H=innerHeight,r=rectOf(STEPS[idx].target);
  // the veil is the whole screen with a hole cut out over the target; with no target the hole is a point in the middle
  const hole=r?[Math.max(0,r.left-PAD),Math.max(0,r.top-PAD),Math.min(W,r.right+PAD),Math.min(H,r.bottom+PAD)]:[W/2,H/2,W/2,H/2];
  const[x1,y1,x2,y2]=hole;
  veil.style.clipPath=`polygon(evenodd,0px 0px,${W}px 0px,${W}px ${H}px,0px ${H}px,0px 0px,${x1}px ${y1}px,${x2}px ${y1}px,${x2}px ${y2}px,${x1}px ${y2}px,${x1}px ${y1}px)`;
  if(r){Object.assign(ring.style,{left:x1+'px',top:y1+'px',width:(x2-x1)+'px',height:(y2-y1)+'px'});ring.classList.add('on')}
  else ring.classList.remove('on');
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

async function go(i){const my=++gen;idx=i;render(i);place();
  try{if(STEPS[i].enter)await STEPS[i].enter(ctx(my))}
  catch(e){if(e!==CANCEL)console.warn('Tour step skipped:',e)}
  if(my===gen)place()}

function snapshot(){return{boxes:[...document.querySelectorAll('[data-show]')].map(c=>[c.dataset.show,c.checked]),
  panel:$('#panel')?$('#panel').classList.contains('collapsed'):true,lyr:$('#lyr')?$('#lyr').classList.contains('folded'):false}}
function restore(){if(!saved)return;
  for(const[k,on]of saved.boxes){const cb=$(`[data-show="${k}"]`);if(cb&&cb.checked!==on)cb.closest('label').click()}
  const p=$('#panel');if(p&&p.classList.contains('collapsed')!==saved.panel)$('#ph').click();
  const l=$('#lyr');if(l&&l.classList.contains('folded')!==saved.lyr)$('#lyrh').click();
  if(!$('#bmmenu').hidden)$('#bmbtn').click();
  if($('#info').classList.contains('show'))$('#infox').click();
  if(document.body.classList.contains('in3d'))$('#b3d').click()}

function start(){if(active)return;active=true;saved=snapshot();
  document.body.classList.add('touring');veil.hidden=false;ring.hidden=false;card.hidden=false;
  timer=setInterval(place,350);go(0)}
function end(){if(!active)return;active=false;gen++;clearInterval(timer);
  document.body.classList.remove('touring');restore();saved=null;
  setTimeout(()=>{if(!active){veil.hidden=ring.hidden=card.hidden=true}},600)}

document.body.insertAdjacentHTML('beforeend','<div class="tveil" id="tveil" hidden></div><div class="tring" id="tring" hidden></div><section class="tcard glass" id="tcard" role="dialog" aria-label="Guided tour" hidden></section>');
veil=$('#tveil');ring=$('#tring');card=$('#tcard');
$('#tour').onclick=start;
addEventListener('resize',place);
document.addEventListener('keydown',e=>{if(!active)return;
  if(e.key==='Escape')end();
  else if(e.target.matches('input'))return;
  else if(e.key==='ArrowRight'||e.key==='Enter'){if(idx===STEPS.length-1)end();else go(idx+1);e.preventDefault()}
  else if(e.key==='ArrowLeft'&&idx>0){go(idx-1);e.preventDefault()}});
})();
