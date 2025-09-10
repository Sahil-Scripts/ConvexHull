// Usage examples:
// echo 10000 | node cli.js
// echo 10000 | node cli.js --dist circle --seed 42

const readline = require('readline');
const { genPoints, jarvisHull, grahamHull } = require('./hull');

function parseFlags(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dist' && i + 1 < argv.length) { out.dist = argv[++i]; }
    else if (a === '--seed' && i + 1 < argv.length) { out.seed = Number(argv[++i]); }
  }
  return out;
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let N = null;
  for await (const line of rl) {
    const v = parseInt(line.trim(), 10);
    if (!isNaN(v)) { N = v; break; }
  }
  if (N == null) {
    console.error('Please provide an integer N on stdin');
    process.exit(1);
  }

  const { dist='square', seed } = parseFlags(process.argv);
  const s = (typeof seed === 'number' && !isNaN(seed)) ? seed : N;

  const pts = genPoints(N, s, dist);
  const j = jarvisHull(pts);
  const g = grahamHull(pts);

  const fmt = (p) => `(${p.x.toFixed(6)},${p.y.toFixed(6)})`;
  process.stdout.write(`Jarvis: ${j.length} ` + j.map(fmt).join(' ') + '\n');
  process.stdout.write(`Graham: ${g.length} ` + g.map(fmt).join(' ') + '\n');
})();
