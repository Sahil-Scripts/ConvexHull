// Heavy compute in a worker thread
const { parentPort, workerData } = require('worker_threads');
const { genPoints, jarvisHull, grahamHull } = require('./hull');

const { n, seed, dist } = workerData;

const pts = genPoints(n, seed, dist);

const t0 = Date.now();
const jarvis = jarvisHull(pts);
const t1 = Date.now();
const graham = grahamHull(pts);
const t2 = Date.now();

parentPort.postMessage({
  jarvis: { size: jarvis.length, points: jarvis, ms: t1 - t0 },
  graham: { size: graham.length, points: graham, ms: t2 - t1 }
});
