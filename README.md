# WikiBoard — Infinite Research Board

> **One line:** An **infinite-canvas research board** powered by live Wikipedia — search articles, drag them onto a board as cards, follow links to spawn related articles, and connect them into a visual knowledge map.

> **Tech:** Plain HTML, CSS, JavaScript + HTML5 SVG/Canvas + **Wikipedia API** (`fetch`). No framework, no build, no server. Every module is **UMD** (works in browser, Web Worker, and Node).

**Live demo:** Open `index.html` via `http-server` (Worker requires http, not `file://`).  
**Author:** Rahul Raj Singh · **Version:** 2.0 · **Rebuild:** FAANG-level modularization (1089-line single file → 8 engineered modules + tests)

---

## 30-second interview pitch

> “WikiBoard turns reading into a spatial research tool. You search Wikipedia, drag article cards onto an **infinite zoom/pan canvas**, click an article's links to spawn connected cards, and draw relationships between them. It talks directly to the **Wikipedia API** from the browser using `origin=*` for CORS, parses the returned article HTML safely with `DOMParser`, and renders a minimap and SVG connection arrows. It's entirely client-side — no server, no API key. For multi-peer sync I added a tiny **CRDT** (opLog + lamport clock + LWW) so two boards can merge ops idempotently.”

---

## How it works (big picture)

```
 search box ──► Wikipedia API ──► article card (DOM node on the board)
                                         │ click a link
                                         ▼
                               spawn connected card + draw arrow
 board = a giant "world" that you pan/zoom via CSS transform
 minimap mirrors the world; SVG layer draws the connections
 CRDT opLog ──► syncMerge ──► LWW merge for multi-peer
```

| Concept | What it means here |
|---|---|
| **Infinite canvas via CSS transform** | One `world` element with `translate + scale`; everything lives inside it |
| **Zoom-to-cursor math** | Adjust pan so the point under the mouse stays fixed while scaling |
| **World ↔ screen coordinates** | Convert clicks to board positions (`c2w`/`w2c`) |
| **CORS + `origin=*`** | How the browser is allowed to call the Wikipedia API directly |
| **async/await + fetch** | Non-blocking API calls for search/summary/links |
| **`DOMParser` + tag stripping (XSS safety)** | Sanitise third-party HTML before showing it |
| **SVG overlay inside the transformed world** | Connection arrows that pan/zoom with the cards |
| **Minimap with viewport rect** | A scaled mirror of the board for navigation |
| **CRDT Ops** | `createNode/addConn/...` each emits an op with lamport clock; `mergeOps/syncMerge` dedup + LWW |

---

## Module Map

```
 index.html  → loads style.css + lab.css (Y2K + paper board)
            ↳ wiki-engine.js  (UMD: browser / Worker / Node)  — WORLD/COLS, setOf/addAll, esc/sanitizeContent, worldToScreen/screenToWorld, c2w/w2c, zoomTransform, computeFit, portAnchor/bestSides/mkPath, Wiki URL builders, board state (Map+Array), CRDT opLog + vectorClock + syncMerge
            ↳ wiki-worker.js  (Web Worker) — importScripts(wiki-engine.js), onmessage {sanitize|portAnchor|mkPath|createNode|applyOp|merge|computeFit|wikiUrls|ping}
            ↳ viz.js          (UMD) — esc() XSS-safe, buildNodeSVG / buildStickySVG / buildConnectionSVG / buildBoardSVG (dot grid, minimap-aware)
            ↳ wiki-library.js (UMD) — boards: philosophy_map · science_overview · history_timeline · tech_stack · art_movement · empty_starter
            ↳ app-integration.js — Worker lifecycle + sanitizeAsync / syncAsync + loadExampleAsync (WikiLibrary→WikiEngine)
            ↳ script.js       — board UI: G state (Map-backed), infinite canvas via CSS transform, zoom-to-cursor, Wikipedia fetch (origin=*), safe rendering, ports/connections, stickies/texts/images/groups, generic drag, canvas events, toolbars, search + autocomplete, keyboard, minimap, menus, save/load, integration hooks (uses WikiEngine if present)
 tests/run-tests.js → wiki-engine.test.js + viz.test.js (Node assert)
```

---

## File-by-File

**wiki-engine.js** — Core truth. `WORLD/COLS`, `setOf/addAll`, `esc/sanitizeContent` (regex + allow-list), `worldToScreen/screenToWorld/c2w/w2c`, `zoomTransform` (tx = cx - r*(cx - tx)), `computeFit` (bbox → scale/tx/ty), `portAnchor/bestSides/mkPath` (SVG bezier), `buildSearchUrl/…` (pure URL builders), board state `Map(nodes)+Map(conns)+Map(stickies)…`, `boardCreateNode/addConn…` (each emits CRDT op), `createOp/applyOp/mergeOps/syncMerge` (LWW + lamport), `serialize/deserialize`, UMD wrapper.

**wiki-worker.js** — Offloads sanitization & CRDT. `importScripts('wiki-engine.js')` try/catch, `onmessage` handles `sanitize/esc/portAnchor/mkPath/createNode/applyOp/merge/computeFit/wikiUrls/ping`, timeout fallback in app-integration.

**viz.js** — XSS-safe SVG. `esc()`, `buildNodeSVG` (paper card + ports), `buildConnectionSVG` (bezier + marker), `buildBoardSVG` (bounds → dot grid + wires behind nodes + footer), `drawMinimapCanvas` (canvas minimap), UMD. Aliases `buildCircuitSVG/renderCircuit` for parity with Logic Forge.

**wiki-library.js** — Declarative boards. Each has `nodes{title,x,y,w,h,colIdx}[] + conns{from{idx},to{idx},style,label}[] + stickies/texts`. Helpers `get/list/injectExample/instantiate(WE)` mirroring `logic-library.js`.

**app-integration.js** — Bridges UI↔engine↔worker. `initWorker` (require http, not file:), `workerExec` promise map + 2.5s timeout, `sanitizeAsync/syncAsync` with main-thread fallback, `loadExampleAsync(state)` via WikiLibrary + WikiEngine. Auto-patches globals for script.js.

**script.js** — The board lab. `G` now backed by Map but wrapped for legacy DOM access; uses `WikiEngine` if present for esc/sanitize/mkPath/bestSides/world↔screen, otherwise inline fallback; keeps all original features (search+AC, wSearch/wSummary/wImages, mkNodeEl/hook, renderContent sanitised, collapse/cycle, loadRelated, drag/resize/ports, connections SVG inside world, stickies/texts/images/groups, canvas pan/zoom/minimap, toolbar, menus, keyboard, save/load, export JSON/SVG via Viz). Plus Y2K chrome (hero terminal, bgCanvas, glitter, ticker, dark toggle, library grid, wiki ref).

**index.html / style.css / lab.css** — Y2K maximalist shell (glitterCanvas, bgCanvas, ticker, cyber-nav, hero with terminal typewriter, token-strip, section-containers, lab flex). `style.css` holds Y2K theme; `lab.css` holds simulator layout (left-panel, canvas-wrap) + full paper-board styling (node/port/sticky/topbar/mmap/menus/toast) ported from single-file `<style>`.

**tests/** — Node assert proofs: `wiki-engine.test.js` checks UMD, COLS, setOf/addAll, esc/sanitize, snap/transforms/zoom, port geometry, URL builders, board CRUD + dedup, CRDT apply/merge, serialize; `viz.test.js` checks esc and SVG builders XSS-safe.

---

## Interview Guide

**Q: How does the infinite canvas work?**
A: “Everything sits inside one `world` element. Panning changes its `translate`, zooming changes its `scale`. So I never move individual cards for navigation — I move one container. Cards store world coordinates, and I convert screen clicks to world space with a small transform inversion.”

**Q: How do you zoom toward the mouse instead of the corner?**
A: “When scale changes by ratio `r`, I shift the pan so the world point under the cursor maps to the same screen pixel: `tx = mouseX - r*(mouseX - tx)` (and the same for y). Without that, zoom drifts toward the origin.”

**Q: You're calling Wikipedia from the browser — how, and isn't that blocked by CORS?**
A: “Wikipedia's API supports anonymous cross-origin requests if you pass `origin=*`, which returns permissive CORS headers. So I can `fetch` search, summaries, images, and links directly — no backend proxy needed.”

**Q: Wikipedia returns HTML — is that an XSS risk?**
A: “Yes, injecting raw third-party HTML is dangerous. I parse it with `DOMParser`, pull out just the paragraph text, keep a tiny allow-list (`<strong>`, `<br>`) and strip everything else with a regex before inserting. That neutralises scripts and unexpected markup. Tested via `WikiEngine.sanitizeContent`.”

**Q: How do connection arrows stay attached when you drag a card or zoom?**
A: “The SVG arrow layer lives *inside* the transformed world, so it scales and pans with the cards automatically. When a card moves I recompute the endpoints of its connections from the cards' world positions via `portAnchor + bestSides + mkPath`.”

**Q: How do you sync two boards?**
A: “Each mutation is a CRDT op with a lamport clock. `mergeOps` deduplicates by id keeping higher lamport/timestamp (LWW). `syncMerge` applies missing ops idempotently to the local state — so two peers can exchange opLogs and converge.”

**Q: How would you scale to hundreds of cards?**
A: “Cache API results, lazy-load images, and **virtualise** — only render cards near the viewport (cull off-screen ones). The minimap already gives an overview, so off-screen cards can be lightweight placeholders. Ops are O(1) per mutation, merge is O(n log n) sort.”

---

## Running

```bash
# http-server (Worker requires http, not file://)
npx http-server -p 5502 -c-1
# then open http://localhost:5502

# tests
node tests/run-tests.js
# or
npm test
```

## Tests

```
WikiEngine UMD — COLS, setOf/addAll, esc, sanitizeContent, snap/world↔screen, zoomTransform, computeFit, portAnchor/bestSides/mkPath, URL builders, board CRUD+dedup, CRDT apply/merge, serialize
Viz UMD — esc, buildNodeSVG, buildConnectionSVG, buildStickySVG, buildBoardSVG (XSS guard), renderBoard, minimap
```

---

## Credits

Rebuilt from `wikiboard (3).html` (single-file prototype, 1089 lines) to FAANG-level modular codebase. Author **Rahul Raj Singh** · GitHub `wikiConnect` · Pattern mirrors Compiler Forge & Logic Forge.

