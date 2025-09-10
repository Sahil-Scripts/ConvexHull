# Convex Hull — Jarvis vs Graham (Interactive)

**Compare two classic convex hull algorithms** — **Jarvis March** (Gift Wrapping) and **Graham Scan** — on generated or hand-drawn 2D point sets.
Includes hover tooltips, performance chart (ms vs N), multiple input distributions, heatmap view, and **Free-Draw mode** (left-click to add points, right-click to undo).

> **Complexity:** Jarvis \~ **O(n·h)** (n points, h hull vertices) • Graham \~ **O(n log n)**

---

## File Structure

```
ConvexHull/
├─ index.html          # UI layout and controls
├─ styles.css          # Dark, neon-glow theme + responsive layout
├─ app.js              # All logic: point gen, hulls, rendering, free-draw, chart
├─ server.js           # (Optional) Express server to serve static files
├─ package.json        # (Optional) For Node/Express
├─ package-lock.json   # (Optional)
└─ README.md
```

### What each file does

* **index.html** – The main page with controls (N, distribution, modes), the plot canvas, performance chart, and teach-mode info.
* **styles.css** – Styling: sidebar/toolbar, grid/tick colors, glowing hull edges & vertex markers, tooltips.
* **app.js** – Everything in the browser:

  * Point generation (square, disk, annulus, gaussian, clusters) + outlier injection.
  * **Jarvis March** & **Graham Scan** implementations.
  * Rendering to HTML5 Canvas (points, heatmap, hulls, labels, grid, axis ticks).
  * Performance series chart (ms vs N) with hover readouts.
  * **Free-Draw mode** (left-click add point, **right-click undo**), pan/zoom/reset, tooltips.
* **server.js** *(optional)* – Tiny Express server to serve the files locally (useful for consistent paths or if your browser blocks local file access).

---

## Quick Start

### A) Easiest (no install)

1. **Open `index.html`** directly in your browser (Chrome recommended).
2. Use the controls: pick a **distribution**, hit **Compute**, or enable **Free Draw** to click points onto the board.

> If your browser blocks some local features, use one of the lightweight servers below.

### B) Run a lightweight static server (no code changes)

Any of these work:

**VS Code Live Server extension**

* Right-click `index.html` → **Open with Live Server**.

**Node one-liners**

```bash
# Option 1 (serve):
npx serve .

# Option 2 (http-server):
npx http-server -p 8080
```

**Python (if installed)**

```bash
# Python 3
python -m http.server 8080
```

Then open `http://localhost:8080`.

### C) Run with Node/Express (optional)

If you want to serve via `server.js`:

```bash
npm install
node server.js
```

Default: `http://localhost:8000`

> If you see `EADDRINUSE: address already in use :::8000`, something else is running on 8000.
> **Windows fix:**
>
> ```powershell
> netstat -aon | findstr :8000
> taskkill /PID <PID_FROM_ABOVE> /F
> node server.js
> ```

---

## How to Use

**Controls (top bar / sidebar):**

* **N** – number of generated points.
* **Distribution** – square / disk / annulus / gaussian / clusters.
* **Render Mode** – points / heatmap / adaptive.
* **Point Shape** – circle / square / triangle / cross.
* **Outlier slider** – inject random outside points (stress test).
* **Grid / Labels / Teach Mode / Hover Tooltips** – toggles for visualization & learning.
* **Compute** – generate points + compute both hulls.
* **Analyze** – runs multiple N (2k → 64k) to plot **ms vs N** for both algorithms.
* **Free Draw Mode** – **left-click** to add a point, **right-click** to undo. Hull updates live for ≥3 points.
* **Pan/Zoom** – Drag on the canvas to pan. Use **Zoom + / −** buttons. **Reset View** re-centers.

**Hover:**

* Hover any vertex/point to see `(x, y)` and tag (J=Jarvis, G=Graham).
* Hover the performance chart to see exact timings at a given N.

---

## Features

* **Two hulls, visually distinct**: Jarvis (dashed, red glowing squares) vs Graham (solid, blue glowing circles).
* **Multiple distributions**: test how shape changes (e.g., uniform square tends to look rectangular at high N).
* **Heatmap / adaptive rendering**: stays smooth even at very large N.
* **Performance chart**: live **ms vs N** comparison; learn when Graham’s sort-based approach wins.
* **Free-Draw mode**: teach concept by drawing your own point set; **right-click undo**.
* **Grid + axis ticks**: always readable, with auto-scaling and padding.

---

## Running Tests / Demos

* **Baseline**: keep **N = 20,000** (default), try each distribution, and toggle **Heatmap** for visibility.
* **Stress**: push to higher N (browser memory limits apply; 50k–100k points should still be fine in heatmap/adaptive).
* **Teaching**: enable **Teach Mode** and **Labels**; explain how each algorithm constructs the hull.

---

## Real-World Where This Applies

* **Geofencing / boundary detection**: enclosing GPS points for a city/event to create a usable “fence”.
* **Image processing**: finding outlines of clusters (e.g., feature blobs).
* **Robotics & navigation**: obstacle boundary approximation.
* **Computational geometry education**: comparing algorithmic strategies and complexity.

---

## Tech Stack (short)

* **Vanilla HTML/CSS/JS + Canvas** — zero-dependency, portable, easy to explain in viva.
* **Optional Node/Express** — for serving static files consistently.
* **No heavy frameworks** — predictable performance for very large N; code is readable and hackathon-friendly.

---

## Git: Clone, Commit, Push

```bash
git clone https://github.com/Sahil-Scripts/ConvexHull.git
cd ConvexHull
# (Optional) Run via a local server, see Quick Start above
```

If you edit and want to push:

```bash
git add .
git commit -m "Update hull UI + free draw + performance chart"
git push
```

---

## Troubleshooting

* **Port 8000 already in use**
  See Windows fix under **Run with Node/Express (optional)**.
* **Blank page / scripts not loading**
  Use a local server (Live Server or `npx serve .`) instead of opening `file://`.
* **Canvas looks like a rectangle at high N**
  That’s expected for **uniform square**. Try **Disk / Annulus / Clusters** to show different hull shapes.
* **Lag with huge N**
  Switch to **Heatmap** or **Adaptive**; they reduce per-point draws.

---

## License

MIT — free to use for demos, teaching, and hackathons.
