// wiki-worker.js — Web Worker for WikiBoard (CRDT ops, sanitization, wiki fetch fallback)
// Environment-agnostic: imports wiki-engine.js via importScripts if available.
'use strict';

try {
  if (typeof importScripts === 'function') {
    importScripts('wiki-engine.js');
  }
} catch (e) {
  // engine will be injected via main thread or not available
}

self.onmessage = function (e) {
  const data = e.data || {};
  const id = data.id;
  const type = data.type;

  try {
    if (!self.WikiEngine) {
      self.postMessage({ id, error: 'WikiEngine not loaded in worker' });
      return;
    }
    const WE = self.WikiEngine;

    if (type === 'sanitize') {
      const html = data.html || '';
      const out = WE.sanitizeContent(html, data.opts);
      self.postMessage({ id, result: { html: out, esc: WE.esc(html) } });
    } else if (type === 'esc') {
      self.postMessage({ id, result: { esc: WE.esc(data.str) } });
    } else if (type === 'portAnchor') {
      const res = WE.portAnchor(data.node, data.side);
      self.postMessage({ id, result: res });
    } else if (type === 'mkPath') {
      const d = WE.mkPath(data.ax, data.ay, data.bx, data.by, data.fs, data.ts, data.style);
      self.postMessage({ id, result: { d } });
    } else if (type === 'bestSides') {
      const res = WE.bestSides(data.from, data.to);
      self.postMessage({ id, result: res });
    } else if (type === 'worldToScreen') {
      const res = WE.worldToScreen(data.x, data.y, data.zoom, data.px, data.py);
      self.postMessage({ id, result: res });
    } else if (type === 'screenToWorld') {
      const res = WE.screenToWorld(data.x, data.y, data.zoom, data.px, data.py);
      self.postMessage({ id, result: res });
    } else if (type === 'createNode') {
      // Create a board state, add node, return serialized state + op
      const state = WE.createBoardState({ actorId: data.actorId || 'worker' });
      // Hydrate if provided state
      if (data.state) {
        const hydrated = WE.deserialize(data.state);
        Object.assign(state, hydrated);
        state.nodes = hydrated.nodes; state.conns = hydrated.conns;
        state.stickies = hydrated.stickies; state.texts = hydrated.texts;
        state.images = hydrated.images; state.groups = hydrated.groups;
        state.opLog = hydrated.opLog; state.vectorClock = hydrated.vectorClock;
      }
      const res = WE.boardCreateNode(state, data.title, data.x, data.y, data.opts || {});
      self.postMessage({ id, result: { node: res ? res.node : null, op: res ? res.op : null, state: WE.serialize(state) } });
    } else if (type === 'applyOp') {
      const state = data.state ? WE.deserialize(data.state) : WE.createBoardState();
      const ok = WE.applyOp(state, data.op);
      self.postMessage({ id, result: { ok, state: WE.serialize(state) } });
    } else if (type === 'merge') {
      const local = data.localState ? WE.deserialize(data.localState) : WE.createBoardState();
      const remote = data.remoteState ? WE.deserialize(data.remoteState) : WE.createBoardState();
      const res = WE.syncMerge(local, remote);
      self.postMessage({ id, result: { applied: res.applied, mergedCount: res.merged.length, state: WE.serialize(local) } });
    } else if (type === 'computeFit') {
      const nodes = data.nodes || [];
      // nodes may be array of objects
      const map = new Map(nodes.map(n => [n.id, n]));
      const res = WE.computeFit(map, data.vw, data.vh, data.pad);
      self.postMessage({ id, result: res });
    } else if (type === 'wikiUrls') {
      // Return built URLs for given title/q (pure, no fetch)
      const urls = {
        search: data.q ? WE.buildSearchUrl(data.q, data.limit) : null,
        summary: data.title ? WE.buildSummaryUrl(data.title) : null,
        links: data.title ? WE.buildLinksUrl(data.title, data.limit) : null,
        images: data.title ? WE.buildImagesUrl(data.title) : null,
        imageInfo: data.image ? WE.buildImageInfoUrl(data.image) : null,
      };
      self.postMessage({ id, result: urls });
    } else if (type === 'ping') {
      self.postMessage({ id, result: { pong: true, hasEngine: !!self.WikiEngine } });
    } else {
      self.postMessage({ id, error: 'Unknown worker type: ' + type });
    }
  } catch (err) {
    self.postMessage({ id, error: err.message, stack: err.stack });
  }
};

self.WikiWorker = true;
