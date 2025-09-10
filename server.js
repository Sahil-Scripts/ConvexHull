// server.js — Express API (Node only: no document/window/canvas here)
const express = require('express');
const path = require('path');
const { Worker } = require('worker_threads');
const { genPoints, jarvisWithSteps, grahamWithSteps } = require('./hull');

const app = express();
const PORT = process.env.PORT || 8000;

// Serve static frontend files from this folder
app.use(express.static(path.join(__dirname)));

// Root -> index.html (prevents "Cannot GET /")
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---- distribution normalization ----
const VALID_DISTS = new Set(['square','circle','annulus','gaussian','clusters']);
function normalizeDist(d) {
  if (typeof d !== 'string') return 'square';
  const v = d.toLowerCase().trim();
  return VALID_DISTS.has(v) ? v : 'square';
}

// Run hulls in a worker so the server stays responsive
function runWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'worker.js'), { workerData: data });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', code => code !== 0 && reject(new Error(`Worker exit ${code}`)));
  });
}

// ---------- APIs ----------

// Generate N points (deterministic with seed)
app.get('/generate', (req, res) => {
  try {
    const n = Math.max(1, Math.min(1_000_000, Number(req.query.n) || 1000));
    const seed = (req.query.seed !== undefined) ? Number(req.query.seed) : n; // default seed=n
    const dist = normalizeDist(req.query.dist || 'square');
    const pts = genPoints(n, seed, dist);
    res.json({ points: pts, n, seed, dist });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Compute hulls (Jarvis + Graham) + timings
app.get('/hulls', async (req, res) => {
  try {
    const n = Math.max(1, Math.min(1_000_000, Number(req.query.n) || 1000));
    const seed = (req.query.seed !== undefined) ? Number(req.query.seed) : n;
    const dist = normalizeDist(req.query.dist || 'square');
    const payload = await runWorker({ n, seed, dist });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Teach-mode steps (capped for payload)
app.get('/steps', (req, res) => {
  try {
    const n = Math.max(1, Math.min(200_000, Number(req.query.n) || 5000));
    const seed = (req.query.seed !== undefined) ? Number(req.query.seed) : n;
    const dist = normalizeDist(req.query.dist || 'square');
    const pts = genPoints(n, seed, dist);
    const j = jarvisWithSteps(pts);
    const g = grahamWithSteps(pts);
    const cap = 600;
    res.json({
      jarvis: { size: j.hull.length, steps: j.steps.slice(0, cap) },
      graham: { size: g.hull.length, steps: g.steps.slice(0, cap) }
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Performance sweep series
app.get('/analyze', async (req, res) => {
  try {
    let min = Number(req.query.min) || 1000;
    let max = Number(req.query.max) || 100000;
    const mult = Number(req.query.mult) || 2;
    const seedBase = (req.query.seed !== undefined) ? Number(req.query.seed) : min;
    const dist = normalizeDist(req.query.dist || 'square');

    const out = [];
    for (let n = min; n <= max; n = Math.max(n + 1, Math.floor(n * mult))) {
      const r = await runWorker({ n, seed: seedBase + n, dist });
      out.push({ n, jarvis_ms: r.jarvis.ms, graham_ms: r.graham.ms });
    }
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Helpful 404
app.use((req, res) => {
  res.status(404).send(
    `Not found: ${req.originalUrl}\n\nTry:\n` +
    `  / (home)\n` +
    `  /generate?n=5000&dist=circle&seed=42\n` +
    `  /hulls?n=5000&dist=circle&seed=42\n` +
    `  /steps?n=5000&dist=clusters\n` +
    `  /analyze?min=2000&max=64000&mult=2&dist=gaussian\n`
  );
});

app.listen(PORT, () => console.log(`Server → http://localhost:${PORT}`));
