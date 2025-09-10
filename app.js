// app.js — Browser UI (talks to /generate, /hulls, /steps, /analyze)

// === Algorithms (hardcoded) ===
function genPoints(n=1000, dist="square", outliers=0) {
  const pts = [];
  for (let i=0; i<n; i++) {
    let x, y;
    if (dist==="circle") {
      const ang = Math.random()*2*Math.PI, r = Math.random();
      x = r*Math.cos(ang); y = r*Math.sin(ang);
    } else if (dist==="gaussian") {
      x = randn_bm(); y = randn_bm();
    } else if (dist==="annulus") {
      const ang = Math.random()*2*Math.PI;
      const r = 0.5+Math.random()*0.5;
      x=r*Math.cos(ang); y=r*Math.sin(ang);
    } else if (dist==="clusters") {
      const cx = [0, 3, -3], cy=[0, 3, -3];
      const k = Math.floor(Math.random()*3);
      x = cx[k] + 0.5*randn_bm();
      y = cy[k] + 0.5*randn_bm();
    } else { // square
      x=Math.random()*2-1; y=Math.random()*2-1;
    }
    pts.push({x,y});
  }
  // add outliers
  for (let i=0; i<outliers; i++) {
    pts.push({x:(Math.random()*6-3), y:(Math.random()*6-3)});
  }
  return pts;
}
function randn_bm(){
  let u=0,v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
function orientation(p,q,r){
  const val = (q.y-p.y)*(r.x-q.x)-(q.x-p.x)*(r.y-q.y);
  if(val===0) return 0;
  return val>0?1:2;
}
function jarvisHull(pts){
  const n=pts.length; if(n<3) return pts.slice();
  const hull=[];
  let l=0; for(let i=1;i<n;i++){ if(pts[i].x<pts[l].x) l=i; }
  let p=l,q;
  do{
    hull.push(pts[p]);
    q=(p+1)%n;
    for(let i=0;i<n;i++){
      if(orientation(pts[p],pts[i],pts[q])===2) q=i;
    }
    p=q;
  } while(p!==l);
  return hull;
}
function grahamHull(pts){
  if(pts.length<3) return pts.slice();
  let ymin=pts[0].y, min=0;
  for(let i=1;i<pts.length;i++){
    if((pts[i].y<ymin)||(ymin===pts[i].y && pts[i].x<pts[min].x)){ ymin=pts[i].y; min=i; }
  }
  const arr = pts.slice();
  [arr[0], arr[min]] = [arr[min], arr[0]];
  const p0 = arr[0];
  arr.sort((a,b)=>{
    const o=orientation(p0,a,b);
    if(o===0){
      return (Math.hypot(p0.x-a.x,p0.y-a.y) >= Math.hypot(p0.x-b.x,p0.y-b.y)) ? -1:1;
    }
    return (o===2)?-1:1;
  });
  const stack=[arr[0], arr[1], arr[2]];
  for(let i=3;i<arr.length;i++){
    while(stack.length>1 && orientation(stack[stack.length-2], stack[stack.length-1], arr[i])!==2){
      stack.pop();
    }
    stack.push(arr[i]);
  }
  return stack;
}

// === DOM refs ===
const plot = document.getElementById('plot');
const chart = document.getElementById('chart');
const ctxPlot = plot.getContext('2d');
const ctxChart = chart.getContext('2d');

const nEl = document.getElementById('n');
const seedEl = document.getElementById('seed');
const distEl = document.getElementById('dist');
const modeEl = document.getElementById('mode');
const pointShapeEl = document.getElementById('pointShape');
const gridEl = document.getElementById('grid');
const labelsEl = document.getElementById('labels');
const explainEl = document.getElementById('explain');
const hoverToggleEl = document.getElementById('hoverToggle');

const runBtn = document.getElementById('runBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const statsEl = document.getElementById('stats');
const detailsEl = document.getElementById('details');
const stepboxEl = document.getElementById('stepbox');

const tooltipPlot = document.getElementById('tooltipPlot');
const tooltipChart = document.getElementById('tooltipChart');

const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const resetViewBtn = document.getElementById('resetView');

const FREE_DRAW_BOUNDS = { minX: -100, maxX: 100, minY: -100, maxY: 100 };

// === State ===
let view = { tx: 0, ty: 0, scale: 1 };
let ALL_POINTS = [];
let HULL_J = null, HULL_G = null;
let BOUNDS = { minX:-1, maxX:1, minY:-1, maxY:1 }; // safe default; compute later
let FREE_DRAW = false;

// Hover spatial index
let SPATIAL = null;
let isDragging=false, startX=0, startY=0, startTx=0, startTy=0;

// === Helpers ===

// forward map: world -> screen (px)
function mapPt(p){
  const b = BOUNDS;
  const nx = (p.x - b.minX) / (b.maxX - b.minX);
  const ny = 1 - (p.y - b.minY) / (b.maxY - b.minY);
  const x = (nx * (plot.width-40) + 20) * view.scale + view.tx;
  const y = (ny * (plot.height-40) + 20) * view.scale + view.ty;
  return {x,y};
}

// inverse map: screen (px) -> world (x,y)
function invMap(sx, sy){
  const b = BOUNDS;
  const nx = (((sx - view.tx)/view.scale) - 20) / (plot.width - 40);
  const ny = 1 - ((((sy - view.ty)/view.scale) - 20) / (plot.height - 40));
  const wx = b.minX + nx * (b.maxX - b.minX);
  const wy = b.minY + ny * (b.maxY - b.minY);
  return {x: wx, y: wy};
}

function shortNum(v){
  const a = Math.abs(v);
  if (a >= 1e6) return (v/1e6).toFixed(1)+'M';
  if (a >= 1e3) return (v/1e3).toFixed(1)+'k';
  return Math.round(v).toString();
}

// choose a "nice" step (1,2,5 * 10^k) near a target world size
function niceStep(target){
  const t = Math.max(target, Number.EPSILON);
  const exp = Math.floor(Math.log10(t));
  const base = t / Math.pow(10, exp);
  let nice = 1;
  if (base >= 5) nice = 5;
  else if (base >= 2) nice = 2;
  return nice * Math.pow(10, exp);
}

// original bounds helper (kept for generated mode)
function bounds(points){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of points){ if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y; }
  if (!isFinite(minX)) { minX=maxX=minY=maxY=0; }
  const padX = (maxX-minX)||1, padY=(maxY-minY)||1;
  const pad = 0.06;
  return {minX:minX-pad*padX, maxX:maxX+pad*padX, minY:minY-pad*padY, maxY:maxY+pad*padY};
}

function drawAxisTicks(){
  if (!gridEl.checked) return;

  // Visible world rect for current view (in world coords)
  const wBL = invMap(0, plot.height);   // bottom-left
  const wTR = invMap(plot.width, 0);    // top-right
  const minWX = Math.min(wBL.x, wTR.x);
  const maxWX = Math.max(wBL.x, wTR.x);
  const minWY = Math.min(wBL.y, wTR.y);
  const maxWY = Math.max(wBL.y, wTR.y);

  // pick step so grid ~ every 100 px
  const worldW = (BOUNDS.maxX - BOUNDS.minX);
  const pxPerWorld = (plot.width - 40) / worldW * view.scale;
  const step = niceStep(100 / (pxPerWorld || 1));
  const stepX = step, stepY = step;

  // grid lines
  ctxPlot.strokeStyle = '#202a52';
  ctxPlot.lineWidth = 1;
  ctxPlot.setLineDash([2,4]);
  ctxPlot.beginPath();

  // verticals
  let xStart = Math.floor(minWX / stepX) * stepX;
  for (let xw = xStart; xw <= maxWX; xw += stepX) {
    const p0 = mapPt({x:xw, y:minWY});
    const p1 = mapPt({x:xw, y:maxWY});
    ctxPlot.moveTo(p0.x, p0.y);
    ctxPlot.lineTo(p1.x, p1.y);

    // label bottom
    ctxPlot.fillStyle = '#9aa6ce';
    ctxPlot.font = '12px system-ui';
    ctxPlot.fillText(shortNum(xw), p0.x-10, (plot.height-8)*view.scale + view.tx);
  }

  // horizontals
  let yStart = Math.floor(minWY / stepY) * stepY;
  for (let yw = yStart; yw <= maxWY; yw += stepY) {
    const p0 = mapPt({x:minWX, y:yw});
    const p1 = mapPt({x:maxWX, y:yw});
    ctxPlot.moveTo(p0.x, p0.y);
    ctxPlot.lineTo(p1.x, p1.y);

    // label left
    ctxPlot.fillStyle = '#9aa6ce';
    ctxPlot.font = '12px system-ui';
    ctxPlot.fillText(shortNum(yw), 4*view.scale + view.tx, p0.y-2);
  }

  ctxPlot.stroke();
  ctxPlot.setLineDash([]);

  // axes x=0 and y=0 if visible
  if (0 >= minWX && 0 <= maxWX) {
    const a0 = mapPt({x:0, y:minWY});
    const a1 = mapPt({x:0, y:maxWY});
    ctxPlot.strokeStyle = '#334155';
    ctxPlot.lineWidth = 1.25;
    ctxPlot.beginPath();
    ctxPlot.moveTo(a0.x, a0.y);
    ctxPlot.lineTo(a1.x, a1.y);
    ctxPlot.stroke();
  }
  if (0 >= minWY && 0 <= maxWY) {
    const a0 = mapPt({x:minWX, y:0});
    const a1 = mapPt({x:maxWX, y:0});
    ctxPlot.strokeStyle = '#334155';
    ctxPlot.lineWidth = 1.25;
    ctxPlot.beginPath();
    ctxPlot.moveTo(a0.x, a0.y);
    ctxPlot.lineTo(a1.x, a1.y);
    ctxPlot.stroke();
  }
}

function drawMarker(ctx,x,y,shape,size){
  if (shape==='square'){
    ctx.fillRect(x-size/2, y-size/2, size, size);
  } else if (shape==='circle'){
    ctx.beginPath(); ctx.arc(x,y,size/2,0,Math.PI*2); ctx.fill();
  } else if (shape==='triangle'){
    const h = size * 0.866;
    ctx.beginPath();
    ctx.moveTo(x, y - h*0.666);
    ctx.lineTo(x - size/2, y + h*0.333);
    ctx.lineTo(x + size/2, y + h*0.333);
    ctx.closePath(); ctx.fill();
  } else { // cross
    const s = size/2;
    ctx.fillRect(x-s, y-1, size, 2);
    ctx.fillRect(x-1, y-s, 2, size);
  }
}

function drawPointsAdaptive(points, mode){
  const N = points.length;
  if (mode === 'heatmap' || (mode === 'adaptive' && N > 50000)) {
    const W = 120, H = 80;
    const grid = Array.from({length: H}, ()=>Array(W).fill(0));
    for (const p of points){
      const q = mapPt(p);
      const gx = Math.max(0, Math.min(W-1, Math.floor((q.x - view.tx) / (view.scale * (plot.width / W)))));
      const gy = Math.max(0, Math.min(H-1, Math.floor((q.y - view.ty) / (view.scale * (plot.height / H)))));
      grid[gy][gx]++;
    }
    const maxc = grid.flat().reduce((a,b)=>Math.max(a,b),0) || 1;
    for (let gy=0; gy<H; gy++){
      for (let gx=0; gx<W; gx++){
        const c = grid[gy][gx];
        if (!c) continue;
        const alpha = Math.min(0.08 + 0.92*(c/maxc), 0.98);
        ctxPlot.fillStyle = `rgba(122,162,255,${alpha})`;
        const x0 = gx * (plot.width / W) * view.scale + view.tx;
        const y0 = gy * (plot.height / H) * view.scale + view.ty;
        ctxPlot.fillRect(x0, y0, (plot.width / W)*view.scale, (plot.height / H)*view.scale);
      }
    }
    return;
  }

  const shape = pointShapeEl.value;
  const NcapShape = 30000;
  const useShape = (shape==='square' || N <= NcapShape) ? shape : 'square';

  ctxPlot.fillStyle = '#b7c2e5';
  const step = (mode === 'adaptive' && N > 20000) ? Math.ceil(N / 20000) : 1;
  const sz = (mode === 'adaptive') ? (N > 20000 ? 1.5 : 2.2) : 2.2;
  for (let i = 0; i < N; i += step){
    const q = mapPt(points[i]);
    drawMarker(ctxPlot, q.x, q.y, useShape, sz*2);
  }
}

function drawPoly(points, color, dashed, vertexShape, labelPrefix){
  if(!points || points.length===0) return;
  ctxPlot.beginPath();
  const s = mapPt(points[0]);
  ctxPlot.moveTo(s.x, s.y);
  for (let i=1;i<points.length;i++){
    const q = mapPt(points[i]);
    ctxPlot.lineTo(q.x, q.y);
  }
  const back = mapPt(points[0]);
  ctxPlot.lineTo(back.x, back.y);
  ctxPlot.strokeStyle = color;
  ctxPlot.lineWidth = 2;
  ctxPlot.setLineDash(dashed ? [8,6] : []);
  ctxPlot.stroke();
  ctxPlot.setLineDash([]);

  ctxPlot.fillStyle = color.replace('rgb','rgba').replace(')',',0.08)');
  ctxPlot.fill();

  ctxPlot.fillStyle = color;
  for (let i=0;i<points.length;i++){
    const q = mapPt(points[i]);
    ctxPlot.beginPath();
    if (vertexShape === 'square') ctxPlot.rect(q.x-3, q.y-3, 6, 6);
    else ctxPlot.arc(q.x, q.y, 3, 0, Math.PI*2);
    ctxPlot.fill();

    if (labelsEl.checked) {
      ctxPlot.fillStyle = '#cfd6ff';
      ctxPlot.font = '12px system-ui';
      ctxPlot.fillText(`${labelPrefix}${i}`, q.x+6, q.y-6);
      ctxPlot.fillStyle = color;
    }
  }
}

function polyArea(points){
  if (!points || points.length < 3) return 0;
  let a=0;
  for (let i=0;i<points.length;i++){
    const p = points[i], q = points[(i+1)%points.length];
    a += p.x*q.y - p.y*q.x;
  }
  return Math.abs(a)/2;
}
function bboxArea(b){ return (b.maxX-b.minX)*(b.maxY-b.minY); }
function perimeter(points){
  if (!points || points.length < 2) return 0;
  let s=0;
  for (let i=0;i<points.length;i++){
    const p = points[i], q = points[(i+1)%points.length];
    s += Math.hypot(p.x-q.x, p.y-q.y);
  }
  return s;
}

function updateDetails(allPts, j, g, tJ, tG){
  const b = BOUNDS;
  const areaJ = polyArea(j), areaG = polyArea(g);
  const perJ = perimeter(j), perG = perimeter(g);
  const bboxA = bboxArea(b) || 1;
  const convexity = (Math.max(areaJ, areaG) / bboxA);

  const sameSize = j.length === g.length;
  const areaClose = Math.abs(areaJ - areaG) <= Math.max(1e-6, 0.00001*Math.max(areaJ, areaG));
  const ok = (sameSize && areaClose);

  detailsEl.innerHTML = `
    <b>Total Points</b><span>${allPts.length.toLocaleString()}</span>
    <b>Jarvis Hull Size</b><span>${j.length}</span>
    <b>Graham Hull Size</b><span>${g.length}</span>
    <b>Jarvis Time</b><span>${tJ} ms</span>
    <b>Graham Time</b><span>${tG} ms</span>
    <b>Jarvis Area</b><span>${areaJ.toFixed(2)}</span>
    <b>Graham Area</b><span>${areaG.toFixed(2)}</span>
    <b>Jarvis Perimeter</b><span>${perJ.toFixed(2)}</span>
    <b>Graham Perimeter</b><span>${perG.toFixed(2)}</span>
    <b>Bounding Box Area</b><span>${bboxA.toFixed(2)}</span>
    <b>Convexity Ratio</b><span>${convexity.toFixed(3)} ${convexity>0.9?'<span class="ok">— very rectangular</span>':'<span class="warn">— irregular spread</span>'}</span>
    <b>Equality Check</b><span>${ok?'<span class="ok">OK (areas & sizes align)</span>':'<span class="warn">differs (inspect)</span>'}</span>
  `;
}

function setStepText(text){
  if (!explainEl.checked) { stepboxEl.classList.add('hidden'); return; }
  stepboxEl.classList.remove('hidden');
  stepboxEl.textContent = text;
}

// === Spatial index for hover ===
function rebuildSpatial(){
  if (!ALL_POINTS.length) { SPATIAL=null; return; }
  const N = ALL_POINTS.length;
  const W = 80, H = 60;
  const buckets = Array.from({length:H},()=>Array.from({length:W},()=>[]));
  const cellW = (plot.width * view.scale) / W;
  const cellH = (plot.height * view.scale) / H;

  const step = (modeEl.value==='adaptive' && N>60000) ? Math.ceil(N/60000) : 1;
  for (let i=0;i<N;i+=step){
    const sp = mapPt(ALL_POINTS[i]);
    const gx = Math.max(0, Math.min(W-1, Math.floor((sp.x - view.tx) / cellW)));
    const gy = Math.max(0, Math.min(H-1, Math.floor((sp.y - view.ty) / cellH)));
    buckets[gy][gx].push({i, x:sp.x, y:sp.y, p:ALL_POINTS[i]});
  }
  SPATIAL = {W,H,cellW,cellH,buckets};
}

function nearestPointFromSpatial(x,y){
  if (!SPATIAL || !hoverToggleEl.checked) return null;
  const {W,H,cellW,cellH,buckets} = SPATIAL;
  const gx = Math.max(0, Math.min(W-1, Math.floor((x - view.tx) / cellW)));
  const gy = Math.max(0, Math.min(H-1, Math.floor((y - view.ty) / cellH)));
  const R = 1;
  let best=null, bestD=12;
  for (let yy=Math.max(0,gy-R); yy<=Math.min(H-1,gy+R); yy++){
    for (let xx=Math.max(0,gx-R); xx<=Math.min(W-1,gx+R); xx++){
      for (const item of buckets[yy][xx]){
        const d = Math.hypot(item.x - x, item.y - y);
        if (d < bestD){ bestD = d; best = item; }
      }
    }
  }
  return best;
}

function nearestHullVertex(x,y){
  let best=null, bestD=14;
  function scan(h, tag){
    if (!h || !h.points) return;
    for (let i=0;i<h.points.length;i++){
      const pt = h.points[i];
      const sp = mapPt(pt);
      const d = Math.hypot(sp.x-x, sp.y-y);
      if (d<bestD) best = {p:pt, x:sp.x,y:sp.y, tag, idx:i, size:h.points.length};
    }
  }
  scan(HULL_J, 'Jarvis');
  scan(HULL_G, 'Graham');
  return best;
}

// === Pan/zoom & hover ===
plot.addEventListener('mousedown', (e)=>{ isDragging=true; startX=e.clientX; startY=e.clientY; startTx=view.tx; startTy=view.ty; hideTooltip(tooltipPlot); });
window.addEventListener('mouseup', ()=>{ if(isDragging){ isDragging=false; rebuildSpatial(); } });
window.addEventListener('mousemove', (e)=>{
  if(isDragging){ view.tx = startTx + (e.clientX - startX); view.ty = startTy + (e.clientY - startY); render(); return; }
  handlePlotHover(e);
});

// FREE DRAW: add point exactly where clicked (pan/zoom aware)
plot.addEventListener('click', (e)=>{
  if (!FREE_DRAW) return;
  const rect = plot.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const w = invMap(sx, sy); // true screen->world
  ALL_POINTS.push({x:w.x, y:w.y});
  BOUNDS = FREE_DRAW_BOUNDS; // keep board fixed while drawing

  if(ALL_POINTS.length>=3){
    const t0=performance.now();
    const j=jarvisHull(ALL_POINTS);
    const t1=performance.now();
    const g=grahamHull(ALL_POINTS);
    const t2=performance.now();
    HULL_J={points:j,ms:Math.round(t1-t0)};
    HULL_G={points:g,ms:Math.round(t2-t1)};
  }
  render();
});

// FREE DRAW: right-click undo (keeps board fixed)
plot.addEventListener('contextmenu',(e)=>{
  if(!FREE_DRAW) return;
  e.preventDefault();
  ALL_POINTS.pop();
  BOUNDS = FREE_DRAW_BOUNDS;
  if(ALL_POINTS.length>=3){
    HULL_J={points:jarvisHull(ALL_POINTS), ms:0};
    HULL_G={points:grahamHull(ALL_POINTS), ms:0};
  } else {
    HULL_J=HULL_G=null;
  }
  render();
});

// === Free Draw Mode toggle ===
document.getElementById('freeDraw').addEventListener('change', (e)=>{
  FREE_DRAW = e.target.checked;
  if (FREE_DRAW) {
    ALL_POINTS = [];
    HULL_J = HULL_G = null;
    BOUNDS = FREE_DRAW_BOUNDS;
    render();
  } else {
    computeAndDraw(); // will reset BOUNDS to fit generated points
  }
});

zoomInBtn.onclick = ()=>{ view.scale*=1.2; render(); rebuildSpatial(); };
zoomOutBtn.onclick = ()=>{ view.scale/=1.2; render(); rebuildSpatial(); };
resetViewBtn.onclick = ()=>{ view = {tx:0,ty:0,scale:1}; render(); rebuildSpatial(); };

function showTooltip(el, x, y, html){
  el.innerHTML = html;
  el.style.left = `${x + 12}px`;
  el.style.top = `${y - 12}px`;
  el.classList.remove('hidden');
}
function hideTooltip(el){ el.classList.add('hidden'); }

function handlePlotHover(e){
  if (!hoverToggleEl.checked) { hideTooltip(tooltipPlot); return; }
  const rect = plot.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const hv = nearestHullVertex(x,y);
  if (hv){
    const wp = hv.p;
    showTooltip(tooltipPlot, x, y,
      `<b>${hv.tag} vertex #${hv.idx}/${hv.size-1}</b><br/>x=${wp.x.toFixed(2)}&nbsp; y=${wp.y.toFixed(2)}`
    );
    return;
  }

  if (modeEl.value==='heatmap'){ hideTooltip(tooltipPlot); return; }
  const np = nearestPointFromSpatial(x,y);
  if (np){
    showTooltip(tooltipPlot, x, y, `point #${np.i}<br/>x=${np.p.x.toFixed(2)}&nbsp; y=${np.p.y.toFixed(2)}`);
  } else {
    hideTooltip(tooltipPlot);
  }
}

// === Render ===
function render(){
  ctxPlot.clearRect(0,0,plot.width,plot.height);
  drawAxisTicks();
  drawPointsAdaptive(ALL_POINTS, modeEl.value);

  const cJarvis = 'rgb(255,80,80)';   // red
  const cGraham = 'rgb(80,160,255)'; // blue

  drawPoly(HULL_J?.points||[], cJarvis, true, 'square', 'J');
  drawPoly(HULL_G?.points||[], cGraham, false, 'circle', 'G');
}

// === API calls ===
function computeAndDraw(){
  const n = Number(nEl.value)||1000;
  const dist = distEl.value||'square';
  const outliers = Number(document.getElementById('outlierSlider')?.value||0);

  ALL_POINTS = genPoints(n, dist, outliers);

  const t0 = performance.now();
  const jarvisPts = jarvisHull(ALL_POINTS);
  const t1 = performance.now();
  const grahamPts = grahamHull(ALL_POINTS);
  const t2 = performance.now();

  HULL_J = {points: jarvisPts, ms: Math.round(t1-t0)};
  HULL_G = {points: grahamPts, ms: Math.round(t2-t1)};
  BOUNDS = bounds(ALL_POINTS); // generated mode: auto-fit points

  statsEl.textContent = `Jarvis ${HULL_J.ms} ms | Graham ${HULL_G.ms} ms`;
  updateDetails(ALL_POINTS, HULL_J.points, HULL_G.points, HULL_J.ms, HULL_G.ms);

  setStepText(
    `Jarvis wrapped ${HULL_J.points.length} vertices; Graham stacked ${HULL_G.points.length} vertices.`
  );

  render();
  rebuildSpatial();
}

// Performance series
let CHART_SERIES=[];
function drawChart(series){
  ctxChart.clearRect(0,0,chart.width,chart.height);
  if(!series.length) return;
  CHART_SERIES = series;

  const padL=50, padR=20, padT=12, padB=30;
  const minN = Math.min(...series.map(s=>s.n));
  const maxN = Math.max(...series.map(s=>s.n));
  const maxY = Math.max(...series.map(s=>Math.max(s.jarvis_ms, s.graham_ms))) * 1.15 || 1;

  const W = chart.width - (padL+padR);
  const H = chart.height - (padT+padB);

  function mapX(n){ return padL + (n - minN)/(maxN - minN) * W; }
  function mapY(ms){ return chart.height - padB - (ms / maxY) * H; }

  ctxChart.strokeStyle = '#202a52'; ctxChart.lineWidth = 1; ctxChart.setLineDash([2,4]);
  ctxChart.beginPath();
  const xTicks = Math.min(10, series.length);
  for(let i=0;i<=xTicks;i++){
    const n = minN + i*(maxN-minN)/xTicks;
    const x = mapX(n);
    ctxChart.moveTo(x, padT); ctxChart.lineTo(x, chart.height - padB);
    ctxChart.fillStyle='#9aa6ce'; ctxChart.font='12px system-ui';
    ctxChart.fillText(shortNum(n), x-12, chart.height-8);
  }
  const yTicks = 6;
  for(let j=0;j<=yTicks;j++){
    const ms = j*(maxY)/yTicks;
    const y = mapY(ms);
    ctxChart.moveTo(padL, y); ctxChart.lineTo(chart.width-padR, y);
    ctxChart.fillStyle='#9aa6ce'; ctxChart.font='12px system-ui';
    ctxChart.fillText(Math.round(ms).toString(), 6, y-2);
  }
  ctxChart.stroke(); ctxChart.setLineDash([]);

  ctxChart.strokeStyle = '#44507a'; ctxChart.beginPath();
  ctxChart.moveTo(padL,padT); ctxChart.lineTo(padL, chart.height-padB);
  ctxChart.lineTo(chart.width-padR, chart.height-padB);
  ctxChart.stroke();

  function line(key, color, dashed){
    ctxChart.beginPath();
    for(let i=0;i<series.length;i++){
      const s = series[i];
      const x = mapX(s.n), y = mapY(s[key]);
      if(i===0) ctxChart.moveTo(x,y); else ctxChart.lineTo(x,y);
    }
    ctxChart.strokeStyle = color; ctxChart.lineWidth = 2;
    ctxChart.setLineDash(dashed ? [8,6] : []);
    ctxChart.stroke();
    ctxChart.setLineDash([]);
  }
  line('jarvis_ms', '#ff6b6b', true);
  line('graham_ms', '#7aa2ff', false);

  ctxChart.fillStyle = '#9aa6ce'; ctxChart.font='12px system-ui';
  ctxChart.fillText('N (input size)', chart.width-120, chart.height-8);
  ctxChart.fillText('time (ms)', 8, 18);

  chart.onmousemove = (e)=>{
    if (!hoverToggleEl.checked) { hideTooltip(tooltipChart); drawChart(series); return; }
    drawChart(series);
    const r = chart.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const invN = minN + ((x - padL)/W) * (maxN - minN);
    let best = series[0];
    for (const s of series) if (Math.abs(s.n - invN) < Math.abs(best.n - invN)) best = s;
    const gx = mapX(best.n);
    ctxChart.strokeStyle='#ffd166'; ctxChart.lineWidth=1.5; ctxChart.setLineDash([3,4]);
    ctxChart.beginPath(); ctxChart.moveTo(gx, padT); ctxChart.lineTo(gx, chart.height-padB); ctxChart.stroke();
    ctxChart.setLineDash([]);
    showTooltip(tooltipChart, x, y,
      `<b>N=${best.n}</b><br/>Jarvis: ${best.jarvis_ms} ms<br/>Graham: ${best.graham_ms} ms`);
  };
  chart.onmouseleave = ()=>{ hideTooltip(tooltipChart); drawChart(series); };
}

function runAnalyze(){
  const min=2000, max=64000, mult=2;
  const dist=distEl.value||'square';
  const series=[];
  for(let n=min; n<=max; n*=mult){
    const pts = genPoints(n, dist);
    const t0=performance.now(); jarvisHull(pts); const t1=performance.now();
    grahamHull(pts); const t2=performance.now();
    series.push({n, jarvis_ms:Math.round(t1-t0), graham_ms:Math.round(t2-t1)});
  }
  drawChart(series);
}

// === Events ===
runBtn.addEventListener('click', computeAndDraw);
analyzeBtn.addEventListener('click', runAnalyze);
modeEl.addEventListener('change', ()=>{ render(); rebuildSpatial(); });
gridEl.addEventListener('change', render);
labelsEl.addEventListener('change', render);
explainEl.addEventListener('change', ()=>{ 
  if(!explainEl.checked) stepboxEl.classList.add('hidden'); 
  else stepboxEl.classList.remove('hidden'); 
});
distEl.addEventListener('change', computeAndDraw); // recompute when distribution changes
pointShapeEl.addEventListener('change', render);
hoverToggleEl.addEventListener('change', ()=>{ 
  hideTooltip(tooltipPlot); 
  hideTooltip(tooltipChart); 
});
shuffleBtn.addEventListener('click', ()=>{ 
  seedEl.value = Math.floor(Date.now() % 1e9); 
});

// Auto demo
computeAndDraw();

// === Extra unique features ===
document.getElementById('outlierSlider').addEventListener('input', computeAndDraw);

document.getElementById('mapMode').addEventListener('change', ()=>{
  plot.style.background = document.getElementById('mapMode').checked
  ? "#1e293b"   // clean dark mode
  : "#0a0f22";
  render();
});
