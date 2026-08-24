(function (root, factory) {
  const api = factory();
  if (typeof self !== 'undefined') self.WikiLibrary = api;
  if (typeof window !== 'undefined') window.WikiLibrary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this, function () {
  'use strict';

  // Each board is { name, description, nodes:[{title,x,y,w,h,colIdx}], conns:[{from:{idx},to:{idx},style,label}], stickies, texts }
  // Indices reference nodes order. colIdx maps to WikiEngine COLS.
  const boards = {
    philosophy_map: {
      name: 'Philosophy Knowledge Map',
      description: 'Socrates → Plato → Aristotle → Rationalism → Existentialism — trace the lineage of ideas.',
      nodes: [
        { title: 'Philosophy', x: 5200, y: 5400, w: 340, h: 360, colIdx: 0 },
        { title: 'Socrates', x: 5600, y: 5300, w: 340, h: 360, colIdx: 1 },
        { title: 'Plato', x: 6000, y: 5250, w: 340, h: 360, colIdx: 2 },
        { title: 'Aristotle', x: 6000, y: 5650, w: 340, h: 360, colIdx: 3 },
        { title: 'René Descartes', x: 6400, y: 5400, w: 340, h: 360, colIdx: 4 },
        { title: 'Existentialism', x: 6800, y: 5400, w: 340, h: 360, colIdx: 5 },
      ],
      conns: [
        { from: { idx: 0 }, to: { idx: 1 }, style: 'curved', label: 'founders' },
        { from: { idx: 1 }, to: { idx: 2 }, style: 'curved', label: 'student' },
        { from: { idx: 2 }, to: { idx: 3 }, style: 'curved', label: 'student' },
        { from: { idx: 3 }, to: { idx: 4 }, style: 'curved', label: 'influenced' },
        { from: { idx: 4 }, to: { idx: 5 }, style: 'curved', label: 'precursor' },
      ],
      stickies: [{ x: 5250, y: 5850, text: 'Start here: open Philosophy, then follow "related →"', color: 'sy' }],
    },
    science_overview: {
      name: 'Science Overview',
      description: 'Physics · Chemistry · Biology · Astronomy linked through foundational concepts and methods.',
      nodes: [
        { title: 'Science', x: 5200, y: 5400, w: 340, h: 360, colIdx: 0 },
        { title: 'Physics', x: 5600, y: 5150, w: 340, h: 360, colIdx: 3 },
        { title: 'Chemistry', x: 5600, y: 5550, w: 340, h: 360, colIdx: 2 },
        { title: 'Biology', x: 6000, y: 5350, w: 340, h: 360, colIdx: 1 },
        { title: 'Astronomy', x: 6000, y: 5750, w: 340, h: 360, colIdx: 4 },
        { title: 'Scientific method', x: 6400, y: 5400, w: 340, h: 360, colIdx: 5 },
      ],
      conns: [
        { from: { idx: 0 }, to: { idx: 1 }, style: 'curved' },
        { from: { idx: 0 }, to: { idx: 2 }, style: 'curved' },
        { from: { idx: 0 }, to: { idx: 3 }, style: 'curved' },
        { from: { idx: 1 }, to: { idx: 4 }, style: 'straight', label: 'applies to' },
        { from: { idx: 3 }, to: { idx: 4 }, style: 'curved' },
        { from: { idx: 1 }, to: { idx: 5 }, style: 'stepped', label: 'method' },
      ],
      stickies: [{ x: 5250, y: 5000, text: 'Scientific map — click related to expand each field', color: 'sb' }],
    },
    history_timeline: {
      name: 'History: WWII to Cold War',
      description: 'A short arc from World War II through the Cold War, linked for chronological research.',
      nodes: [
        { title: 'World War II', x: 5200, y: 5400, w: 340, h: 360, colIdx: 1 },
        { title: 'Cold War', x: 5600, y: 5400, w: 340, h: 360, colIdx: 2 },
        { title: 'NATO', x: 6000, y: 5250, w: 340, h: 360, colIdx: 0 },
        { title: 'Berlin Wall', x: 6000, y: 5650, w: 340, h: 360, colIdx: 3 },
        { title: 'Space Race', x: 6400, y: 5400, w: 340, h: 360, colIdx: 4 },
      ],
      conns: [
        { from: { idx: 0 }, to: { idx: 1 }, style: 'curved', label: 'led to' },
        { from: { idx: 1 }, to: { idx: 2 }, style: 'curved' },
        { from: { idx: 1 }, to: { idx: 3 }, style: 'curved' },
        { from: { idx: 1 }, to: { idx: 4 }, style: 'straight', label: 'competition' },
      ],
      texts: [{ x: 5220, y: 5820, content: '1945 → 1991' }],
    },
    tech_stack: {
      name: 'Technology Stack',
      description: 'From Internet fundamentals to programming languages and modern AI — a developer’s map.',
      nodes: [
        { title: 'Internet', x: 5200, y: 5400, w: 340, h: 360, colIdx: 4 },
        { title: 'World Wide Web', x: 5600, y: 5250, w: 340, h: 360, colIdx: 0 },
        { title: 'JavaScript', x: 6000, y: 5200, w: 340, h: 360, colIdx: 5 },
        { title: 'Python (programming language)', x: 6000, y: 5600, w: 340, h: 360, colIdx: 2 },
        { title: 'Artificial intelligence', x: 6400, y: 5400, w: 340, h: 360, colIdx: 3 },
        { title: 'Machine learning', x: 6800, y: 5400, w: 340, h: 360, colIdx: 1 },
      ],
      conns: [
        { from: { idx: 0 }, to: { idx: 1 }, style: 'curved', label: 'enables' },
        { from: { idx: 1 }, to: { idx: 2 }, style: 'curved' },
        { from: { idx: 1 }, to: { idx: 3 }, style: 'curved' },
        { from: { idx: 2 }, to: { idx: 4 }, style: 'straight' },
        { from: { idx: 3 }, to: { idx: 4 }, style: 'curved' },
        { from: { idx: 4 }, to: { idx: 5 }, style: 'curved', label: 'subset' },
      ],
    },
    art_movement: {
      name: 'Art: Renaissance to Modern',
      description: 'Renaissance → Impressionism → Modern art — follow stylistic evolution.',
      nodes: [
        { title: 'Renaissance art', x: 5200, y: 5400, w: 340, h: 360, colIdx: 2 },
        { title: 'Leonardo da Vinci', x: 5600, y: 5300, w: 340, h: 360, colIdx: 1 },
        { title: 'Impressionism', x: 6000, y: 5450, w: 340, h: 360, colIdx: 5 },
        { title: 'Claude Monet', x: 6400, y: 5300, w: 340, h: 360, colIdx: 0 },
        { title: 'Modern art', x: 6400, y: 5700, w: 340, h: 360, colIdx: 3 },
      ],
      conns: [
        { from: { idx: 0 }, to: { idx: 1 }, style: 'curved', label: 'master' },
        { from: { idx: 0 }, to: { idx: 2 }, style: 'curved', label: 'evolved to' },
        { from: { idx: 2 }, to: { idx: 3 }, style: 'curved' },
        { from: { idx: 2 }, to: { idx: 4 }, style: 'curved' },
      ],
    },
    empty_starter: {
      name: 'Blank Research Canvas',
      description: 'Start empty — search Wikipedia above to open your first article. Minimal starter for custom research.',
      nodes: [],
      conns: [],
      stickies: [{ x: 5600, y: 5600, text: '→ Search Wikipedia above to begin. Drag ports to connect.', color: 'sy' }],
      texts: [],
    },
  };

  function get(name) { return boards[name] || null; }
  function list() { return Object.keys(boards).map(k => ({ id: k, name: boards[k].name, description: boards[k].description, count: (boards[k].nodes || []).length })); }
  function injectExample(id) { const g = boards[id]; return g ? g : null; }

  // Instantiate a board into a live WikiEngine state (or plain Maps)
  function instantiate(name, WE) {
    const b = boards[name];
    if (!b) return null;
    // If WikiEngine provided, use its board state; otherwise return raw data
    if (WE && WE.createBoardState) {
      const state = WE.createBoardState();
      const ids = [];
      (b.nodes || []).forEach(n => {
        const col = WE.COLS[n.colIdx % WE.COLS.length];
        const node = {
          id: WE.genId('x'),
          title: n.title,
          x: n.x, y: n.y, w: n.w || 340, h: n.h || 360,
          col: col.mm, colObj: col,
          collapsed: false,
          createdAt: Date.now(), updatedAt: Date.now(),
        };
        state.nodes.set(node.id, node);
        ids.push(node.id);
      });
      (b.conns || []).forEach(c => {
        const fromId = ids[c.from.idx], toId = ids[c.to.idx];
        if (!fromId || !toId) return;
        const conn = {
          id: WE.genId('x'),
          from: fromId, to: toId,
          fromSide: null, toSide: null,
          style: c.style || 'curved',
          dashed: !!c.dashed, openArrow: !!c.openArrow, noArrow: !!c.noArrow,
          label: c.label || '',
          createdAt: Date.now(), updatedAt: Date.now(),
        };
        // compute sides
        const fn = state.nodes.get(fromId), tn = state.nodes.get(toId);
        const sides = WE.bestSides(fn, tn);
        conn.fromSide = sides.fs; conn.toSide = sides.ts;
        state.conns.set(conn.id, conn);
      });
      (b.stickies || []).forEach(s => {
        const sid = WE.genId('x');
        state.stickies.set(sid, { id: sid, x: s.x, y: s.y, text: s.text, color: s.color || 'sy', createdAt: Date.now() });
      });
      (b.texts || []).forEach(t => {
        const tid = WE.genId('x');
        state.texts.set(tid, { id: tid, x: t.x, y: t.y, content: t.content, createdAt: Date.now() });
      });
      // Update uid to max
      let max = 1;
      for (const n of state.nodes.values()) { const num = parseInt(String(n.id).replace('x', ''), 10); if (!isNaN(num) && num >= max) max = num + 1; }
      for (const c of state.conns.values()) { const num = parseInt(String(c.id).replace('x', ''), 10); if (!isNaN(num) && num >= max) max = num + 1; }
      state.uid = max;
      return { state, ids, meta: { name: b.name, description: b.description } };
    }
    // Fallback raw clone
    return JSON.parse(JSON.stringify(b));
  }

  return { boards, get, list, injectExample, instantiate };
});
