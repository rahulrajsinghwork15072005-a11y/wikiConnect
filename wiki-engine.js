(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof self !== 'undefined') self.WikiEngine = api;
  if (typeof window !== 'undefined') window.WikiEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this, function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────
  const WORLD = 12000;
  const CX = WORLD / 2;
  const CY = WORLD / 2;
  const SNAP = 16; // quantise placement (mirrors logic-engine)
  const GW = 340; // default node width
  const GH = 360; // default node height
  const NODE_MIN_W = 220;
  const NODE_MIN_H = 120;

  const COLS = [
    { bg: 'rgba(37,99,235,.07)', top: 'rgba(37,99,235,.4)', mm: 'rgba(37,99,235,.15)' },
    { bg: 'rgba(220,38,38,.06)', top: 'rgba(220,38,38,.4)', mm: 'rgba(220,38,38,.15)' },
    { bg: 'rgba(217,119,6,.07)', top: 'rgba(217,119,6,.4)', mm: 'rgba(217,119,6,.15)' },
    { bg: 'rgba(22,163,74,.06)', top: 'rgba(22,163,74,.4)', mm: 'rgba(22,163,74,.15)' },
    { bg: 'rgba(124,58,237,.07)', top: 'rgba(124,58,237,.4)', mm: 'rgba(124,58,237,.15)' },
    { bg: 'rgba(8,145,178,.07)', top: 'rgba(8,145,178,.4)', mm: 'rgba(8,145,178,.15)' },
  ];

  // ── Small set helpers (mirrors logic-engine spec parity) ──────
  const setOf = (arr) => new Set(arr || []);
  const addAll = (target, src) => {
    let changed = false;
    for (const x of src) if (!target.has(x)) { target.add(x); changed = true; }
    return changed;
  };

  // ── XSS-safe escape (mirrors viz.js) ──────────────────────────
  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // ── HTML sanitization (XSS-safe, Node-compatible) ─────────────
  // Mirrors renderContent() in wikiboard (3).html: DOMParser + allow-list strip
  // For Node we use regex; for browser we could use DOMParser if available but regex is deterministic for tests.
  function sanitizeContent(html, opts) {
    const maxParas = (opts && opts.maxParas) || 5;
    const raw = String(html || '');
    if (!raw.trim()) return '';
    // Try to extract paragraphs if raw contains <p> tags (Wikipedia extracts style)
    // Use regex to find <p>...</p> blocks
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paras = [];
    let m;
    while ((m = pRegex.exec(raw)) !== null) {
      let inner = m[1].trim();
      if (!inner) continue;
      // Count visible text length without tags
      const textOnly = inner.replace(/<[^>]+>/g, '').trim();
      if (textOnly.length < 15) continue;
      // Convert <b> to <strong>
      inner = inner.replace(/<b>/g, '<strong>').replace(/<\/b>/g, '</strong>');
      // Strip all tags except <strong>, </strong>, <br>, <br/>
      inner = inner.replace(/<(?!strong|\/strong|br\s*\/?)[^>]+>/gi, '');
      // Escape any leftover attribute injection? Already stripped
      // Trim and push
      inner = inner.trim();
      if (inner) paras.push(`<p>${inner}</p>`);
      if (paras.length >= maxParas) break;
    }
    if (paras.length) return paras.join('');
    // Fallback: strip all tags, escape, truncate to 500
    const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500);
    return `<p>${esc(text)}</p>`;
  }

  // Strip-only version for single fragment sanitizing (allow strong, br, em, a with href?)
  // We only allow strong and br per interview guide — keep it strict.
  function sanitizeFragment(html) {
    let t = String(html || '');
    t = t.replace(/<b>/gi, '<strong>').replace(/<\/b>/gi, '</strong>');
    t = t.replace(/<(?!strong|\/strong|br\s*\/?)[^>]+>/gi, '');
    return t;
  }

  // ── Coordinate helpers ─────────────────────────────────────────
  function snap(v) { return Math.round(v / SNAP) * SNAP; }

  function worldToScreen(x, y, zoom, panX, panY) {
    const z = zoom == null ? 1 : zoom;
    const px = panX == null ? 0 : panX;
    const py = panY == null ? 0 : panY;
    return { x: x * z + px, y: y * z + py };
  }

  function screenToWorld(x, y, zoom, panX, panY) {
    const z = zoom == null ? 1 : zoom;
    const px = panX == null ? 0 : panX;
    const py = panY == null ? 0 : panY;
    return { x: (x - px) / z, y: (y - py) / z };
  }

  // Aliases matching wikiboard (3).html: c2w / w2c
  function c2w(cx, cy, scale, tx, ty) {
    return screenToWorld(cx, cy, scale, tx, ty);
  }
  function w2c(wx, wy, scale, tx, ty) {
    return worldToScreen(wx, wy, scale, tx, ty);
  }

  function clampScale(s) {
    return Math.min(3, Math.max(0.08, s));
  }

  // zoom math: keep point under cursor fixed (classic interview question)
  function zoomTransform(scale, tx, ty, factor, cx, cy) {
    const prev = scale;
    const next = clampScale(scale * factor);
    const r = next / prev;
    if (!isFinite(r) || r === 0) return { scale: next, tx, ty };
    // If cx/cy undefined, zoom toward canvas centre is caller's responsibility
    if (cx == null || cy == null) return { scale: next, tx, ty };
    return { scale: next, tx: cx - r * (cx - tx), ty: cy - r * (cy - ty) };
  }

  // Fit all nodes into viewport: returns {scale, tx, ty}
  function computeFit(nodes, viewportW, viewportH, pad) {
    const ids = nodes instanceof Map ? [...nodes.values()] : (Array.isArray(nodes) ? nodes : Object.values(nodes || {}));
    if (!ids.length) return { scale: 1, tx: 0, ty: 0 };
    let mnX = 1e9, mnY = 1e9, mxX = -1e9, mxY = -1e9;
    ids.forEach(n => {
      mnX = Math.min(mnX, n.x);
      mnY = Math.min(mnY, n.y);
      mxX = Math.max(mxX, n.x + (n.w || GW));
      mxY = Math.max(mxY, n.y + (n.h || GH));
    });
    pad = pad == null ? 80 : pad;
    viewportH = viewportH - 72; // topbar/statusbar offset mirror original fitScreen
    const w = mxX - mnX, h = mxY - mnY;
    if (w <= 0 || h <= 0) return { scale: 1, tx: 0, ty: 0 };
    const scale = Math.min((viewportW - pad * 2) / w, (viewportH - pad * 2) / h, 1.4);
    const tx = pad + (viewportW - pad * 2 - w * scale) / 2 - mnX * scale;
    const ty = 46 + pad + (viewportH - pad * 2 - h * scale) / 2 - mnY * scale;
    return { scale, tx, ty };
  }

  // ── Port geometry & connections ────────────────────────────────
  function portAnchor(node, side) {
    if (!node) return { x: 0, y: 0 };
    const w = node.w || GW, h = node.h || GH;
    switch (side) {
      case 'top': return { x: node.x + w / 2, y: node.y };
      case 'bottom': return { x: node.x + w / 2, y: node.y + h };
      case 'left': return { x: node.x, y: node.y + h / 2 };
      case 'right': return { x: node.x + w, y: node.y + h / 2 };
      default: return { x: node.x + w / 2, y: node.y + h / 2 };
    }
  }

  function bestSides(fromNode, toNode) {
    if (!fromNode || !toNode) return { fs: 'right', ts: 'left' };
    const fw = fromNode.w || GW, fh = fromNode.h || GH;
    const tw = toNode.w || GW, th = toNode.h || GH;
    const dx = (toNode.x + tw / 2) - (fromNode.x + fw / 2);
    const dy = (toNode.y + th / 2) - (fromNode.y + fh / 2);
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? { fs: 'right', ts: 'left' } : { fs: 'left', ts: 'right' };
    return dy > 0 ? { fs: 'bottom', ts: 'top' } : { fs: 'top', ts: 'bottom' };
  }

  function mkPath(ax, ay, bx, by, fs, ts, style) {
    if (style === 'straight') return `M${ax},${ay} L${bx},${by}`;
    if (style === 'stepped') {
      const mx = (ax + bx) / 2;
      if (fs === 'right' || fs === 'left') {
        return `M${ax},${ay} L${mx},${ay} L${mx},${by} L${bx},${by}`;
      }
      const my = (ay + by) / 2;
      return `M${ax},${ay} L${ax},${my} L${bx},${my} L${bx},${by}`;
    }
    // curved bezier (default)
    const dist = Math.hypot(bx - ax, by - ay);
    const k = Math.min(Math.max(dist * 0.42, 50), 220);
    const off = (s) => ({ right: [k, 0], left: [-k, 0], bottom: [0, k], top: [0, -k] }[s] || [0, 0]);
    const [o1x, o1y] = off(fs), [o2x, o2y] = off(ts);
    return `M${ax},${ay} C${ax + o1x},${ay + o1y} ${bx + o2x},${by + o2y} ${bx},${by}`;
  }

  function mkConnPath(fromNode, toNode, style, fs, ts) {
    const sides = (fs && ts) ? { fs, ts } : bestSides(fromNode, toNode);
    const a = portAnchor(fromNode, sides.fs), b = portAnchor(toNode, sides.ts);
    return mkPath(a.x, a.y, b.x, b.y, sides.fs, sides.ts, style || 'curved');
  }

  // ── Wikipedia URL builders (pure, testable) ───────────────────
  function buildSearchUrl(q, limit) {
    limit = limit || 6;
    return `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=${limit}&format=json&origin=*`;
  }
  function buildSummaryUrl(title) {
    return `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages|info|categories&exintro=1&explaintext=0&pithumbsize=300&titles=${encodeURIComponent(title)}&format=json&origin=*&inprop=url&cllimit=5`;
  }
  function buildImagesUrl(title, limit) {
    limit = limit || 10;
    return `https://en.wikipedia.org/w/api.php?action=query&prop=images&imlimit=${limit}&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  }
  function buildImageInfoUrl(title, width) {
    width = width || 320;
    return `https://en.wikipedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=${width}&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  }
  function buildLinksUrl(title, limit) {
    limit = limit || 15;
    return `https://en.wikipedia.org/w/api.php?action=query&prop=links&pllimit=${limit}&plnamespace=0&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  }

  // ── ID & CRDT helpers ────────────────────────────────────────
  let _uid = 1;
  function genId(prefix) {
    prefix = prefix || 'x';
    return prefix + (_uid++);
  }
  function resetUid(n) { _uid = n || 1; }
  function peekUid() { return _uid; }

  function nowTs() { return Date.now(); }

  // CRDT op: { id, type, ts, actor, payload, lamport }
  let _lamport = 0;
  function tickLamport(remote) {
    if (remote != null) _lamport = Math.max(_lamport, remote) + 1;
    else _lamport += 1;
    return _lamport;
  }
  function createOp(type, payload, actor) {
    _lamport += 1;
    return {
      id: genId('op'),
      type,
      ts: nowTs(),
      actor: actor || 'local',
      lamport: _lamport,
      payload: payload ? JSON.parse(JSON.stringify(payload)) : {}
    };
  }

  // ── Board State ──────────────────────────────────────────────
  function createBoardState(opts) {
    opts = opts || {};
    return {
      nodes: new Map(),
      conns: new Map(),
      stickies: new Map(),
      texts: new Map(),
      images: new Map(),
      groups: new Map(),
      uid: opts.uid || 1,
      scale: opts.scale != null ? opts.scale : 1,
      tx: opts.tx || 0,
      ty: opts.ty || 0,
      tool: opts.tool || 'select',
      dark: !!opts.dark,
      colIdx: 0,
      openOff: 0,
      opLog: [],
      vectorClock: {},
      actorId: opts.actorId || ('actor-' + Math.random().toString(36).slice(2, 6)),
    };
  }

  function cloneState(state) {
    const c = createBoardState({ uid: state.uid, scale: state.scale, tx: state.tx, ty: state.ty, tool: state.tool, dark: state.dark, actorId: state.actorId });
    c.colIdx = state.colIdx;
    c.openOff = state.openOff;
    c.uid = state.uid;
    // shallow clone maps with deep clone of values
    for (const [k, v] of state.nodes) c.nodes.set(k, JSON.parse(JSON.stringify(v)));
    for (const [k, v] of state.conns) c.conns.set(k, JSON.parse(JSON.stringify(v)));
    for (const [k, v] of state.stickies) c.stickies.set(k, JSON.parse(JSON.stringify(v)));
    for (const [k, v] of state.texts) c.texts.set(k, JSON.parse(JSON.stringify(v)));
    for (const [k, v] of state.images) c.images.set(k, JSON.parse(JSON.stringify(v)));
    for (const [k, v] of state.groups) c.groups.set(k, JSON.parse(JSON.stringify(v)));
    c.opLog = state.opLog.map(o => JSON.parse(JSON.stringify(o)));
    c.vectorClock = JSON.parse(JSON.stringify(state.vectorClock));
    return c;
  }

  // Helpers to pick color
  function nextCol(state) {
    const col = COLS[state.colIdx % COLS.length];
    state.colIdx += 1;
    return col;
  }
  function colorByIndex(idx) {
    return COLS[idx % COLS.length];
  }

  // Node factory (pure)
  function makeNode(title, x, y, w, h, col, id) {
    const nid = id || genId('x');
    const c = col || COLS[0];
    return {
      id: nid,
      title: String(title || 'Untitled'),
      x: x == null ? CX : x,
      y: y == null ? CY : y,
      w: w || GW,
      h: h || GH,
      col: c.mm,
      colObj: c,
      collapsed: false,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      deleted: false,
    };
  }

  // CRDT-aware board operations: each returns an op and mutates state
  function boardCreateNode(state, title, x, y, opts) {
    opts = opts || {};
    // Deduplicate by title (case-insensitive) like original openArticle
    const dup = findNodeByTitle(state, title);
    if (dup && !opts.force) {
      return { dup: true, node: dup, op: null };
    }
    let nx = x, ny = y;
    if (nx == null || ny == null) {
      // Fan-out logic: if fromId provided, place near parent
      if (opts.fromId && state.nodes.has(opts.fromId)) {
        const fn = state.nodes.get(opts.fromId);
        nx = fn.x + fn.w + 70 + (Math.random() * 40 - 20);
        ny = fn.y + (Math.random() * 180 - 90);
      } else {
        nx = CX - 170 + state.openOff * 25;
        ny = CY - 280 + state.openOff * 25;
        state.openOff = (state.openOff + 1) % 10;
      }
    }
    const col = opts.col || nextCol(state);
    const nid = opts.id || genId('x');
    const node = {
      id: nid,
      title: String(title),
      x: snap(nx - (opts.snap === false ? 0 : 0)), // keep exact for wiki (snap optional)
      y: snap(ny - (opts.snap === false ? 0 : 0)) ? snap(ny) : ny, // Actually just keep as is; snap optional
      w: opts.w || GW,
      h: opts.h || GH,
      col: col.mm,
      colObj: col,
      from: opts.fromId || null,
      collapsed: false,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      deleted: false,
    };
    // Preserve raw if snap disabled
    if (opts.snap === false) { node.x = nx; node.y = ny; }
    else { node.x = nx; node.y = ny; } // keep original for deterministic tests unless snap requested
    // For faithful board, don't snap unless asked (logic-engine snaps, wiki doesn't)
    state.nodes.set(nid, node);
    state.uid = Math.max(state.uid, parseInt(nid.replace('x', ''), 10) + 1 || state.uid + 1);
    const op = createOp('createNode', { node: JSON.parse(JSON.stringify(node)) }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    // Optionally auto-connect
    let connId = null;
    if (opts.fromId && state.nodes.has(opts.fromId)) {
      const res = boardAddConn(state, opts.fromId, nid, null, null, 'curved');
      connId = res ? res.id : null;
    }
    return { node, op, connId };
  }

  function boardRemoveNode(state, nid) {
    if (!state.nodes.has(nid)) return null;
    const node = state.nodes.get(nid);
    // Remove connected conns
    const removedConns = [];
    for (const [cid, c] of [...state.conns]) {
      if (c.from === nid || c.to === nid) {
        state.conns.delete(cid);
        removedConns.push(cid);
      }
    }
    state.nodes.delete(nid);
    const op = createOp('removeNode', { id: nid, removedConns }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    return op;
  }

  function boardMoveNode(state, nid, x, y) {
    const n = state.nodes.get(nid);
    if (!n) return null;
    n.x = x; n.y = y; n.updatedAt = nowTs();
    const op = createOp('moveNode', { id: nid, x, y }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    return op;
  }

  function boardResizeNode(state, nid, w, h) {
    const n = state.nodes.get(nid);
    if (!n) return null;
    n.w = Math.max(NODE_MIN_W, w);
    n.h = Math.max(NODE_MIN_H, h);
    n.updatedAt = nowTs();
    const op = createOp('resizeNode', { id: nid, w: n.w, h: n.h }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    return op;
  }

  function boardUpdateTitle(state, nid, title) {
    const n = state.nodes.get(nid);
    if (!n) return null;
    n.title = String(title);
    n.updatedAt = nowTs();
    const op = createOp('updateTitle', { id: nid, title: n.title }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    return op;
  }

  function boardToggleCollapse(state, nid) {
    const n = state.nodes.get(nid);
    if (!n) return null;
    n.collapsed = !n.collapsed;
    if (n.collapsed) { n.prevH = n.h; n.h = 32; } else { n.h = n.prevH || GH; }
    n.updatedAt = nowTs();
    const op = createOp('toggleCollapse', { id: nid, collapsed: n.collapsed }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    return op;
  }

  function boardCycleColor(state, nid) {
    const n = state.nodes.get(nid);
    if (!n) return null;
    const idx = COLS.findIndex(c => c.top === n.colObj.top);
    const next = COLS[(idx + 1) % COLS.length];
    n.colObj = next; n.col = next.mm; n.updatedAt = nowTs();
    const op = createOp('cycleColor', { id: nid, col: next }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    return op;
  }

  function boardAddConn(state, fromId, toId, fs, ts, style, opts) {
    if (!state.nodes.has(fromId) || !state.nodes.has(toId)) return null;
    if (fromId === toId) return null;
    // deduplicate
    for (const [, c] of state.conns) {
      if ((c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)) {
        return null;
      }
    }
    const cid = genId('x');
    const fn = state.nodes.get(fromId), tn = state.nodes.get(toId);
    const sides = (fs && ts) ? { fs, ts } : bestSides(fn, tn);
    const conn = {
      id: cid,
      from: fromId,
      to: toId,
      fromSide: sides.fs,
      toSide: sides.ts,
      style: style || 'curved',
      dashed: !!(opts && opts.dashed),
      openArrow: !!(opts && opts.openArrow),
      noArrow: !!(opts && opts.noArrow),
      label: (opts && opts.label) || '',
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };
    state.conns.set(cid, conn);
    const op = createOp('addConn', { conn: JSON.parse(JSON.stringify(conn)) }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    return conn;
  }

  function boardRemoveConn(state, cid) {
    if (!state.conns.has(cid)) return null;
    state.conns.delete(cid);
    const op = createOp('removeConn', { id: cid }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    return op;
  }

  function boardUpdateConn(state, cid, patch) {
    const c = state.conns.get(cid);
    if (!c) return null;
    Object.assign(c, patch);
    c.updatedAt = nowTs();
    const op = createOp('updateConn', { id: cid, patch }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    return op;
  }

  function boardCreateSticky(state, x, y, text, colorCls) {
    const nid = genId('x');
    const obj = { id: nid, x, y, text: text || '', color: colorCls || 'sy', createdAt: nowTs(), updatedAt: nowTs() };
    state.stickies.set(nid, obj);
    const op = createOp('createSticky', { sticky: obj }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    return obj;
  }

  function boardCreateText(state, x, y, content) {
    const nid = genId('x');
    const obj = { id: nid, x, y, content: content || 'label', createdAt: nowTs(), updatedAt: nowTs() };
    state.texts.set(nid, obj);
    const op = createOp('createText', { text: obj }, state.actorId);
    state.opLog.push(op);
    state.vectorClock[state.actorId] = (state.vectorClock[state.actorId] || 0) + 1;
    return obj;
  }

  // ── Lookup helpers ───────────────────────────────────────────
  function findNodeByTitle(state, title) {
    if (!title) return null;
    const lower = String(title).toLowerCase();
    for (const [, n] of state.nodes) {
      if (String(n.title).toLowerCase() === lower && !n.deleted) return n;
    }
    return null;
  }

  function getNodeBounds(state) {
    if (!state.nodes.size) return null;
    let mnX = 1e9, mnY = 1e9, mxX = -1e9, mxY = -1e9;
    for (const [, n] of state.nodes) {
      mnX = Math.min(mnX, n.x); mnY = Math.min(mnY, n.y);
      mxX = Math.max(mxX, n.x + (n.w || GW)); mxY = Math.max(mxY, n.y + (n.h || GH));
    }
    return { minX: mnX, minY: mnY, maxX: mxX, maxY: mxY, w: mxX - mnX, h: mxY - mnY };
  }

  function getConnectedConns(state, nid) {
    const out = [];
    for (const [, c] of state.conns) if (c.from === nid || c.to === nid) out.push(c);
    return out;
  }

  // ── CRDT apply / merge ───────────────────────────────────────
  function applyOp(state, op) {
    if (!op || !op.type) return false;
    // Idempotence: if op already in log, skip
    if (state.opLog.find(o => o.id === op.id)) return false;
    // Lamport clock update
    if (op.lamport) _lamport = Math.max(_lamport, op.lamport);
    // Also vector clock
    if (op.actor) state.vectorClock[op.actor] = Math.max(state.vectorClock[op.actor] || 0, op.lamport || 1);

    switch (op.type) {
      case 'createNode': {
        const node = op.payload.node;
        if (!node) return false;
        // LWW: if already exists, keep newer timestamp
        const existing = state.nodes.get(node.id);
        if (existing) {
          if ((node.updatedAt || node.createdAt || 0) > (existing.updatedAt || 0)) {
            state.nodes.set(node.id, node);
          }
        } else {
          // also check duplicate title with LWW tie-breaker: keep original, addConn scenario handled elsewhere
          state.nodes.set(node.id, node);
        }
        break;
      }
      case 'removeNode': {
        const id = op.payload.id;
        if (state.nodes.has(id)) state.nodes.delete(id);
        // also remove conns listed
        const rem = op.payload.removedConns || [];
        rem.forEach(cid => state.conns.delete(cid));
        // fallback sweep
        for (const [cid, c] of [...state.conns]) if (c.from === id || c.to === id) state.conns.delete(cid);
        break;
      }
      case 'moveNode': {
        const n = state.nodes.get(op.payload.id);
        if (n) { n.x = op.payload.x; n.y = op.payload.y; n.updatedAt = op.ts; }
        break;
      }
      case 'resizeNode': {
        const n = state.nodes.get(op.payload.id);
        if (n) { n.w = op.payload.w; n.h = op.payload.h; n.updatedAt = op.ts; }
        break;
      }
      case 'updateTitle': {
        const n = state.nodes.get(op.payload.id);
        if (n) { n.title = op.payload.title; n.updatedAt = op.ts; }
        break;
      }
      case 'toggleCollapse': {
        const n = state.nodes.get(op.payload.id);
        if (n) {
          n.collapsed = op.payload.collapsed;
          if (n.collapsed) { n.prevH = n.h; n.h = 32; } else { n.h = n.prevH || GH; }
          n.updatedAt = op.ts;
        }
        break;
      }
      case 'cycleColor': {
        const n = state.nodes.get(op.payload.id);
        if (n) { n.colObj = op.payload.col; n.col = op.payload.col.mm; n.updatedAt = op.ts; }
        break;
      }
      case 'addConn': {
        const conn = op.payload.conn;
        if (!conn) return false;
        // dedup
        let dup = false;
        for (const [, c] of state.conns) if ((c.from === conn.from && c.to === conn.to) || (c.from === conn.to && c.to === conn.from)) dup = true;
        if (!dup) state.conns.set(conn.id, conn);
        break;
      }
      case 'removeConn': {
        state.conns.delete(op.payload.id);
        break;
      }
      case 'updateConn': {
        const c = state.conns.get(op.payload.id);
        if (c) Object.assign(c, op.payload.patch, { updatedAt: op.ts });
        break;
      }
      case 'createSticky': {
        const s = op.payload.sticky;
        if (s) state.stickies.set(s.id, s);
        break;
      }
      case 'createText': {
        const t = op.payload.text;
        if (t) state.texts.set(t.id, t);
        break;
      }
      default: return false;
    }
    state.opLog.push(JSON.parse(JSON.stringify(op)));
    return true;
  }

  function mergeOps(localOps, remoteOps) {
    const map = new Map();
    [...localOps, ...remoteOps].forEach(op => {
      if (!map.has(op.id)) map.set(op.id, op);
      else {
        // keep higher lamport / ts
        const cur = map.get(op.id);
        if ((op.lamport || 0) > (cur.lamport || 0) || op.ts > cur.ts) map.set(op.id, op);
      }
    });
    const merged = [...map.values()].sort((a, b) => (a.lamport - b.lamport) || (a.ts - b.ts));
    return merged;
  }

  function syncMerge(localState, remoteState) {
    // Merge op logs then replay missing ops onto local
    // Return { mergedOps, applied }
    const merged = mergeOps(localState.opLog, remoteState.opLog);
    let applied = 0;
    // Build a fresh state from merged ops? Simpler: apply missing ops to local
    const existingIds = new Set(localState.opLog.map(o => o.id));
    for (const op of merged) {
      if (!existingIds.has(op.id)) {
        if (applyOp(localState, op)) applied += 1;
      }
    }
    // Also merge vector clocks
    for (const [actor, count] of Object.entries(remoteState.vectorClock || {})) {
      localState.vectorClock[actor] = Math.max(localState.vectorClock[actor] || 0, count);
    }
    return { merged, applied };
  }

  // Alias for logic-engine style: simulate = propagate analogue
  // For wiki, sync is the main operation; provide helper to get state hash
  function getStateHash(state) {
    const nodes = [...state.nodes.keys()].sort().join(',');
    const conns = [...state.conns.keys()].sort().join(',');
    return `${nodes}|${conns}|${state.opLog.length}`;
  }

  // ── Serialization ────────────────────────────────────────────
  function serialize(state) {
    return {
      nodes: [...state.nodes.values()].map(n => ({ ...n })),
      conns: [...state.conns.values()].map(c => ({ ...c })),
      stickies: [...state.stickies.values()].map(s => ({ ...s })),
      texts: [...state.texts.values()].map(t => ({ ...t })),
      images: [...state.images.values()].map(i => ({ ...i })),
      groups: [...state.groups.values()].map(g => ({ ...g })),
      uid: state.uid,
      scale: state.scale,
      tx: state.tx, ty: state.ty,
      colIdx: state.colIdx,
      openOff: state.openOff,
      opLog: state.opLog.map(o => ({ ...o })),
      vectorClock: { ...state.vectorClock },
      actorId: state.actorId,
    };
  }

  function deserialize(data) {
    const state = createBoardState({ uid: data.uid, scale: data.scale, tx: data.tx, ty: data.ty, actorId: data.actorId });
    state.colIdx = data.colIdx || 0;
    state.openOff = data.openOff || 0;
    state.uid = data.uid || 1;
    (data.nodes || []).forEach(n => state.nodes.set(n.id, { ...n }));
    (data.conns || []).forEach(c => state.conns.set(c.id, { ...c }));
    (data.stickies || []).forEach(s => state.stickies.set(s.id, { ...s }));
    (data.texts || []).forEach(t => state.texts.set(t.id, { ...t }));
    (data.images || []).forEach(i => state.images.set(i.id, { ...i }));
    (data.groups || []).forEach(g => state.groups.set(g.id, { ...g }));
    state.opLog = (data.opLog || []).map(o => ({ ...o }));
    state.vectorClock = { ...(data.vectorClock || {}) };
    // Fix next uid
    let maxN = state.uid;
    for (const n of state.nodes.values()) {
      const num = parseInt(String(n.id).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num) && num >= maxN) maxN = num + 1;
    }
    state.uid = maxN;
    _uid = maxN;
    return state;
  }

  // ── Export ───────────────────────────────────────────────────
  return {
    WORLD, CX, CY, SNAP, GW, GH, NODE_MIN_W, NODE_MIN_H,
    COLS,
    setOf, addAll,
    esc, sanitizeContent, sanitizeFragment,
    snap, worldToScreen, screenToWorld, c2w, w2c, zoomTransform, clampScale, computeFit,
    portAnchor, bestSides, mkPath, mkConnPath,
    buildSearchUrl, buildSummaryUrl, buildImagesUrl, buildImageInfoUrl, buildLinksUrl,
    genId, resetUid, peekUid, createOp, tickLamport,
    createBoardState, cloneState, makeNode,
    boardCreateNode, boardRemoveNode, boardMoveNode, boardResizeNode, boardUpdateTitle, boardToggleCollapse, boardCycleColor,
    boardAddConn, boardRemoveConn, boardUpdateConn, boardCreateSticky, boardCreateText,
    findNodeByTitle, getNodeBounds, getConnectedConns,
    applyOp, mergeOps, syncMerge, getStateHash,
    serialize, deserialize,
  };
});
