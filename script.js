// ============================================================
// WIKIBOARD — script.js  Y2K EDITION
// Refactored from wikiboard (3).html (1089 lines single-file)
// Now UMD-modular: WikiEngine (CRDT + board state + sync), Viz, WikiLibrary, AppIntegration
// ============================================================
'use strict';

// ── ENGINE INTEGRATION (UMD) ────────────────────────────────────
let WE = (typeof WikiEngine !== 'undefined' ? WikiEngine : null);
let VizMod = (typeof Viz !== 'undefined' ? Viz : null);
let WikiLib = (typeof WikiLibrary !== 'undefined' ? WikiLibrary : null);

if (WE) {
  console.log('%c ✔ WikiEngine UMD loaded — CRDT board, transforms, XSS-safe, Worker-ready', 'color:#9B30FF;font-family:monospace');
  if (!WE.sanitizeContent || !WE.portAnchor || !WE.mkPath) console.warn('WE missing expected API');
  if (typeof WE.setOf !== 'function' || typeof WE.addAll !== 'function') console.warn('WE setOf/addAll missing');
} else {
  console.warn('WikiEngine not found — using inline fallback (file://)');
}
if (VizMod) console.log('%c ✔ Viz UMD loaded — board SVG, XSS-safe esc()', 'color:#FF2D9B;font-family:monospace');
if (WikiLib) console.log('%c ✔ WikiLibrary loaded —', 'color:#00BFFF;font-family:monospace', WikiLib.list().map(x=>x.id).join(', '));

// ── Helper overrides that delegate to engine if available ────────
function escEngine(s) {
  if (WE && WE.esc) return WE.esc(s);
  if (VizMod && VizMod.esc) return VizMod.esc(s);
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function sanitizeEngine(html, opts) {
  if (WE && WE.sanitizeContent) return WE.sanitizeContent(html, opts);
  const raw = String(html||'');
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(raw,'text/html');
    const paras=[...doc.querySelectorAll('p')].filter(p=>p.textContent.trim().length>15);
    let out='';
    paras.slice(0,5).forEach(p=>{
      let t=p.innerHTML;
      t=t.replace(/<b>/g,'<strong>').replace(/<\/b>/g,'</strong>');
      t=t.replace(/<(?!strong|\/strong|br)[^>]+>/g,'');
      out+= '<p>'+t+'</p>';
    });
    if(!out) out='<p>'+String(raw.replace(/<[^>]+>/g,' ').substring(0,500)).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</p>';
    return out;
  }
  return String(raw.replace(/<[^>]+>/g,' ').substring(0,500));
}
function c2wEngine(cx, cy, scale, tx, ty) {
  if (WE && WE.c2w) return WE.c2w(cx, cy, scale, tx, ty);
  return {x:(cx-tx)/scale, y:(cy-ty)/scale};
}
function w2cEngine(wx, wy, scale, tx, ty) {
  if (WE && WE.w2c) return WE.w2c(wx, wy, scale, tx, ty);
  return {x:wx*scale+tx, y:wy*scale+ty};
}

'use strict';
const W=12000, CX=W/2, CY=W/2;
const $=id=>document.getElementById(id);
const qry=s=>document.querySelector(s);

/* ─ STATE ─ */
const G={
  nodes:{},conns:{},stickies:{},texts:{},images:{},groups:{},
  uid:1,scale:1,tx:0,ty:0,
  tool:'select',
  sel:null,selConn:null,
  pan:{on:false,sx:0,sy:0},
  drag:{on:false,id:null,ox:0,oy:0},
  resize:{on:false,id:null,sx:0,sy:0,w0:0,h0:0},
  conn:{on:false,from:null,side:null},
  ctx:{node:null,conn:null},
  ac:{items:[],idx:-1,timer:null},
  dark:false,
  colIdx:0,
  openOff:0,
};
const id=()=>'x'+(G.uid++);
const canvas=$('canvas'),world=$('world'),svg=$('svg-layer'),dp=$('dp');

/* ─ TRANSFORM ─ */
function applyT(){
  world.style.transform=`translate(${G.tx}px,${G.ty}px) scale(${G.scale})`;
  $('zval').textContent=Math.round(G.scale*100)+'%';
  mmDraw();
}
function zoom(f,cx,cy){
  if(cx===undefined){cx=canvas.clientWidth/2;cy=canvas.clientHeight/2}
  const ps=G.scale;
  G.scale=Math.min(3,Math.max(0.08,G.scale*f));
  const r=G.scale/ps;
  G.tx=cx-r*(cx-G.tx);G.ty=cy-r*(cy-G.ty);
  applyT();
}
function fitScreen(){
  const ids=Object.keys(G.nodes);if(!ids.length)return;
  let mnX=1e9,mnY=1e9,mxX=-1e9,mxY=-1e9;
  ids.forEach(i=>{const n=G.nodes[i];mnX=Math.min(mnX,n.x);mnY=Math.min(mnY,n.y);mxX=Math.max(mxX,n.x+n.w);mxY=Math.max(mxY,n.y+n.h)});
  const pad=80,vw=canvas.clientWidth,vh=canvas.clientHeight-72;
  G.scale=Math.min((vw-pad*2)/(mxX-mnX),(vh-pad*2)/(mxY-mnY),1.4);
  G.tx=pad+(vw-pad*2-(mxX-mnX)*G.scale)/2-mnX*G.scale;
  G.ty=46+pad+(vh-pad*2-(mxY-mnY)*G.scale)/2-mnY*G.scale;
  applyT();
}
function c2w(cx,cy){return{x:(cx-G.tx)/G.scale,y:(cy-G.ty)/G.scale}}
function w2c(wx,wy){return{x:wx*G.scale+G.tx,y:wy*G.scale+G.ty}}
function panTo(nx,ny){G.tx=canvas.clientWidth/2-nx*G.scale;G.ty=canvas.clientHeight/2-ny*G.scale;applyT()}

/* ─ MINIMAP ─ */
const mmc=$('mmc'),mmx=mmc.getContext('2d');
function mmDraw(){
  const MW=138,MH=88;
  mmx.clearRect(0,0,MW,MH);
  mmx.fillStyle=G.dark?'#1a1a1a':'#f7f5f0';mmx.fillRect(0,0,MW,MH);
  const sx=MW/W,sy=MH/W;
  // dots
  mmx.fillStyle=G.dark?'rgba(255,255,255,.06)':'rgba(26,24,20,.07)';
  for(let i=0;i<MW;i+=6)for(let j=0;j<MH;j+=6)mmx.fillRect(i,j,.8,.8);
  // conns
  mmx.strokeStyle='rgba(37,99,235,.25)';mmx.lineWidth=.5;
  Object.values(G.conns).forEach(c=>{
    const fn=G.nodes[c.from],tn=G.nodes[c.to];if(!fn||!tn)return;
    mmx.beginPath();mmx.moveTo((fn.x+fn.w/2)*sx,(fn.y+fn.h/2)*sy);
    mmx.lineTo((tn.x+tn.w/2)*sx,(tn.y+tn.h/2)*sy);mmx.stroke();
  });
  // nodes
  Object.values(G.nodes).forEach(n=>{
    mmx.fillStyle=n.col||'rgba(37,99,235,.12)';
    mmx.strokeStyle='rgba(37,99,235,.4)';mmx.lineWidth=.5;
    mmx.beginPath();mmx.roundRect(n.x*sx,n.y*sy,Math.max(n.w*sx,3),Math.max(n.h*sy,3),1);
    mmx.fill();mmx.stroke();
  });
  // viewport
  mmx.strokeStyle=G.dark?'rgba(255,255,255,.3)':'rgba(26,24,20,.35)';mmx.lineWidth=1;
  mmx.strokeRect(-G.tx/G.scale*sx,-G.ty/G.scale*sy,canvas.clientWidth/G.scale*sx,canvas.clientHeight/G.scale*sy);
}
$('mmap').addEventListener('click',e=>{
  const r=$('mmap').getBoundingClientRect();
  panTo((e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*W);
});

/* ─ WIKI API ─ */
async function wSearch(q){
  const r=await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=6&format=json&origin=*`);
  return(await r.json())[1]||[];
}
async function wSummary(title){
  const r=await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages|info|categories&exintro=1&explaintext=0&pithumbsize=300&titles=${encodeURIComponent(title)}&format=json&origin=*&inprop=url&cllimit=5`);
  const d=await r.json();return Object.values(d.query.pages)[0];
}
async function wImages(title){
  const r=await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=images&imlimit=10&titles=${encodeURIComponent(title)}&format=json&origin=*`);
  const d=await r.json();return(Object.values(d.query.pages)[0].images||[]).map(i=>i.title);
}
async function wImgUrl(title){
  const r=await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=320&titles=${encodeURIComponent(title)}&format=json&origin=*`);
  const d=await r.json();const pg=Object.values(d.query.pages)[0];
  return pg?.imageinfo?.[0]?.thumburl||pg?.imageinfo?.[0]?.url;
}
async function wLinks(title){
  const r=await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=links&pllimit=15&plnamespace=0&titles=${encodeURIComponent(title)}&format=json&origin=*`);
  const d=await r.json();return(Object.values(d.query.pages)[0].links||[]).map(l=>l.title);
}

/* ─ COLORS ─ */
const COLS=[
  {bg:'rgba(37,99,235,.07)',top:'rgba(37,99,235,.4)',mm:'rgba(37,99,235,.15)'},
  {bg:'rgba(220,38,38,.06)',top:'rgba(220,38,38,.4)',mm:'rgba(220,38,38,.15)'},
  {bg:'rgba(217,119,6,.07)',top:'rgba(217,119,6,.4)',mm:'rgba(217,119,6,.15)'},
  {bg:'rgba(22,163,74,.06)',top:'rgba(22,163,74,.4)',mm:'rgba(22,163,74,.15)'},
  {bg:'rgba(124,58,237,.07)',top:'rgba(124,58,237,.4)',mm:'rgba(124,58,237,.15)'},
  {bg:'rgba(8,145,178,.07)',top:'rgba(8,145,178,.4)',mm:'rgba(8,145,178,.15)'},
];

/* ─ OPEN ARTICLE ─ */
async function openArticle(title,fromId,posX,posY){
  const dup=Object.values(G.nodes).find(n=>n.title.toLowerCase()===title.toLowerCase());
  if(dup){if(fromId&&fromId!==dup.id)addConn(fromId,dup.id);selNode(dup.id);panTo(dup.x+dup.w/2,dup.y+dup.h/2);showToast('"'+title+'" already open');return;}
  $('welcome').classList.add('gone');
  const nid=id();
  let x=posX,y=posY;
  if(x===undefined){
    if(fromId){const fn=G.nodes[fromId];x=fn.x+fn.w+70+(Math.random()*40-20);y=fn.y+(Math.random()*180-90);}
    else{x=CX-170+G.openOff*25;y=CY-280+G.openOff*25;G.openOff=(G.openOff+1)%10;}
  }
  const col=COLS[G.colIdx%COLS.length];G.colIdx++;
  const node={id:nid,title,x,y,w:340,h:360,col:col.mm,colObj:col,from:fromId,collapsed:false};
  G.nodes[nid]=node;
  const el=mkNodeEl(node);world.appendChild(el);node.el=el;
  if(fromId)addConn(fromId,nid);
  selNode(nid);updateStat();mmDraw();
  try{
    const pg=await wSummary(title);
    if(pg.missing!==undefined){el.querySelector('.nbody').innerHTML='<p style="color:var(--ink4);font-style:italic">Article not found.</p>';return;}
    node.pageUrl=pg.fullurl;
    renderContent(nid,pg);
  }catch(e){el.querySelector('.nbody').innerHTML='<p style="color:var(--red)">Failed to load.</p>';}
}

/* ─ BUILD NODE ─ */
function mkNodeEl(node){
  const el=document.createElement('div');
  el.className='node';el.id=node.id;
  el.style.cssText=`left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px;border-top:2px solid ${node.colObj.top}`;
  el.innerHTML=`
    <div class="ngrip" data-grip="${node.id}">
      <div class="ndots"><span><b></b><b></b><b></b></span><span><b></b><b></b><b></b></span></div>
      <input class="ntitle" value="${esc(node.title)}" spellcheck="false" data-ti="${node.id}"/>
      <div class="nctrl">
        <button class="ncb" data-nw="${node.id}" title="Wikipedia">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 3h4v2H5v6h6v-2h2v4H3z"/><path d="M8 3h5v5h-2V6.4L7.4 10 6 8.6 9.6 5H8z"/></svg>
        </button>
        <button class="ncb" data-nc="${node.id}" title="Collapse">▾</button>
        <button class="ncb x" data-nd="${node.id}" title="Delete">✕</button>
      </div>
    </div>
    <div class="nbody"><div class="nload"><div class="spin"></div>loading…</div></div>
    <div class="nfoot">
      <span class="ntag">wikipedia</span>
      <div class="ncdot" style="background:${node.colObj.top}" data-dot="${node.id}" title="Change color"></div>
      <div class="nsp"></div>
      <button class="nlink" data-nlink="${node.id}">related ›</button>
    </div>
    <div class="nresize" data-rs="${node.id}">
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M8.5 1v7.5H1" stroke="currentColor" stroke-width="1.2"/><path d="M5 8.5h3.5V5" stroke="currentColor" stroke-width="1.2"/></svg>
    </div>
    ${['top','bottom','left','right'].map(s=>`<div class="port" data-s="${s}" data-p="${node.id}" title="Drag to connect"></div>`).join('')}
  `;
  hookNodeEl(el,node.id);
  return el;
}

function hookNodeEl(el,nid){
  el.querySelector(`[data-grip="${nid}"]`).addEventListener('mousedown',e=>{
    if(e.target.tagName==='INPUT')return;e.preventDefault();e.stopPropagation();
    if(G.tool==='erase'){removeNode(nid);return;}
    startDrag(nid,e);
  });
  const ti=el.querySelector(`[data-ti="${nid}"]`);
  ti.addEventListener('focus',()=>{ti.style.cursor='text'});
  ti.addEventListener('blur',()=>{ti.style.cursor='move';G.nodes[nid]&&(G.nodes[nid].title=ti.value)});
  ti.addEventListener('mousedown',e=>e.stopPropagation());
  el.querySelector(`[data-nd="${nid}"]`).addEventListener('click',e=>{e.stopPropagation();removeNode(nid)});
  el.querySelector(`[data-nw="${nid}"]`).addEventListener('click',e=>{
    e.stopPropagation();const n=G.nodes[nid];if(n)window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(n.title)}`,'_blank');
  });
  el.querySelector(`[data-nc="${nid}"]`).addEventListener('click',e=>{e.stopPropagation();toggleCollapse(nid)});
  el.querySelector(`[data-dot="${nid}"]`).addEventListener('click',e=>{e.stopPropagation();cycleColor(nid)});
  el.querySelector(`[data-nlink="${nid}"]`).addEventListener('click',e=>{e.stopPropagation();loadRelated(nid)});
  el.querySelector(`[data-rs="${nid}"]`).addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();startResize(nid,e)});
  el.querySelectorAll('.port').forEach(p=>{
    p.addEventListener('mousedown',e=>{
      e.preventDefault();e.stopPropagation();
      startConn(nid,p.dataset.s,e);
    });
    p.addEventListener('mouseenter',()=>p.classList.add('hot'));
    p.addEventListener('mouseleave',()=>p.classList.remove('hot'));
  });
  el.addEventListener('mousedown',e=>{
    if(e.target.closest('.port,[data-rs],[data-nd],[data-nw],[data-nc],[data-dot],[data-nlink],.nbody,.ntitle'))return;
    e.stopPropagation();selNode(nid);
  });
  el.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();G.ctx.node=nid;openMenu('nmenu',e.clientX,e.clientY)});
  el.querySelector('.nbody').addEventListener('click',e=>{
    const a=e.target.closest('a.wl');
    if(a){e.preventDefault();e.stopPropagation();openArticle(a.dataset.t,nid);}
    const img=e.target.closest('.wthumb');
    if(img){e.stopPropagation();const n=G.nodes[nid];spawnImg(img.src,img.alt,n.x+n.w+20,n.y);}
  });
}

/* ─ CONTENT ─ */
function renderContent(nid,pg){
  const node=G.nodes[nid];if(!node)return;
  const body=node.el.querySelector('.nbody');
  const raw=pg.extract||'';
  const doc=new DOMParser().parseFromString(raw,'text/html');
  const paras=[...doc.querySelectorAll('p')].filter(p=>p.textContent.trim().length>15);
  let html='';
  paras.slice(0,5).forEach(p=>{
    let t=p.innerHTML;
    // convert <b> tags
    t=t.replace(/<b>/g,'<strong>').replace(/<\/b>/g,'</strong>');
    // strip all other tags
    t=t.replace(/<(?!strong|\/strong|br)[^>]+>/g,'');
    html+=`<p>${t}</p>`;
  });
  if(!html)html=`<p>${esc(raw.replace(/<[^>]+>/g,' ').substring(0,500))}</p>`;
  body.innerHTML=html;
  if(pg.thumbnail){
    const img=document.createElement('img');
    img.src=pg.thumbnail.source;img.className='wthumb';img.alt=node.title;img.loading='lazy';
    body.prepend(img);
  }
}

/* ─ COLLAPSE ─ */
function toggleCollapse(nid){
  const n=G.nodes[nid];if(!n)return;
  n.collapsed=!n.collapsed;
  const body=n.el.querySelector('.nbody');
  const foot=n.el.querySelector('.nfoot');
  const btn=n.el.querySelector(`[data-nc="${nid}"]`);
  if(n.collapsed){
    n.prevH=n.h;n.h=32;
    body.style.display='none';foot.style.display='none';
    n.el.style.height=n.h+'px';btn.textContent='▸';
  } else {
    n.h=n.prevH||360;
    body.style.display='';foot.style.display='';
    n.el.style.height=n.h+'px';btn.textContent='▾';
  }
  updateNodeConns(nid);mmDraw();
}

/* ─ COLOR CYCLE ─ */
function cycleColor(nid){
  const n=G.nodes[nid];if(!n)return;
  const i=(COLS.findIndex(c=>c.top===n.colObj.top)+1)%COLS.length;
  n.colObj=COLS[i];n.col=COLS[i].mm;
  n.el.style.borderTopColor=COLS[i].top;
  n.el.querySelector(`[data-dot="${nid}"]`).style.background=COLS[i].top;
  mmDraw();
}

/* ─ RELATED ─ */
async function loadRelated(nid){
  const n=G.nodes[nid];if(!n)return;
  showToast('Loading related…');
  try{
    const links=await wLinks(n.title);
    if(!links.length){showToast('None found');return;}
    // open first 3 that aren't already open
    let added=0;
    for(const t of links){
      if(added>=3)break;
      const dup=Object.values(G.nodes).find(nd=>nd.title.toLowerCase()===t.toLowerCase());
      if(!dup){await openArticle(t,nid);added++;}
    }
    if(!added)showToast('All related already open');
  }catch{showToast('Failed to load related');}
}

/* ─ DRAG NODE ─ */
function startDrag(nid,e){
  selNode(nid);G.drag.on=true;G.drag.id=nid;
  const n=G.nodes[nid],wp=c2w(e.clientX,e.clientY);
  G.drag.ox=wp.x-n.x;G.drag.oy=wp.y-n.y;
  n.el.style.zIndex=20;n.el.style.cursor='grabbing';
}

/* ─ RESIZE ─ */
function startResize(nid,e){
  G.resize={on:true,id:nid,sx:e.clientX,sy:e.clientY,w0:G.nodes[nid].w,h0:G.nodes[nid].h};
}

/* ─ CONNECTIONS ─ */
function portAnchor(nid,side){
  const n=G.nodes[nid];if(!n)return{x:0,y:0};
  switch(side){
    case'top':   return{x:n.x+n.w/2,y:n.y};
    case'bottom':return{x:n.x+n.w/2,y:n.y+n.h};
    case'left':  return{x:n.x,      y:n.y+n.h/2};
    case'right': return{x:n.x+n.w,  y:n.y+n.h/2};
    default:     return{x:n.x+n.w/2,y:n.y+n.h/2};
  }
}

function bestSides(fid,tid){
  const fn=G.nodes[fid],tn=G.nodes[tid];if(!fn||!tn)return{fs:'right',ts:'left'};
  const dx=(tn.x+tn.w/2)-(fn.x+fn.w/2),dy=(tn.y+tn.h/2)-(fn.y+fn.h/2);
  if(Math.abs(dx)>Math.abs(dy))return dx>0?{fs:'right',ts:'left'}:{fs:'left',ts:'right'};
  return dy>0?{fs:'bottom',ts:'top'}:{fs:'top',ts:'bottom'};
}

function mkPath(ax,ay,bx,by,fs,ts,style){
  if(style==='straight')return `M${ax},${ay} L${bx},${by}`;
  if(style==='stepped'){
    const mx=(ax+bx)/2;
    if(fs==='right'||fs==='left'){
      return `M${ax},${ay} L${mx},${ay} L${mx},${by} L${bx},${by}`;
    }
    const my=(ay+by)/2;
    return `M${ax},${ay} L${ax},${my} L${bx},${my} L${bx},${by}`;
  }
  // curved bezier
  const dist=Math.hypot(bx-ax,by-ay);
  const k=Math.min(Math.max(dist*.42,50),220);
  const off=s=>({right:[k,0],left:[-k,0],bottom:[0,k],top:[0,-k]}[s]||[0,0]);
  const[o1x,o1y]=off(fs),[o2x,o2y]=off(ts);
  return `M${ax},${ay} C${ax+o1x},${ay+o1y} ${bx+o2x},${by+o2y} ${bx},${by}`;
}

function addConn(fid,tid,fs,ts,style,opts){
  // deduplicate
  if(Object.values(G.conns).find(c=>(c.from===fid&&c.to===tid)||(c.from===tid&&c.to===fid))){showToast('Already connected');return;}
  const cid=id();
  const {fs:dfs,ts:dts}=bestSides(fid,tid);
  const conn={id:cid,from:fid,to:tid,fromSide:fs||dfs,toSide:ts||dts,style:style||'curved',dashed:false,openArrow:false,noArrow:false,label:''};
  G.conns[cid]=conn;

  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.classList.add('cp');path.dataset.cid=cid;
  path.setAttribute('marker-end','url(#arr)');
  path.style.pointerEvents='stroke';
  svg.appendChild(path);conn.pathEl=path;

  path.addEventListener('click',e=>{e.stopPropagation();selConn(cid)});
  path.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();G.ctx.conn=cid;selConn(cid);openMenu('cmenu',e.clientX,e.clientY)});

  updConn(cid);updateStat();mmDraw();return cid;
}

function updConn(cid){
  const c=G.conns[cid];if(!c)return;
  const fn=G.nodes[c.from],tn=G.nodes[c.to];
  if(!fn||!tn){removeConn(cid);return;}
  const{fs,ts}=bestSides(c.from,c.to);
  c.fromSide=fs;c.toSide=ts;
  const a=portAnchor(c.from,fs),b=portAnchor(c.to,ts);
  c.pathEl.setAttribute('d',mkPath(a.x,a.y,b.x,b.y,fs,ts,c.style));
  c.pathEl.classList.toggle('dashed',c.dashed);
  // arrow marker
  let mk=c.noArrow?'none':c.openArrow?(c.pathEl.classList.contains('sel')?'url(#arr-open-sel)':'url(#arr-open)'):(c.pathEl.classList.contains('sel')?'url(#arr-sel)':'url(#arr)');
  c.pathEl.setAttribute('marker-end',mk);
  // label
  if(c.label&&c.labelEl){
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    const lb=c.label.length*5.5+8;
    c.labelBg.setAttribute('x',mx-lb/2);c.labelBg.setAttribute('y',my-8);c.labelBg.setAttribute('width',lb);c.labelBg.setAttribute('height',16);
    c.labelEl.setAttribute('x',mx);c.labelEl.setAttribute('y',my);
    c.labelEl.textContent=c.label;
  }
}

function updateNodeConns(nid){Object.keys(G.conns).forEach(cid=>{const c=G.conns[cid];if(c.from===nid||c.to===nid)updConn(cid)})}

function removeConn(cid){
  const c=G.conns[cid];if(!c)return;
  c.pathEl?.remove();c.labelEl?.remove();c.labelBg?.remove();
  delete G.conns[cid];if(G.selConn===cid)G.selConn=null;
  updateStat();mmDraw();
}

function selConn(cid){
  if(G.selConn&&G.conns[G.selConn]){
    const pc=G.conns[G.selConn];pc.pathEl.classList.remove('sel');
    pc.pathEl.setAttribute('marker-end',pc.noArrow?'none':pc.openArrow?'url(#arr-open)':'url(#arr)');
  }
  G.selConn=cid;
  if(cid&&G.conns[cid]){
    G.conns[cid].pathEl.classList.add('sel');
    const c=G.conns[cid];c.pathEl.setAttribute('marker-end',c.noArrow?'none':c.openArrow?'url(#arr-open-sel)':'url(#arr-sel)');
  }
}

/* ─ CONNECT TOOL ─ */
function startConn(nid,side,e){
  G.conn={on:true,from:nid,side};
  dp.style.display='block';
  canvas.style.cursor='crosshair';
}
function finishConn(toId,toSide){
  if(G.conn.on&&G.conn.from&&toId&&toId!==G.conn.from)addConn(G.conn.from,toId,G.conn.side,toSide);
  G.conn={on:false,from:null,side:null};
  dp.style.display='none';dp.setAttribute('d','');
  if(G.tool!=='pan')canvas.style.cursor='';
}

/* ─ SELECT / REMOVE ─ */
function selNode(nid){
  if(G.sel===nid)return;
  if(G.sel&&G.nodes[G.sel])G.nodes[G.sel].el.classList.remove('sel');
  G.sel=nid;
  if(nid&&G.nodes[nid]){G.nodes[nid].el.classList.add('sel');G.nodes[nid].el.style.zIndex=10;}
  selConn(null);
}
function desel(){selNode(null);selConn(null)}
function removeNode(nid){
  const n=G.nodes[nid];if(!n)return;
  n.el.remove();delete G.nodes[nid];
  Object.keys(G.conns).forEach(cid=>{if(G.conns[cid].from===nid||G.conns[cid].to===nid)removeConn(cid)});
  if(G.sel===nid)G.sel=null;
  updateStat();mmDraw();checkWelcome();
}
function checkWelcome(){if(!Object.keys(G.nodes).length)$('welcome').classList.remove('gone')}

/* ─ IMAGES ─ */
async function popImages(nid){
  const n=G.nodes[nid];if(!n)return;showToast('Loading images…');
  try{
    const titles=await wImages(n.title);let cnt=0;
    for(const t of titles){
      if(!t.match(/\.(png|jpg|jpeg|gif|webp)/i))continue;
      const url=await wImgUrl(t);if(!url)continue;
      spawnImg(url,t.replace('File:',''),n.x+n.w+20+cnt*240,n.y+cnt*10);
      cnt++;if(cnt>=3)break;
    }
    if(!cnt)showToast('No images found');
  }catch{showToast('Image load failed');}
}
function spawnImg(src,cap,x,y){
  const nid=id();const el=document.createElement('div');
  el.className='imgn';el.style.cssText=`left:${x}px;top:${y}px`;
  el.innerHTML=`<img src="${esc(src)}" alt="${esc(cap.substring(0,60))}" loading="lazy"/><div class="imgn-f"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px">${esc(cap.substring(0,50))}</span><button class="imgndel" data-id="${nid}">✕</button></div>`;
  world.appendChild(el);
  const obj={id:nid,el,x,y};G.images[nid]=obj;
  $('welcome').classList.add('gone');
  el.querySelector('[data-id]').addEventListener('click',()=>{el.remove();delete G.images[nid]});
  mkDragGeneric(el,nid,G.images);
}

/* ─ STICKIES ─ */
const SCOLS=[{cls:'sy',hex:'#fef08a'},{cls:'sb',hex:'#bfdbfe'},{cls:'sg',hex:'#bbf7d0'},{cls:'sp',hex:'#e9d5ff'},{cls:'so',hex:'#fed7aa'}];
let sn=0;
function createSticky(x,y){
  const nid=id();const col=SCOLS[sn++%SCOLS.length];
  const el=document.createElement('div');
  el.className=`sticky ${col.cls}`;el.style.cssText=`left:${x}px;top:${y}px`;
  el.innerHTML=`
    <div class="sticky-h" data-sg="${nid}">
      ${SCOLS.map(c=>`<button class="sc" style="background:${c.hex}" data-sc="${nid}-${c.cls}" title="${c.cls}"></button>`).join('')}
      <div class="ssp"></div>
      <button class="sdel" data-sdel="${nid}">✕</button>
    </div>
    <textarea class="sta" placeholder="note…"></textarea>
  `;
  world.appendChild(el);$('welcome').classList.add('gone');
  const obj={id:nid,el,x,y};G.stickies[nid]=obj;
  el.querySelector(`[data-sdel="${nid}"]`).addEventListener('click',()=>{el.remove();delete G.stickies[nid];checkWelcome()});
  SCOLS.forEach(c=>{el.querySelector(`[data-sc="${nid}-${c.cls}"]`).addEventListener('click',ev=>{ev.stopPropagation();el.className=`sticky ${c.cls}`})});
  mkDragGeneric(el,nid,G.stickies,`[data-sg="${nid}"]`);
  el.querySelector('textarea').focus();
}

/* ─ TEXT LABELS ─ */
function createText(x,y){
  const nid=id();const el=document.createElement('div');
  el.className='ctext';el.style.cssText=`left:${x}px;top:${y}px`;
  el.innerHTML=`<div class="ctextinner" contenteditable="true" data-tid="${nid}">label</div>`;
  world.appendChild(el);$('welcome').classList.add('gone');
  const obj={id:nid,el,x,y};G.texts[nid]=obj;
  const inner=el.querySelector('.ctextinner');
  inner.focus();const r=document.createRange();r.selectNodeContents(inner);window.getSelection().removeAllRanges();window.getSelection().addRange(r);
  mkDragGeneric(el,nid,G.texts);
  inner.addEventListener('mousedown',e=>e.stopPropagation());
  inner.addEventListener('keydown',e=>{if(e.key==='Escape'){inner.blur();setTool('select')}});
}

/* ─ GROUPS ─ */
function createGroup(x,y,w,h){
  const nid=id();
  const el=document.createElementNS('http://www.w3.org/2000/svg','g');
  const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
  rect.setAttribute('x',x);rect.setAttribute('y',y);
  rect.setAttribute('width',w);rect.setAttribute('height',h);
  rect.setAttribute('rx',8);
  rect.setAttribute('fill','rgba(37,99,235,0.04)');
  rect.setAttribute('stroke','rgba(37,99,235,0.25)');
  rect.setAttribute('stroke-width','1.5');
  rect.setAttribute('stroke-dasharray','6,4');
  const lbl=document.createElementNS('http://www.w3.org/2000/svg','text');
  lbl.setAttribute('x',x+10);lbl.setAttribute('y',y+18);
  lbl.setAttribute('fill','rgba(37,99,235,0.5)');
  lbl.setAttribute('font-family','JetBrains Mono,monospace');lbl.setAttribute('font-size','11');
  lbl.textContent='Group';
  el.appendChild(rect);el.appendChild(lbl);
  svg.insertBefore(el,svg.firstChild);
  G.groups[nid]={id:nid,el,x,y,w,h};
}

/* ─ GENERIC DRAG ─ */
function mkDragGeneric(el,nid,col,gripSel){
  const grip=gripSel?el.querySelector(gripSel):el;
  grip.addEventListener('mousedown',e=>{
    if(e.target.tagName==='TEXTAREA'||e.target.tagName==='BUTTON'||e.target.contentEditable==='true')return;
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();
    if(G.tool==='erase'){
      if(col===G.stickies){el.remove();delete G.stickies[nid];checkWelcome();}
      else if(col===G.texts){el.remove();delete G.texts[nid];}
      else if(col===G.images){el.remove();delete G.images[nid];}
      return;
    }
    const obj=col[nid];const wp0=c2w(e.clientX,e.clientY);
    const ox=obj.x-wp0.x,oy=obj.y-wp0.y;
    const mv=ev=>{const wp=c2w(ev.clientX,ev.clientY);obj.x=wp.x+ox;obj.y=wp.y+oy;el.style.left=obj.x+'px';el.style.top=obj.y+'px'};
    const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up)};
    document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
  });
}

/* ─ CANVAS EVENTS ─ */
let groupStart=null;
canvas.addEventListener('mousedown',e=>{
  if(e.button===1||(e.button===0&&G.tool==='pan')){
    e.preventDefault();G.pan.on=true;G.pan.sx=e.clientX-G.tx;G.pan.sy=e.clientY-G.ty;canvas.style.cursor='grabbing';return;
  }
  if(e.button!==0)return;
  const tool=G.tool;
  if(tool==='sticky'){const wp=c2w(e.clientX,e.clientY);createSticky(wp.x,wp.y);return;}
  if(tool==='text'){const wp=c2w(e.clientX,e.clientY);createText(wp.x,wp.y);return;}
  if(tool==='arrow'){
    const wp=c2w(e.clientX,e.clientY);
    // create a floating arrow label
    createText(wp.x,wp.y);return;
  }
  if(tool==='group'){
    const wp=c2w(e.clientX,e.clientY);groupStart=wp;return;
  }
  if(e.target===canvas||e.target===world||e.target.id==='svg-layer')desel();
});

document.addEventListener('mousemove',e=>{
  if(G.pan.on){G.tx=e.clientX-G.pan.sx;G.ty=e.clientY-G.pan.sy;applyT();return;}
  if(G.drag.on&&G.drag.id){
    const n=G.nodes[G.drag.id];if(!n)return;
    const wp=c2w(e.clientX,e.clientY);
    n.x=wp.x-G.drag.ox;n.y=wp.y-G.drag.oy;
    n.el.style.left=n.x+'px';n.el.style.top=n.y+'px';
    updateNodeConns(G.drag.id);mmDraw();return;
  }
  if(G.resize.on&&G.resize.id){
    const n=G.nodes[G.resize.id];if(!n)return;
    const dx=(e.clientX-G.resize.sx)/G.scale,dy=(e.clientY-G.resize.sy)/G.scale;
    n.w=Math.max(220,G.resize.w0+dx);n.h=Math.max(120,G.resize.h0+dy);
    n.el.style.width=n.w+'px';n.el.style.height=n.h+'px';
    updateNodeConns(G.resize.id);mmDraw();return;
  }
  if(G.conn.on&&G.conn.from){
    const a=portAnchor(G.conn.from,G.conn.side);
    const wp=c2w(e.clientX,e.clientY);
    dp.setAttribute('d',mkPath(a.x,a.y,wp.x,wp.y,G.conn.side,'left','curved'));
  }
});

document.addEventListener('mouseup',e=>{
  if(G.pan.on){G.pan.on=false;canvas.style.cursor=G.tool==='pan'?'grab':'';}
  if(G.drag.on){
    if(G.drag.id&&G.nodes[G.drag.id]){G.nodes[G.drag.id].el.style.zIndex='';G.nodes[G.drag.id].el.style.cursor='';}
    G.drag={on:false,id:null,ox:0,oy:0};
  }
  if(G.resize.on)G.resize={on:false,id:null,sx:0,sy:0,w0:0,h0:0};
  if(G.conn.on){
    const tgt=e.target;
    if(tgt.classList.contains('port')&&tgt.dataset.p!==G.conn.from)finishConn(tgt.dataset.p,tgt.dataset.s);
    else if(tgt.closest&&tgt.closest('.node')){
      const nel=tgt.closest('.node');
      if(nel.id&&G.nodes[nel.id]&&nel.id!==G.conn.from)finishConn(nel.id,null);
      else finishConn(null,null);
    }else finishConn(null,null);
  }
  if(groupStart&&G.tool==='group'){
    const wp=c2w(e.clientX,e.clientY);
    const gx=Math.min(groupStart.x,wp.x),gy=Math.min(groupStart.y,wp.y);
    const gw=Math.abs(wp.x-groupStart.x),gh=Math.abs(wp.y-groupStart.y);
    if(gw>40&&gh>40)createGroup(gx,gy,gw,gh);
    groupStart=null;
  }
});

canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.1:.9,e.clientX,e.clientY)},{passive:false});

/* ─ TOOLBAR ─ */
function setTool(t){
  G.tool=t;
  document.querySelectorAll('.tbb').forEach(b=>b.classList.remove('on'));
  const btn=$('tl-'+t);if(btn)btn.classList.add('on');
  $('si-t').textContent=t;
  const cursors={pan:'grab',connect:'crosshair',sticky:'cell',text:'cell',arrow:'cell',group:'crosshair',erase:'not-allowed'};
  canvas.style.cursor=cursors[t]||'';
}
['select','pan','connect','sticky','text','arrow','group','erase','help'].forEach(t=>{
  const btn=$('tl-'+t);if(!btn)return;
  if(t==='help')btn.addEventListener('click',()=>$('panel').classList.toggle('open'));
  else btn.addEventListener('click',()=>setTool(t));
});
$('zm-in').onclick=()=>zoom(1.2);
$('zm-out').onclick=()=>zoom(.8);
$('btn-fit').onclick=fitScreen;

$('btn-clear').onclick=()=>{
  if(!confirm('Clear everything?'))return;
  ['nodes','conns','stickies','texts','images'].forEach(k=>{
    Object.values(G[k]).forEach(v=>{v.el?.remove();v.pathEl?.remove();v.labelEl?.remove();v.labelBg?.remove()});
    G[k]={};
  });
  G.sel=null;G.selConn=null;updateStat();mmDraw();checkWelcome();
};

$('btn-export').onclick=()=>{
  const data={nodes:Object.values(G.nodes).map(n=>({title:n.title,x:Math.round(n.x),y:Math.round(n.y),w:n.w,h:n.h})),connections:Object.values(G.conns).map(c=>({from:G.nodes[c.from]?.title,to:G.nodes[c.to]?.title,style:c.style}))};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='wikiboard.json';a.click();showToast('Exported!');
};

let dark=false;
$('btn-theme').onclick=()=>{
  dark=!dark;
  if(dark){
    document.documentElement.style.setProperty('--paper','#111');
    document.documentElement.style.setProperty('--paper2','#1a1a1a');
    document.documentElement.style.setProperty('--paper3','#222');
    document.documentElement.style.setProperty('--ink','#f0ede6');
    document.documentElement.style.setProperty('--ink2','#ccc');
    document.documentElement.style.setProperty('--ink3','#888');
    document.documentElement.style.setProperty('--ink4','#555');
    document.documentElement.style.setProperty('--border','rgba(255,255,255,.08)');
    document.documentElement.style.setProperty('--border2','rgba(255,255,255,.14)');
    document.body.style.setProperty('background','#111');
    $('btn-theme').textContent='☽ Dark';
  } else {
    document.documentElement.style.setProperty('--paper','#f7f5f0');
    document.documentElement.style.setProperty('--paper2','#f0ede6');
    document.documentElement.style.setProperty('--paper3','#e8e4db');
    document.documentElement.style.setProperty('--ink','#1a1814');
    document.documentElement.style.setProperty('--ink2','#4a4540');
    document.documentElement.style.setProperty('--ink3','#8a837a');
    document.documentElement.style.setProperty('--ink4','#bab3aa');
    document.documentElement.style.setProperty('--border','rgba(26,24,20,.1)');
    document.documentElement.style.setProperty('--border2','rgba(26,24,20,.17)');
    document.body.style.setProperty('background','#f7f5f0');
    $('btn-theme').textContent='☀ Light';
  }
  G.dark=dark;mmDraw();
};

/* ─ CONN MENU ─ */
$('cm-curved').onclick=()=>setConnStyle('curved');
$('cm-straight').onclick=()=>setConnStyle('straight');
$('cm-stepped').onclick=()=>setConnStyle('stepped');
$('cm-dashed').onclick=()=>{const c=G.conns[G.ctx.conn];if(c){c.dashed=!c.dashed;updConn(G.ctx.conn);}closeMenus();};
$('cm-openarrow').onclick=()=>{const c=G.conns[G.ctx.conn];if(c){c.openArrow=!c.openArrow;c.noArrow=false;updConn(G.ctx.conn);}closeMenus();};
$('cm-noline').onclick=()=>{const c=G.conns[G.ctx.conn];if(c){c.noArrow=!c.noArrow;updConn(G.ctx.conn);}closeMenus();};
$('cm-label').onclick=()=>{
  if(!G.ctx.conn)return;const c=G.conns[G.ctx.conn];if(!c)return;
  const lbl=prompt('Label:',c.label||'');
  if(lbl!==null){
    c.label=lbl;
    if(lbl&&!c.labelEl){
      const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');bg.classList.add('clabel-bg');bg.setAttribute('rx',3);
      const txt=document.createElementNS('http://www.w3.org/2000/svg','text');txt.classList.add('clabel');
      svg.appendChild(bg);svg.appendChild(txt);c.labelBg=bg;c.labelEl=txt;
    } else if(!lbl&&c.labelEl){c.labelEl.remove();c.labelBg.remove();delete c.labelEl;delete c.labelBg;}
    updConn(G.ctx.conn);
  }
  closeMenus();
};
$('cm-reverse').onclick=()=>{
  const c=G.conns[G.ctx.conn];if(!c)return;
  [c.from,c.to]=[c.to,c.from];updConn(G.ctx.conn);closeMenus();
};
$('cm-del').onclick=()=>{removeConn(G.ctx.conn);closeMenus()};
function setConnStyle(s){const c=G.conns[G.ctx.conn];if(c){c.style=s;updConn(G.ctx.conn);}closeMenus();}

/* ─ NODE MENU ─ */
$('nm-wiki').onclick=()=>{const n=G.nodes[G.ctx.node];if(n)window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(n.title)}`,'_blank');closeMenus()};
$('nm-imgs').onclick=()=>{popImages(G.ctx.node);closeMenus()};
$('nm-related').onclick=()=>{loadRelated(G.ctx.node);closeMenus()};
$('nm-dup').onclick=()=>{const n=G.nodes[G.ctx.node];if(n)openArticle(n.title,null,n.x+60,n.y+60);closeMenus()};
$('nm-color').onclick=()=>{cycleColor(G.ctx.node);closeMenus()};
$('nm-collapse').onclick=()=>{toggleCollapse(G.ctx.node);closeMenus()};
$('nm-del').onclick=()=>{removeNode(G.ctx.node);closeMenus()};

function openMenu(id,x,y){closeMenus();const m=$(id);m.style.left=x+'px';m.style.top=y+'px';m.classList.add('open')}
function closeMenus(){document.querySelectorAll('.menu').forEach(m=>m.classList.remove('open'))}
document.addEventListener('click',e=>{if(!e.target.closest('.menu'))closeMenus();if(!e.target.closest('#panel')&&!e.target.closest('#tl-help'))$('panel').classList.remove('open')});

/* ─ SEARCH ─ */
const sinp=$('sinp'),acDiv=$('ac');
sinp.addEventListener('input',()=>{
  clearTimeout(G.ac.timer);const q=sinp.value.trim();
  if(!q){hideAC();return;}
  G.ac.timer=setTimeout(async()=>{try{G.ac.items=await wSearch(q);G.ac.idx=-1;renderAC()}catch{}},220);
});
sinp.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'){G.ac.idx=Math.min(G.ac.idx+1,G.ac.items.length-1);renderAC();e.preventDefault()}
  if(e.key==='ArrowUp'){G.ac.idx=Math.max(G.ac.idx-1,-1);renderAC();e.preventDefault()}
  if(e.key==='Enter'){const q=G.ac.idx>=0?G.ac.items[G.ac.idx]:sinp.value.trim();if(q){openArticle(q);sinp.value='';hideAC()}}
  if(e.key==='Escape'){hideAC();sinp.blur()}
});
$('sgo').addEventListener('click',()=>{const q=sinp.value.trim();if(q){openArticle(q);sinp.value='';hideAC()}});
function renderAC(){
  if(!G.ac.items.length){hideAC();return;}
  acDiv.innerHTML=G.ac.items.map((r,i)=>`<div class="aci${i===G.ac.idx?' sel':''}" data-qi="${i}">${esc(r)}</div>`).join('');
  acDiv.classList.add('open');
  acDiv.querySelectorAll('.aci').forEach(item=>item.addEventListener('mousedown',e=>{e.preventDefault();openArticle(G.ac.items[+item.dataset.qi]);sinp.value='';hideAC()}));
}
function hideAC(){acDiv.classList.remove('open')}
document.addEventListener('click',e=>{if(!e.target.closest('#swrap'))hideAC()});

/* ─ KEYBOARD ─ */
document.addEventListener('keydown',e=>{
  const tag=document.activeElement.tagName;
  const edit=tag==='INPUT'||tag==='TEXTAREA'||document.activeElement.contentEditable==='true';
  if(!edit){
    const k=e.key.toLowerCase();
    if(k==='v')setTool('select');
    if(k==='h')setTool('pan');
    if(k==='c')setTool('connect');
    if(k==='n')setTool('sticky');
    if(k==='t')setTool('text');
    if(k==='a')setTool('arrow');
    if(k==='g')setTool('group');
    if(k==='e')setTool('erase');
    if(k==='f')fitScreen();
    if(k==='s'||k==='/'){ e.preventDefault();sinp.focus();sinp.select();}
    if(k==='?')$('panel').classList.toggle('open');
    if(e.key==='+'||e.key==='=')zoom(1.15);
    if(e.key==='-')zoom(.87);
    if((e.key==='Delete'||e.key==='Backspace')&&G.sel)removeNode(G.sel);
    if((e.key==='Delete'||e.key==='Backspace')&&G.selConn)removeConn(G.selConn);
    if(e.key==='Escape'){desel();hideAC();setTool('select')}
    if(e.ctrlKey&&k==='d'&&G.sel){
      e.preventDefault();const n=G.nodes[G.sel];if(n)openArticle(n.title,null,n.x+50,n.y+50);
    }
    if(e.ctrlKey&&e.shiftKey&&k==='x')$('btn-clear').click();
  }
});

/* ─ STATUS ─ */
function updateStat(){
  const nc=Object.keys(G.nodes).length,ec=Object.keys(G.conns).length;
  $('si-n').textContent=nc+(nc===1?' node':' nodes');
  $('si-c').textContent=ec+(ec===1?' connection':' connections');
}

/* ─ TOAST ─ */
let tt;
function showToast(msg,dur=2200){
  const el=$('toast');el.textContent=msg;el.classList.add('on');
  clearTimeout(tt);tt=setTimeout(()=>el.classList.remove('on'),dur);
}

/* ─ UTILS ─ */
function esc(s){ if(typeof escEngine==='function') try{return escEngine(s);}catch(e){} return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

/* ─ INIT ─ */
(function(){
  G.tx=canvas.clientWidth/2-CX*G.scale;
  G.ty=canvas.clientHeight/2-CY*G.scale;
  applyT();updateStat();setTool('select');sinp.focus();
  // Example: open a starter article if ?q= param provided
  const params=new URLSearchParams(location.search);
  if(params.get('q'))openArticle(params.get('q'));
})();

// ── Y2K CHROME ENHANCEMENTS (appended for FAANG rebuild) ────────
function initHeroTerminal(){
  const el=document.getElementById('heroTerminal');
  if(!el) return;
  const lines=[
    '<span class="t-prompt">wikiboard@rahul:~$</span> <span class="t-cmd">search "Philosophy"</span>',
    '<span class="t-out">  ↳ fetched extract + thumbnail · sanitized via DOMParser</span>',
    '<span class="t-success">  ✓ card spawned at (6000,5400) · portAnchors + bezier</span>',
    '<span class="t-prompt">wikiboard@rahul:~$</span> <span class="t-cmd">zoom 1.2 @ cursor</span>',
    '<span class="t-token">  tx = cx - r*(cx-tx) · world ↔ screen</span>',
  ];
  let i=0; el.innerHTML='';
  function next(){
    if(i>=lines.length){ setTimeout(()=>{el.innerHTML=''; i=0; next();}, 4200); return; }
    const d=document.createElement('div'); d.innerHTML=lines[i]; d.style.opacity='0'; d.style.transform='translateY(6px)'; d.style.transition='all .4s ease'; el.appendChild(d);
    requestAnimationFrame(()=>{ d.style.opacity='1'; d.style.transform='translateY(0)'; });
    i++; setTimeout(next, 900);
  }
  next();
}
function initBgCanvas(){
  const bg=document.getElementById('bgCanvas');
  if(!bg) return;
  const ctx2=bg.getContext('2d');
  function resize(){ bg.width=window.innerWidth; bg.height=window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  let t=0;
  function loop(){
    t+=0.006;
    ctx2.clearRect(0,0,bg.width,bg.height);
    const g1=ctx2.createRadialGradient(bg.width*0.2+Math.sin(t)*60, bg.height*0.3, 0, bg.width*0.2, bg.height*0.3, 420);
    g1.addColorStop(0,'rgba(255,45,155,0.06)'); g1.addColorStop(1,'transparent');
    ctx2.fillStyle=g1; ctx2.fillRect(0,0,bg.width,bg.height);
    const g2=ctx2.createRadialGradient(bg.width*0.8+Math.cos(t*1.2)*50, bg.height*0.8, 0, bg.width*0.8, bg.height*0.8, 360);
    g2.addColorStop(0,'rgba(155,48,255,0.05)'); g2.addColorStop(1,'transparent');
    ctx2.fillStyle=g2; ctx2.fillRect(0,0,bg.width,bg.height);
    requestAnimationFrame(loop);
  }
  loop();
}
function initGlitter(){
  const c=document.getElementById('glitterCanvas');
  if(!c) return;
  const gtx=c.getContext('2d');
  function resize(){ c.width=window.innerWidth; c.height=window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  const particles=[];
  window.addEventListener('mousemove', e=>{
    for(let i=0;i<2;i++) particles.push({x:e.clientX,y:e.clientY,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3-1,life:1,dec:0.04+Math.random()*0.03,size:1+Math.random()*2, hue: Math.random()<0.5?320:280});
    if(particles.length>120) particles.splice(0, particles.length-120);
  });
  function loop(){
    gtx.clearRect(0,0,c.width,c.height);
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.06; p.life-=p.dec;
      if(p.life<=0){ particles.splice(i,1); continue; }
      gtx.globalAlpha=p.life*0.9;
      gtx.fillStyle='hsl('+p.hue+' 100% 60%)';
      gtx.beginPath(); gtx.arc(p.x,p.y,p.size,0,Math.PI*2); gtx.fill();
    }
    requestAnimationFrame(loop);
  }
  loop();
}
function initDarkToggle(){
  const btn=document.getElementById('darkToggle');
  if(!btn) return;
  btn.addEventListener('click',()=>{
    const cur=document.getElementById('btn-theme');
    if(cur) cur.click();
    document.body.classList.toggle('dark-mode');
    btn.textContent = document.body.classList.contains('dark-mode') ? '☀ Light' : '🌙 Dark';
  });
}
function initMobileNav(){
  const btn=document.getElementById('mobileMenuBtn');
  const nav=document.getElementById('mobileNav');
  if(!btn||!nav) return;
  btn.addEventListener('click',()=> nav.classList.toggle('open'));
}
function initScrollProgress(){
  const bar=document.getElementById('scrollProgress');
  if(!bar) return;
  window.addEventListener('scroll',()=>{
    const h=document.documentElement.scrollHeight - window.innerHeight;
    const p=h>0 ? (window.scrollY/h*100) : 0;
    bar.style.width=p+'%';
  });
}
function renderLibrary(){
  const el=document.getElementById('libraryGrid');
  if(!el || !WikiLib) return;
  const list=WikiLib.list();
  el.innerHTML=list.map(item=>`
    <div class="phase-card" style="cursor:pointer" onclick="loadExampleBoard('${item.id}')">
      <div class="phase-num">BOARD</div>
      <h3>`+escEngine(item.name)+`</h3>
      <p>`+escEngine(item.description)+`</p>
      <span class="phase-tag">`+escEngine(item.id)+` - `+item.count+` nodes</span>
    </div>
  `).join('');
}function renderWikiRef(){
  const el=document.getElementById('wikiRef');
  if(!el) return;
  const cards=[
    {title:'Wikipedia API', icon:'🌐', desc:'opensearch + query extracts|pageimages|links|images. All with origin=* for CORS.', tag:'origin=*'},
    {title:'XSS Safe', icon:'🛡️', desc:'DOMParser inert → p filter >15 chars → allow only <strong>/<br> → innerHTML. Regex fallback.', tag:'sanitize'},
    {title:'World ↔ Screen', icon:'📐', desc:'c2w = (cx - tx)/scale, w2c = wx*scale+tx. zoom keeps cursor point fixed.', tag:'transform'},
    {title:'SVG Arrows', icon:'↗', desc:'path inside world: curved bezier (k = min(max(dist*.42,50),220)), straight, stepped.', tag:'mkPath'},
    {title:'Minimap', icon:'🗺️', desc:'scaled dots + lines + node rects + viewport rect. Click jumps via panTo.', tag:'mmDraw'},
    {title:'CRDT Sync', icon:'🔄', desc:'opLog + lamport + vectorClock. mergeOps dedup by id, syncMerge applies missing.', tag:'CRDT'},
  ];
  el.innerHTML=cards.map(c=>`
    <div class="phase-card">
      <div class="phase-num">`+c.tag+`</div>
      <span class="phase-icon">`+c.icon+`</span>
      <h3>`+escEngine(c.title)+`</h3>
      <p>`+c.desc+`</p>
      <span class="phase-tag">`+c.tag+`</span>
    </div>
  `).join('');
}
function lpSearch(){
  const inp=document.getElementById('lp-search');
  const sinp=document.getElementById('sinp');
  if(inp && sinp){
    sinp.value=inp.value;
    sinp.dispatchEvent(new Event('input', {bubbles:true}));
    if(inp.value.trim()) openArticle(inp.value.trim());
    sinp.focus();
  }
}
window.lpSearch = lpSearch;
const origSave = typeof saveBoard !== 'undefined' ? saveBoard : null;
function saveBoard(){
  try{
    if(WE && WE.serialize){
      const state={nodes:G.nodes, conns:G.conns, stickies:G.stickies, texts:G.texts, images:G.images, groups:G.groups, uid:G.uid, scale:G.scale, tx:G.tx, ty:G.ty, colIdx:G.colIdx, openOff:G.openOff, opLog:G.opLog||[], vectorClock:G.vectorClock||{}, actorId:'local'};
      const mState=WE.createBoardState();
      Object.entries(state.nodes||{}).forEach(([k,v])=>mState.nodes.set(k,v));
      Object.entries(state.conns||{}).forEach(([k,v])=>mState.conns.set(k,v));
      Object.entries(state.stickies||{}).forEach(([k,v])=>mState.stickies.set(k,v));
      Object.entries(state.texts||{}).forEach(([k,v])=>mState.texts.set(k,v));
      const ser=WE.serialize(mState);
      localStorage.setItem('wikiboard_save', JSON.stringify(ser));
      localStorage.setItem('wikiboard_save_v2', JSON.stringify(ser));
      if(typeof simLog==='function') simLog('Saved via WikiEngine ✓');
      if(typeof showToast==='function') showToast('Board saved ✓');
      return;
    }
  }catch(e){}
  const data={nodes:Object.values(G.nodes).map(n=>({title:n.title,x:Math.round(n.x),y:Math.round(n.y),w:n.w,h:n.h})),connections:Object.values(G.conns).map(c=>({from:G.nodes[c.from]?.title,to:G.nodes[c.to]?.title,style:c.style}))};
  localStorage.setItem('wikiboard_save_fallback', JSON.stringify(data));
  if(typeof simLog==='function') simLog('Saved (fallback) ✓');
}
function loadBoard(){
  try{
    const raw=localStorage.getItem('wikiboard_save')||localStorage.getItem('wikiboard_save_v2');
    if(raw && WE && WE.deserialize){
      const des=WE.deserialize(JSON.parse(raw));
      Object.values(G.nodes).forEach(n=>n.el?.remove());
      Object.values(G.conns).forEach(c=>{c.pathEl?.remove(); c.labelEl?.remove(); c.labelBg?.remove();});
      G.nodes={}; G.conns={}; G.stickies={}; G.texts={}; G.images={};
      for(const [k,v] of des.nodes) G.nodes[k]=v;
      for(const [k,v] of des.conns) G.conns[k]=v;
      for(const [k,v] of des.stickies) G.stickies[k]=v;
      for(const [k,v] of des.texts) G.texts[k]=v;
      G.uid=des.uid; G.colIdx=des.colIdx||0;
      if(typeof mkNodeEl==='function' && typeof world!=='undefined'){
        for(const nid of Object.keys(G.nodes)){
          const node=G.nodes[nid];
          if(!node.el){
            const el=mkNodeEl(node); world.appendChild(el); node.el=el;
          }
        }
        for(const cid of Object.keys(G.conns)){
          const c=G.conns[cid];
          const path=document.createElementNS('http://www.w3.org/2000/svg','path');
          path.classList.add('cp'); path.dataset.cid=cid;
          path.setAttribute('marker-end','url(#arr)');
          svg.appendChild(path); c.pathEl=path;
          path.addEventListener('click',e=>{e.stopPropagation(); if(typeof selConn==='function') selConn(cid);});
          path.addEventListener('contextmenu',e=>{e.preventDefault(); e.stopPropagation(); G.ctx.conn=cid; if(typeof selConn==='function') selConn(cid); if(typeof openMenu==='function') openMenu('cmenu',e.clientX,e.clientY);});
          if(typeof updConn==='function') updConn(cid);
        }
      }
      if(typeof updateStat==='function') updateStat();
      if(typeof mmDraw==='function') mmDraw();
      if(typeof simLog==='function') simLog('Board loaded via WikiEngine ✓');
      if(typeof showToast==='function') showToast('Board loaded ✓');
      return;
    }
  }catch(e){ console.warn('loadBoard engine path failed', e); }
  const fb=localStorage.getItem('wikiboard_save_fallback');
  if(fb){ if(typeof showToast==='function') showToast('Loaded fallback'); }
  else { if(typeof showToast==='function') showToast('No save found'); }
}
window.saveBoard=saveBoard; window.loadBoard=loadBoard;
function exportJSON(){
  const btn=document.getElementById('btn-export');
  if(btn) btn.click();
  else {
    const data={nodes:Object.values(G.nodes||{}).map(n=>({title:n.title,x:Math.round(n.x),y:Math.round(n.y),w:n.w,h:n.h})),connections:Object.values(G.conns||{}).map(c=>({from:G.nodes[c.from]?.title,to:G.nodes[c.to]?.title,style:c.style}))};
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='wikiboard.json';a.click();
  }
}
function exportSVG(){
  const preview=document.getElementById('preview-svg');
  if(VizMod && VizMod.buildBoardSVG){
    const svg=VizMod.buildBoardSVG({nodes:G.nodes,conns:G.conns});
    if(preview){ preview.innerHTML=svg; preview.style.display='block'; preview.scrollIntoView({behavior:'smooth', block:'nearest'}); }
    const blob=new Blob([svg],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='wikiboard.svg'; a.click();
    URL.revokeObjectURL(url);
    if(typeof simLog==='function') simLog('Exported SVG ✓');
  } else if(preview){ preview.textContent='Viz not loaded'; }
}
window.exportJSON=exportJSON; window.exportSVG=exportSVG;
window.clearBoard=function(){ const b=document.getElementById('btn-clear'); if(b) b.click(); };
function loadExampleBoard(name){
  if(WikiLib && WikiLib.get){
    const entry=WikiLib.get(name);
    if(entry){
      if(window.AppIntegration && window.AppIntegration.loadExampleAsync){
        try{
          const tmpState=WE ? WE.createBoardState() : null;
          if(tmpState && WE){
            const inst=WikiLib.instantiate(name, WE);
            if(inst && inst.state){
              Object.values(G.nodes).forEach(n=>n.el?.remove());
              Object.values(G.conns).forEach(c=>{c.pathEl?.remove(); c.labelEl?.remove(); c.labelBg?.remove();});
              G.nodes={}; G.conns={}; G.stickies={}; G.texts={};
              for(const [k,v] of inst.state.nodes) G.nodes[k]=v;
              for(const [k,v] of inst.state.conns) G.conns[k]=v;
              for(const [k,v] of inst.state.stickies) G.stickies[k]=v;
              for(const [k,v] of inst.state.texts) G.texts[k]=v;
              G.colIdx=inst.state.colIdx||0; G.uid=inst.state.uid;
              if(typeof mkNodeEl==='function'){
                for(const nid of Object.keys(G.nodes)){
                  const node=G.nodes[nid];
                  const el=mkNodeEl(node); world.appendChild(el); node.el=el;
                  (function(n){
                    const pgTitle=n.title;
                    if(typeof wSummary==='function' && typeof renderContent==='function'){
                      wSummary(pgTitle).then(pg=>{
                        if(pg && pg.missing===undefined) { n.pageUrl=pg.fullurl; renderContent(n.id, pg); }
                      }).catch(()=>{});
                    }
                  })(node);
                }
                for(const cid of Object.keys(G.conns)){
                  const c=G.conns[cid];
                  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
                  path.classList.add('cp'); path.dataset.cid=cid;
                  path.setAttribute('marker-end','url(#arr)');
                  svg.appendChild(path); c.pathEl=path;
                  path.addEventListener('click',e=>{e.stopPropagation(); if(typeof selConn==='function') selConn(cid);});
                  path.addEventListener('contextmenu',e=>{e.preventDefault(); e.stopPropagation(); G.ctx.conn=cid; if(typeof selConn==='function') selConn(cid); if(typeof openMenu==='function') openMenu('cmenu',e.clientX,e.clientY);});
                  if(typeof updConn==='function') updConn(cid);
                }
              }
              if(typeof updateStat==='function') updateStat();
              if(typeof mmDraw==='function') mmDraw();
              if(document.getElementById('welcome')) document.getElementById('welcome').classList.add('gone');
              if(typeof simLog==='function') simLog(entry.name+' loaded','on');
              if(typeof showToast==='function') showToast(entry.name+' loaded');
              if(VizMod && VizMod.buildBoardSVG){
                const prev=document.getElementById('preview-svg');
                if(prev) prev.innerHTML=VizMod.buildBoardSVG({nodes:G.nodes,conns:G.conns});
              }
              if(typeof fitScreen==='function') setTimeout(()=>fitScreen(), 100);
              return;
            }
          }
        }catch(e){ console.warn('AppIntegration load failed', e); }
      }
      if(typeof simLog==='function') simLog('Loading '+name+'...','on');
    }
  }
  if(typeof showToast==='function') showToast('Example: '+name);
}
window.loadExample=loadExampleBoard; window.loadExampleBoard=loadExampleBoard;
function initBoard(){
  const ov=document.getElementById('overlay');
  if(ov) ov.style.display='none';
  initHeroTerminal();
  initBgCanvas();
  initGlitter();
  initDarkToggle();
  initMobileNav();
  initScrollProgress();
  renderLibrary();
  renderWikiRef();
  const origSetTool = window.setTool;
  if(typeof origSetTool==='function'){
    window.setTool = function(t){
      origSetTool(t);
      document.querySelectorAll('.comp-btn').forEach(b=>b.classList.remove('sel'));
      const mp={select:'cb-select', pan:'cb-pan', connect:'cb-connect', sticky:'cb-sticky', text:'cb-text', group:'cb-group', erase:'cb-erase'};
      const id=mp[t];
      if(id){ const el=document.getElementById(id); if(el) el.classList.add('sel'); }
    };
  }
  const kbdOpen=document.getElementById('kbdOpenBtn');
  const kbdModal=document.getElementById('kbdModal');
  const kbdClose=document.getElementById('kbdModalClose');
  if(kbdOpen&&kbdModal) kbdOpen.addEventListener('click',()=> kbdModal.classList.remove('hidden'));
  if(kbdClose&&kbdModal) kbdClose.addEventListener('click',()=> kbdModal.classList.add('hidden'));
  if(kbdModal) kbdModal.addEventListener('click', (e)=>{ if(e.target===kbdModal) kbdModal.classList.add('hidden'); });
  const lp=document.getElementById('lp-search');
  if(lp) lp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ lpSearch(); }});
  if(typeof simLog==='function') simLog('WikiBoard Y2K ready — search Wikipedia to begin ✦','on');
  if(typeof showToast==='function') showToast('WikiBoard ready ✦');
}
window.initBoard=initBoard;
window.init = initBoard;
if(document.readyState!=='loading'){
  setTimeout(()=>{
    if(!document.getElementById('overlay') || document.getElementById('overlay').style.display==='none'){
      initHeroTerminal(); initBgCanvas(); initGlitter(); initDarkToggle(); initMobileNav(); initScrollProgress(); renderLibrary(); renderWikiRef();
    }
  }, 400);
} else {
  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(()=>{
      if(document.getElementById('overlay') && document.getElementById('overlay').style.display!=='none'){
        initHeroTerminal(); initBgCanvas(); initGlitter();
      }
    }, 200);
  });
}
document.addEventListener('DOMContentLoaded', ()=>{
  const s=document.getElementById('sinp');
  const lp=document.getElementById('lp-search');
  if(s && lp){
    lp.addEventListener('input', ()=>{});
  }
});
window.WikiBoardUI = {
  get G(){ return (typeof G!=='undefined'?G:null); },
  esc: escEngine, sanitize: sanitizeEngine,
  initBoard
};
