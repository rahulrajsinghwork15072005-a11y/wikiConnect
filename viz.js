(function (root, factory) {
  const api = factory();
  if (typeof self !== 'undefined') self.Viz = api;
  if (typeof window !== 'undefined') window.Viz = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this, function () {
  'use strict';

  // ── XSS-safe escape ──────────────────────────────────────────
  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // ── Node SVG (standalone, XSS-safe) ──────────────────────────
  function buildNodeSVG(node, opts) {
    opts = opts || {};
    if (!node) return '<svg></svg>';
    const w = node.w || 340, h = node.h || 360;
    const col = (node.colObj && node.colObj.top) || 'rgba(37,99,235,0.4)';
    const title = esc(node.title || 'Untitled');
    const selected = !!node.selected || !!opts.selected;
    const collapsed = !!node.collapsed;
    const displayH = collapsed ? 32 : h;
    const excerpt = esc((node.excerpt || '').substring(0, 140));
    const borderColor = selected ? '#2563eb' : col;
    const borderW = selected ? 2.5 : 1;
    const glow = selected ? '<rect x="-4" y="-4" width="' + (w + 8) + '" height="' + (displayH + 8) + '" fill="rgba(37,99,235,0.08)" rx="6"/>' : '';
    let bodyHtml = '';
    if (!collapsed) {
      bodyHtml = `<foreignObject x="0" y="24" width="${w}" height="${displayH - 48}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Georgia,serif;font-size:11px;line-height:1.5;color:#4a4540;padding:8px 10px;overflow:hidden;">${excerpt || '<span style=&quot;color:#bab3aa&quot;>no excerpt</span>'}</div></foreignObject>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 12}" height="${displayH + 12}" viewBox="-6 -6 ${w + 12} ${displayH + 12}">
      <rect x="3" y="3" width="${w}" height="${displayH}" fill="rgba(0,0,0,0.08)" rx="8"/>
      ${glow}
      <rect x="0" y="0" width="${w}" height="${displayH}" fill="#fff" stroke="${esc(borderColor)}" stroke-width="${borderW}" rx="8"/>
      <rect x="0" y="0" width="${w}" height="24" fill="#f0ede6" rx="8"/>
      <rect x="0" y="16" width="${w}" height="8" fill="#f0ede6"/>
      <text x="10" y="16" font-family="Georgia,serif" font-size="11" font-weight="500" fill="#1a1814">${title}</text>
      ${bodyHtml}
      <rect x="0" y="${displayH - 20}" width="${w}" height="20" fill="#f0ede6" rx="0"/>
      <rect x="0" y="${displayH - 20}" width="${w}" height="20" fill="#f0ede6" rx="0" ry="0"/>
      <text x="8" y="${displayH - 7}" font-family="monospace" font-size="8" fill="#bab3aa">wikipedia</text>
    </svg>`;
  }

  // ── Sticky SVG ───────────────────────────────────────────────
  function buildStickySVG(sticky, opts) {
    if (!sticky) return '';
    const w = sticky.w || 160, h = sticky.h || 110;
    const colorMap = { sy: '#fef08a', sb: '#bfdbfe', sg: '#bbf7d0', sp: '#e9d5ff', so: '#fed7aa' };
    const bg = colorMap[sticky.color] || colorMap.sy;
    const text = esc((sticky.text || '').substring(0, 200));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 8}" height="${h + 8}" viewBox="-4 -4 ${w + 8} ${h + 8}">
      <rect x="2" y="2" width="${w}" height="${h}" fill="rgba(0,0,0,0.12)" rx="3"/>
      <rect x="0" y="0" width="${w}" height="${h}" fill="${esc(bg)}" stroke="rgba(0,0,0,0.08)" stroke-width="1" rx="3"/>
      <rect x="0" y="0" width="${w}" height="18" fill="rgba(0,0,0,0.07)" rx="3"/>
      <foreignObject x="6" y="22" width="${w - 12}" height="${h - 26}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Georgia,serif;font-size:12px;line-height:1.4;color:rgba(0,0,0,0.72);">${text || 'note…'}</div></foreignObject>
    </svg>`;
  }

  // ── Connection SVG ───────────────────────────────────────────
  function buildConnectionSVG(conn, fromNode, toNode, opts) {
    if (!conn || !fromNode || !toNode) return '';
    opts = opts || {};
    const style = conn.style || 'curved';
    const dashed = !!conn.dashed;
    const selected = !!opts.selected || !!conn.selected;
    const color = selected ? '#2563eb' : '#8a837a';
    const w = selected ? 2.5 : 1.6;
    const dash = dashed ? 'stroke-dasharray:7 4;' : '';
    // Compute anchors
    function anchor(n, side) {
      const ww = n.w || 340, hh = n.h || 360;
      switch (side) {
        case 'top': return { x: n.x + ww / 2, y: n.y };
        case 'bottom': return { x: n.x + ww / 2, y: n.y + hh };
        case 'left': return { x: n.x, y: n.y + hh / 2 };
        case 'right': return { x: n.x + ww, y: n.y + hh / 2 };
        default: return { x: n.x + ww / 2, y: n.y + hh / 2 };
      }
    }
    function best(a, b) {
      const aw = a.w || 340, ah = a.h || 360, bw = b.w || 340, bh = b.h || 360;
      const dx = (b.x + bw / 2) - (a.x + aw / 2), dy = (b.y + bh / 2) - (a.y + ah / 2);
      if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? { fs: 'right', ts: 'left' } : { fs: 'left', ts: 'right' };
      return dy > 0 ? { fs: 'bottom', ts: 'top' } : { fs: 'top', ts: 'bottom' };
    }
    const sides = (conn.fromSide && conn.toSide) ? { fs: conn.fromSide, ts: conn.toSide } : best(fromNode, toNode);
    const a = anchor(fromNode, sides.fs), b = anchor(toNode, sides.ts);
    let d = '';
    if (style === 'straight') d = `M${a.x},${a.y} L${b.x},${b.y}`;
    else if (style === 'stepped') {
      const mx = (a.x + b.x) / 2;
      if (sides.fs === 'right' || sides.fs === 'left') d = `M${a.x},${a.y} L${mx},${a.y} L${mx},${b.y} L${b.x},${b.y}`;
      else { const my = (a.y + b.y) / 2; d = `M${a.x},${a.y} L${a.x},${my} L${b.x},${my} L${b.x},${b.y}`; }
    } else {
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const k = Math.min(Math.max(dist * 0.42, 50), 220);
      const off = (s) => ({ right: [k, 0], left: [-k, 0], bottom: [0, k], top: [0, -k] }[s] || [0, 0]);
      const [o1x, o1y] = off(sides.fs), [o2x, o2y] = off(sides.ts);
      d = `M${a.x},${a.y} C${a.x + o1x},${a.y + o1y} ${b.x + o2x},${b.y + o2y} ${b.x},${b.y}`;
    }
    const marker = conn.noArrow ? '' : conn.openArrow ? (selected ? 'url(#arr-open-sel)' : 'url(#arr-open)') : (selected ? 'url(#arr-sel)' : 'url(#arr)');
    const label = conn.label ? `<text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2}" text-anchor="middle" font-family="monospace" font-size="10" fill="#8a837a">${esc(conn.label)}</text>` : '';
    return `<g><path d="${esc(d)}" fill="none" stroke="${esc(color)}" stroke-width="${w}" style="${esc(dash)}" ${marker ? `marker-end="${esc(marker)}"` : ''}/>${label}</g>`;
  }

  // ── Full board SVG (nodes + conns, XSS-safe) ─────────────────
  function buildBoardSVG(board, opts) {
    opts = opts || {};
    // board can be Map of nodes + conns or plain object {nodes, conns}
    let nodes = [], conns = [];
    if (board && board.nodes instanceof Map) {
      nodes = [...board.nodes.values()];
      conns = board.conns instanceof Map ? [...board.conns.values()] : (board.conns || []);
    } else if (board && Array.isArray(board.nodes)) {
      nodes = board.nodes;
      conns = board.conns || [];
    } else if (board && typeof board === 'object' && board.nodes && typeof board.nodes === 'object' && !(board.nodes instanceof Map)) {
      nodes = Object.values(board.nodes);
      conns = board.conns ? Object.values(board.conns) : [];
    } else if (Array.isArray(board)) {
      nodes = board;
    }

    if (!nodes.length && !conns.length) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340" viewBox="0 0 600 340"><rect width="100%" height="100%" fill="#f7f5f0"/><text x="50%" y="50%" text-anchor="middle" font-family="monospace" fill="#bab3aa" font-size="11">empty board — search Wikipedia to add articles</text></svg>';
    }
    // Compute bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      const w = n.w || 340, h = n.h || 360;
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
    });
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 600; maxY = 340; }
    const pad = 60;
    const width = Math.max(640, (maxX - minX) + pad * 2);
    const height = Math.max(380, (maxY - minY) + pad * 2);
    const offX = -minX + pad, offY = -minY + pad;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#f7f5f0;border-radius:12px;">`;
    svg += `<defs>
      <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M1,1 L1,7 L8,4 z" fill="#8a837a"/></marker>
      <marker id="arr-sel" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M1,1 L1,7 L8,4 z" fill="#2563eb"/></marker>
      <marker id="arr-open" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M2,2 L6,4 L2,6" fill="none" stroke="#8a837a" stroke-width="1"/></marker>
      <marker id="arr-open-sel" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M2,2 L6,4 L2,6" fill="none" stroke="#2563eb" stroke-width="1"/></marker>
    </defs>`;
    svg += `<rect width="100%" height="100%" fill="#f7f5f0"/>`;
    // dot grid
    svg += `<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(26,24,20,0.12)"/></pattern><rect width="100%" height="100%" fill="url(#dots)"/>`;
    // Connections behind nodes
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    conns.forEach(c => {
      const fn = nodeMap.get(c.from), tn = nodeMap.get(c.to);
      if (!fn || !tn) return;
      // shift coords by off
      const fn2 = { ...fn, x: fn.x + offX, y: fn.y + offY };
      const tn2 = { ...tn, x: tn.x + offX, y: tn.y + offY };
      const c2 = { ...c };
      // Temporarily use shifted nodes for path calc then shift path? Simpler: use buildConnectionSVG with shifted nodes
      const col = c.selected ? '#2563eb' : '#8a837a';
      const sw = c.selected ? 2.5 : 1.6;
      const dash = c.dashed ? 'stroke-dasharray:7 4;' : '';
      function anchor(n, side) {
        const ww = n.w || 340, hh = (n.collapsed ? 32 : (n.h || 360));
        switch (side) {
          case 'top': return { x: n.x + ww / 2, y: n.y };
          case 'bottom': return { x: n.x + ww / 2, y: n.y + hh };
          case 'left': return { x: n.x, y: n.y + hh / 2 };
          case 'right': return { x: n.x + ww, y: n.y + hh / 2 };
          default: return { x: n.x + ww / 2, y: n.y + hh / 2 };
        }
      }
      function best(a, b) {
        const aw = a.w || 340, ah = a.h || 360, bw = b.w || 340, bh = b.h || 360;
        const dx = (b.x + bw / 2) - (a.x + aw / 2), dy = (b.y + bh / 2) - (a.y + ah / 2);
        if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? { fs: 'right', ts: 'left' } : { fs: 'left', ts: 'right' };
        return dy > 0 ? { fs: 'bottom', ts: 'top' } : { fs: 'top', ts: 'bottom' };
      }
      const sides = (c.fromSide && c.toSide) ? { fs: c.fromSide, ts: c.toSide } : best(fn2, tn2);
      const a = anchor(fn2, sides.fs), b = anchor(tn2, sides.ts);
      let d = '';
      const style = c.style || 'curved';
      if (style === 'straight') d = `M${a.x},${a.y} L${b.x},${b.y}`;
      else if (style === 'stepped') {
        const mx = (a.x + b.x) / 2;
        if (sides.fs === 'right' || sides.fs === 'left') d = `M${a.x},${a.y} L${mx},${a.y} L${mx},${b.y} L${b.x},${b.y}`;
        else { const my = (a.y + b.y) / 2; d = `M${a.x},${a.y} L${a.x},${my} L${b.x},${my} L${b.x},${b.y}`; }
      } else {
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const k = Math.min(Math.max(dist * 0.42, 50), 220);
        const off = (s) => ({ right: [k, 0], left: [-k, 0], bottom: [0, k], top: [0, -k] }[s] || [0, 0]);
        const [o1x, o1y] = off(sides.fs), [o2x, o2y] = off(sides.ts);
        d = `M${a.x},${a.y} C${a.x + o1x},${a.y + o1y} ${b.x + o2x},${b.y + o2y} ${b.x},${b.y}`;
      }
      const marker = c.noArrow ? '' : c.openArrow ? (c.selected ? 'url(#arr-open-sel)' : 'url(#arr-open)') : (c.selected ? 'url(#arr-sel)' : 'url(#arr)');
      svg += `<path d="${esc(d)}" fill="none" stroke="${esc(col)}" stroke-width="${sw}" style="${esc(dash)}" ${marker ? `marker-end="${esc(marker)}"` : ''}/>`;
      if (c.label) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const lb = c.label.length * 5.5 + 8;
        svg += `<rect x="${mx - lb / 2}" y="${my - 8}" width="${lb}" height="16" fill="#f7f5f0" stroke="rgba(26,24,20,0.17)" stroke-width="0.5" rx="3"/>`;
        svg += `<text x="${mx}" y="${my + 1}" text-anchor="middle" font-family="monospace" font-size="10" fill="#8a837a">${esc(c.label)}</text>`;
      }
    });
    // Nodes
    nodes.forEach(n => {
      const x = n.x + offX, y = n.y + offY;
      const w = n.w || 340, h = n.collapsed ? 32 : (n.h || 360);
      const col = (n.colObj && n.colObj.top) || 'rgba(37,99,235,0.4)';
      const title = esc(n.title || 'Untitled');
      const excerpt = esc((n.excerpt || n.title || '').substring(0, 90));
      const sel = !!n.selected;
      const stroke = sel ? '#2563eb' : col;
      const sw2 = sel ? 2.5 : 1.5;
      svg += `<g transform="translate(${x},${y})">`;
      if (sel) svg += `<rect x="-3" y="-3" width="${w + 6}" height="${h + 6}" fill="rgba(37,99,235,0.08)" rx="10"/>`;
      svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="#fff" stroke="${esc(stroke)}" stroke-width="${sw2}" rx="8"/>`;
      svg += `<rect x="0" y="0" width="${w}" height="24" fill="#f0ede6" rx="8"/><rect x="0" y="16" width="${w}" height="8" fill="#f0ede6"/>`;
      svg += `<text x="10" y="16" font-family="Georgia,serif" font-size="11" font-weight="500" fill="#1a1814">${title}</text>`;
      if (!n.collapsed) {
        svg += `<text x="10" y="44" font-family="Georgia,serif" font-size="10" fill="#4a4540">${excerpt}</text>`;
        svg += `<rect x="0" y="${h - 22}" width="${w}" height="22" fill="#f0ede6" rx="0"/><rect x="0" y="${h - 22}" width="${w}" height="22" fill="#f0ede6" rx="0"/>`;
        svg += `<text x="8" y="${h - 8}" font-family="monospace" font-size="8" fill="#bab3aa">wikipedia</text>`;
      }
      // ports dots
      const ports = [{ x: w / 2, y: -4 }, { x: w / 2, y: h + 4 }, { x: -4, y: h / 2 }, { x: w + 4, y: h / 2 }];
      ports.forEach(p => { svg += `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#fff" stroke="#8a837a" stroke-width="1.2"/>`; });
      svg += `</g>`;
    });
    svg += `<text x="18" y="${height - 10}" font-family="monospace" font-size="10" fill="#8a7a60">✦ ${nodes.length} articles · ${conns.length} connections · WikiBoard</text>`;
    svg += `</svg>`;
    return svg;
  }

  function renderBoard(container, board, opts) {
    if (!container) return;
    if (!board) { container.innerHTML = '<p style="color:#888;font-family:monospace">No board</p>'; return; }
    container.innerHTML = buildBoardSVG(board, opts);
  }

  // Compatibility aliases (mirrors Logic Forge)
  function buildAutomatonSVG(a, b) { return buildBoardSVG(a, b); }
  function renderAutomaton(c, a, b) { renderBoard(c, a, b); }
  function buildCircuitSVG(c, w) { return buildBoardSVG(c, w); }
  function renderCircuit(c, a, b) { renderBoard(c, a, b); }
  function buildGateSVG(n, defs) { return buildNodeSVG(n); }
  function buildWireSVG(f, t, on, sel, pend) {
    // Adapt wire builder to board style: re-use buildConnectionSVG path logic for simple line
    if (!f || !t) return '';
    const col = pend ? 'rgba(37,99,235,0.4)' : on ? '#2563eb' : '#8a837a';
    const width = on ? 2.5 : 1.5;
    const d = `M ${f.x} ${f.y} C ${f.x + 30} ${f.y}, ${t.x - 30} ${t.y}, ${t.x} ${t.y}`;
    let svg = `<path d="${esc(d)}" fill="none" stroke="${esc(col)}" stroke-width="${width}" style="${pend ? 'stroke-dasharray:5 8;' : ''}"/>`;
    if (!pend) svg += `<circle cx="${f.x}" cy="${f.y}" r="3" fill="${esc(col)}"/><circle cx="${t.x}" cy="${t.y}" r="3" fill="${esc(col)}"/>`;
    return svg;
  }

  // Canvas minimap draw helper (for script.js to call) — returns data for canvas
  function drawMinimapCanvas(canvas, board, viewport) {
    if (!canvas || !board) return;
    const ctx = canvas.getContext('2d');
    const W = 12000, MW = canvas.width, MH = canvas.height;
    ctx.clearRect(0, 0, MW, MH);
    ctx.fillStyle = '#f7f5f0'; ctx.fillRect(0, 0, MW, MH);
    const sx = MW / W, sy = MH / W;
    ctx.fillStyle = 'rgba(26,24,20,.07)';
    for (let i = 0; i < MW; i += 6) for (let j = 0; j < MH; j += 6) ctx.fillRect(i, j, .8, .8);
    // conns
    const nodes = board.nodes instanceof Map ? [...board.nodes.values()] : (Array.isArray(board.nodes) ? board.nodes : Object.values(board.nodes || {}));
    const conns = board.conns instanceof Map ? [...board.conns.values()] : (board.conns || []);
    ctx.strokeStyle = 'rgba(37,99,235,.25)'; ctx.lineWidth = .5;
    conns.forEach(c => {
      const fn = nodes.find(n => n.id === c.from), tn = nodes.find(n => n.id === c.to);
      if (!fn || !tn) return;
      ctx.beginPath(); ctx.moveTo((fn.x + (fn.w || 340) / 2) * sx, (fn.y + (fn.h || 360) / 2) * sy);
      ctx.lineTo((tn.x + (tn.w || 340) / 2) * sx, (tn.y + (tn.h || 360) / 2) * sy); ctx.stroke();
    });
    nodes.forEach(n => {
      ctx.fillStyle = n.col || 'rgba(37,99,235,.15)';
      ctx.strokeStyle = 'rgba(37,99,235,.4)'; ctx.lineWidth = .5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(n.x * sx, n.y * sy, Math.max((n.w || 340) * sx, 3), Math.max((n.h || 360) * sy, 3), 1);
      else ctx.rect(n.x * sx, n.y * sy, Math.max((n.w || 340) * sx, 3), Math.max((n.h || 360) * sy, 3));
      ctx.fill(); ctx.stroke();
    });
    if (viewport) {
      ctx.strokeStyle = 'rgba(26,24,20,.35)'; ctx.lineWidth = 1;
      ctx.strokeRect(-viewport.tx / viewport.scale * sx, -viewport.ty / viewport.scale * sy, viewport.vw / viewport.scale * sx, viewport.vh / viewport.scale * sy);
    }
  }

  return { esc, buildNodeSVG, buildStickySVG, buildConnectionSVG, buildBoardSVG, renderBoard, buildCircuitSVG, renderCircuit, buildAutomatonSVG, renderAutomaton, buildGateSVG, buildWireSVG, drawMinimapCanvas };
});
