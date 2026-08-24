// app-integration.js — glue that connects UI (script.js) to WikiEngine, Viz, WikiLibrary, and Web Worker
// Provides environment-agnostic loading and fallback for file:// etc.
'use strict';

(function () {
  const WE = (typeof WikiEngine !== 'undefined' ? WikiEngine : (typeof require !== 'undefined' ? (() => { try { return require('./wiki-engine.js'); } catch(e){return null;} })() : null));
  const VizMod = (typeof Viz !== 'undefined' ? Viz : (typeof require !== 'undefined' ? (() => { try { return require('./viz.js'); } catch(e){return null;} })() : null));
  const Lib = (typeof WikiLibrary !== 'undefined' ? WikiLibrary : (typeof require !== 'undefined' ? (() => { try { return require('./wiki-library.js'); } catch(e){return null;} })() : null));

  // ── Worker management ──────────────────────────────────────────
  let worker = null;
  let workerId = 0;
  const pending = new Map();

  function initWorker() {
    if (worker) return worker;
    try {
      if (typeof Worker !== 'undefined' && typeof window !== 'undefined' && window.location.protocol !== 'file:') {
        worker = new Worker('wiki-worker.js');
        worker.onmessage = (e) => {
          const { id, result, error } = e.data || {};
          const entry = pending.get(id);
          if (entry) {
            pending.delete(id);
            if (error) entry.reject(new Error(error));
            else entry.resolve(result);
          }
        };
        worker.onerror = (e) => {
          console.warn('Wiki worker error, falling back to main thread', e);
          worker = null;
        };
      }
    } catch (e) {
      console.warn('Worker init failed, using main-thread fallback', e);
      worker = null;
    }
    return worker;
  }

  function workerExec(type, payload) {
    const w = initWorker();
    if (!w || !WE) {
      return Promise.reject(new Error('Worker or WikiEngine not available'));
    }
    return new Promise((resolve, reject) => {
      const id = ++workerId;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, type, ...payload });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('Worker timeout'));
        }
      }, 2500);
    });
  }

  // Wrap engine's sanitize with worker-aware variant that falls back to main thread
  async function sanitizeAsync(html, opts) {
    try {
      const w = initWorker();
      if (!w || !WE) throw new Error('no worker');
      const res = await workerExec('sanitize', { html, opts });
      return res.html;
    } catch (e) {
      if (WE) return WE.sanitizeContent(html, opts);
      return String(html || '').replace(/<[^>]+>/g, ' ').substring(0, 500);
    }
  }

  function sanitizeMainThread(html, opts) {
    if (!WE) throw new Error('WikiEngine not loaded');
    return WE.sanitizeContent(html, opts);
  }

  // CRDT sync via worker if available
  async function syncAsync(localState, remoteState) {
    try {
      const w = initWorker();
      if (!w || !WE) throw new Error('no worker');
      const localSer = WE.serialize(localState);
      const remoteSer = WE.serialize(remoteState);
      const res = await workerExec('merge', { localState: localSer, remoteState: remoteSer });
      // Apply returned state back to local
      const merged = WE.deserialize(res.state);
      // Patch local in place
      localState.nodes = merged.nodes;
      localState.conns = merged.conns;
      localState.stickies = merged.stickies;
      localState.texts = merged.texts;
      localState.images = merged.images;
      localState.opLog = merged.opLog;
      localState.vectorClock = merged.vectorClock;
      return { applied: res.applied, mergedCount: res.mergedCount };
    } catch (e) {
      // Fallback to main thread
      if (!WE) throw new Error('WikiEngine not loaded');
      return WE.syncMerge(localState, remoteState);
    }
  }

  function syncMainThread(localState, remoteState) {
    if (!WE) throw new Error('WikiEngine not loaded');
    return WE.syncMerge(localState, remoteState);
  }

  // Wiki fetch helpers: worker can also build URLs, but actual fetch stays in main thread for CORS simplicity
  async function wikiSearch(q, limit) {
    if (!WE) throw new Error('WikiEngine not loaded');
    const url = WE.buildSearchUrl(q, limit);
    const r = await fetch(url);
    return (await r.json())[1] || [];
  }

  // ── Library helpers ────────────────────────────────────────────
  function loadExampleAsync(name, boardState) {
    if (!Lib || !WE) throw new Error('Library or Engine not loaded');
    const entry = Lib.get(name);
    if (!entry) throw new Error('Unknown board: ' + name);
    // Clear existing boardState maps
    boardState.nodes.clear(); boardState.conns.clear();
    boardState.stickies.clear(); boardState.texts.clear();
    boardState.images.clear(); boardState.groups.clear();
    boardState.opLog = [];
    const res = Lib.instantiate(name, WE);
    if (!res || !res.state) throw new Error('Instantiate failed');
    // Copy into boardState
    for (const [k, v] of res.state.nodes) boardState.nodes.set(k, v);
    for (const [k, v] of res.state.conns) boardState.conns.set(k, v);
    for (const [k, v] of res.state.stickies) boardState.stickies.set(k, v);
    for (const [k, v] of res.state.texts) boardState.texts.set(k, v);
    boardState.uid = res.state.uid;
    boardState.colIdx = res.state.colIdx || 0;
    boardState.openOff = res.state.openOff || 0;
    return { boardState, meta: res.meta, count: boardState.nodes.size };
  }

  // ── Patch globals for script.js compatibility ──────────────────
  function patchGlobals() {
    if (typeof window === 'undefined') return;
    if (WE) window.WE = WE;
    if (VizMod) window.VizMod = VizMod;
    if (Lib) window.WikiLib = Lib;
    window.sanitizeAsync = sanitizeAsync;
    window.sanitizeMainThread = sanitizeMainThread;
    window.syncAsync = syncAsync;
    window.syncMainThread = syncMainThread;
    window.wikiSearch = wikiSearch;
    window.initWikiWorker = initWorker;
    window.getWikiEngine = () => WE;
    window.getViz = () => VizMod;
    window.getWikiLibrary = () => Lib;
    window.loadExampleAsync = loadExampleAsync;
  }

  window.AppIntegration = {
    initWorker, workerExec, sanitizeAsync, sanitizeMainThread, syncAsync, syncMainThread, patchGlobals, loadExampleAsync, wikiSearch,
    get WE() { return WE; }, get Viz() { return VizMod; }, get Lib() { return Lib; },
  };

  // Auto-patch
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', patchGlobals);
    } else {
      patchGlobals();
    }
  } else if (WE) {
    if (typeof global !== 'undefined') global.AppIntegration = window.AppIntegration;
  }

  console.log('%c AppIntegration loaded — WE:' + !!WE + ' Viz:' + !!VizMod + ' Lib:' + !!Lib, 'color:#9B30FF;font-family:monospace');
})();
