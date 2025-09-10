// Geometry + deterministic points + Teach Mode helpers (CommonJS)

const EPS = 1e-9;
const cmp = (a, b) => (Math.abs(a - b) < EPS ? 0 : a < b ? -1 : 1);
function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
function dist2(p, q) { const dx = p.x - q.x, dy = p.y - q.y; return dx*dx + dy*dy; }

// RNG (splitmix64-like) -> float [0,1)
function makeRng(seed) {
  let x = BigInt(seed || 0x9e3779b97f4a7c15n);
  return () => {
    x += 0x9e3779b97f4a7c15n;
    let z = x;
    z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n;
    z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn;
    z ^= z >> 31n;
    const mant = (z >> 11n) & ((1n << 53n) - 1n);
    return Number(mant) / Number(1n << 53n);
  };
}

// Point generation with distributions
function genPoints(n, seed = n, dist = "square") {
  const rng = makeRng(seed);
  const pts = [];
  const R = 1e6;
  const next = () => rng();

  if (dist === "square") {
    for (let i = 0; i < n; i++) pts.push({ x: (next()*2-1)*R, y: (next()*2-1)*R });
  } else if (dist === "circle") {
    for (let i = 0; i < n; i++) {
      const t = 2*Math.PI*next();
      const r = Math.sqrt(next())*R;
      pts.push({ x: r*Math.cos(t), y: r*Math.sin(t) });
    }
  } else if (dist === "annulus") {
    const r0 = 0.6*R, r1 = R;
    for (let i = 0; i < n; i++) {
      const t = 2*Math.PI*next();
      const r = Math.sqrt(r0*r0 + (r1*r1 - r0*r0)*next());
      pts.push({ x: r*Math.cos(t), y: r*Math.sin(t) });
    }
  } else if (dist === "gaussian") {
    const gauss = () => {
      const u1 = Math.max(1e-12, next()), u2 = next();
      return Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2);
    };
    const s = R/3;
    for (let i = 0; i < n; i++) pts.push({ x: gauss()*s, y: gauss()*s });
  } else if (dist === "clusters") {
    const centers = [ {x:-0.5*R,y:-0.2*R}, {x:0.6*R,y:0.4*R}, {x:-0.1*R,y:0.7*R} ];
    const gauss = () => {
      const u1 = Math.max(1e-12, next()), u2 = next();
      return Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2);
    };
    const s = R/12;
    for (let i=0;i<n;i++) {
      const c = centers[i % centers.length];
      pts.push({ x: c.x + gauss()*s, y: c.y + gauss()*s });
    }
  } else {
    for (let i = 0; i < n; i++) pts.push({ x: (next()*2-1)*R, y: (next()*2-1)*R });
  }

  // Dedup (tolerance grid)
  const seen = new Map();
  for (const p of pts) seen.set(`${Math.round(p.x/EPS)}:${Math.round(p.y/EPS)}`, p);
  return [...seen.values()];
}

// Jarvis March (Gift Wrapping) O(n*h)
function jarvisHull(points) {
  const pts = points.slice();
  const n = pts.length;
  if (n <= 1) return pts.slice();

  // leftmost (then lowest y)
  let left = 0;
  for (let i = 1; i < n; i++) {
    if (pts[i].x < pts[left].x || (cmp(pts[i].x, pts[left].x) === 0 && pts[i].y < pts[left].y)) left = i;
  }

  const hull = [];
  let p = left;
  do {
    hull.push(pts[p]);
    let q = (p + 1) % n;
    for (let r = 0; r < n; r++) {
      if (r === p || r === q) continue;
      const cr = cross(pts[p], pts[q], pts[r]);
      if (cr < -EPS || (Math.abs(cr) < EPS && dist2(pts[p], pts[r]) > dist2(pts[p], pts[q]))) q = r;
    }
    p = q;
  } while (p !== left);

  if (hull.length > 2) return hull;
  const srt = pts.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  return [srt[0], srt[srt.length - 1]];
}

// Graham / Andrew Monotone Chain O(n log n)
function grahamHull(points) {
  const uniq = [];
  const seen = new Set();
  for (const p of points) {
    const k = `${Math.round(p.x / EPS)}:${Math.round(p.y / EPS)}`;
    if (!seen.has(k)) { seen.add(k); uniq.push(p); }
  }
  const ps = uniq.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (ps.length <= 1) return ps.slice();

  const lower = [];
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// Teach Mode — steps
function jarvisWithSteps(pts) {
  const hull = jarvisHull(pts);
  const steps = [];
  if (hull.length) steps.push({ type: "start", at: hull[0], note: "Start at leftmost (tie: lowest Y)" });
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    steps.push({ type: "edge", from: a, to: b, note: `Select edge ${i}` });
  }
  return { hull, steps };
}
function grahamWithSteps(pts) {
  const ps = pts.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const steps = [];
  const lower = [];
  for (const p of ps) {
    steps.push({ type: "push", which: "lower", point: p, note: "Push to lower stack" });
    lower.push(p);
    while (lower.length >= 3) {
      const L = lower.length, a = lower[L - 3], b = lower[L - 2], c = lower[L - 1];
      const cr = cross(a, b, c);
      if (cr <= 0) { steps.push({ type: "pop", which: "lower", point: b, note: "Right turn / collinear inward → pop" }); lower.splice(L - 2, 1); }
      else break;
    }
  }
  const upper = [];
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    steps.push({ type: "push", which: "upper", point: p, note: "Push to upper stack" });
    upper.push(p);
    while (upper.length >= 3) {
      const L = upper.length, a = upper[L - 3], b = upper[L - 2], c = upper[L - 1];
      const cr = cross(a, b, c);
      if (cr <= 0) { steps.push({ type: "pop", which: "upper", point: b, note: "Right turn / collinear inward → pop" }); upper.splice(L - 2, 1); }
      else break;
    }
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  steps.push({ type: "finish", note: "Concatenate lower + upper (drop duplicate endpoints)" });
  return { hull, steps };
}

module.exports = {
  EPS, cmp, cross, dist2,
  genPoints,
  jarvisHull, grahamHull,
  jarvisWithSteps, grahamWithSteps
};
