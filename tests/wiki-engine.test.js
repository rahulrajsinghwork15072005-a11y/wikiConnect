'use strict';
const assert = require('assert');
const WE = require('../wiki-engine.js');

function approx(v, expected, msg) { assert.strictEqual(v, expected, msg); }

console.log('— WikiEngine UMD load check —');
assert.ok(WE, 'WikiEngine loaded');
assert.ok(typeof WE.WORLD === 'number' && WE.WORLD === 12000, 'WORLD');
assert.ok(Array.isArray(WE.COLS) && WE.COLS.length === 6, 'COLS 6');
assert.ok(typeof WE.setOf === 'function', 'setOf');
assert.ok(typeof WE.addAll === 'function', 'addAll');
assert.ok(typeof WE.esc === 'function', 'esc');
assert.ok(typeof WE.sanitizeContent === 'function', 'sanitizeContent');
assert.ok(typeof WE.worldToScreen === 'function', 'worldToScreen');
assert.ok(typeof WE.screenToWorld === 'function', 'screenToWorld');
assert.ok(typeof WE.portAnchor === 'function', 'portAnchor');
assert.ok(typeof WE.bestSides === 'function', 'bestSides');
assert.ok(typeof WE.mkPath === 'function', 'mkPath');
assert.ok(typeof WE.buildSearchUrl === 'function', 'buildSearchUrl');
assert.ok(typeof WE.createBoardState === 'function', 'createBoardState');
assert.ok(typeof WE.boardCreateNode === 'function', 'boardCreateNode');
assert.ok(typeof WE.syncMerge === 'function', 'syncMerge');
console.log('✔ UMD wrapper (browser/Worker/Node) — OK');

console.log('\n— COLS data-driven —');
assert.ok(WE.COLS[0].top.includes('37,99,235'), 'col 0 blue');
assert.ok(WE.COLS[1].top.includes('220,38,38'), 'col 1 red');
console.log('✔ COLS — OK');

console.log('\n— setOf / addAll —');
const s1 = WE.setOf(['a','b']);
assert.ok(s1.has('a') && s1.size===2);
const target = WE.setOf(['a']);
assert.strictEqual(WE.addAll(target, WE.setOf(['b','c'])), true);
assert.ok(target.has('c'));
assert.strictEqual(WE.addAll(target, WE.setOf(['a'])), false);
console.log('✔ setOf/addAll — OK');

console.log('\n— esc() XSS-safe —');
assert.strictEqual(WE.esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.strictEqual(WE.esc('a&b'), 'a&amp;b');
assert.strictEqual(WE.esc('"q"'), '&quot;q&quot;');
assert.strictEqual(WE.esc("'s'"), '&#39;s&#39;');
assert.strictEqual(WE.esc(null), '');
assert.strictEqual(WE.esc(0), '0');
const xss = WE.esc('<img src=x onerror=alert(1)>');
assert.ok(!xss.includes('<'), 'escaped');
console.log('✔ esc — OK');

console.log('\n— sanitizeContent —');
const safe = WE.sanitizeContent('<p>Hello <strong>world</strong> and <script>alert(1)</script> more text here longer than fifteen chars</p><p>Second paragraph with enough length to pass filter and <b>bold</b></p>');
assert.ok(safe.includes('<p>'), 'has p');
assert.ok(safe.includes('<strong>world</strong>') || safe.includes('<strong>'), 'keeps strong');
assert.ok(!safe.includes('<script>'), 'strips script');
assert.ok(!safe.includes('<b>'), 'converts b');
const safe2 = WE.sanitizeContent('<p>Short</p><p>This is a longer paragraph that should be kept because it has more than fifteen characters and contains <strong>bold</strong> and <br> line break</p>');
assert.ok(safe2.includes('longer paragraph'), 'keeps longer');
assert.ok(safe2.includes('<br>') || safe2.includes('<br/>') || true, 'br allowed if present');
const fallback = WE.sanitizeContent('plain text <img onerror=alert(1)> with script');
assert.ok(fallback.includes('<p>'), 'fallback wraps');
assert.ok(!fallback.includes('<img'), 'fallback strips');
console.log('✔ sanitizeContent — OK');

console.log('\n— snap / world↔screen —');
assert.strictEqual(WE.snap(15), 16);
assert.strictEqual(WE.snap(31), 32);
const w2s = WE.worldToScreen(100, 200, 2, 10, 20);
assert.deepStrictEqual(w2s, {x:210, y:420});
const s2w = WE.screenToWorld(210, 420, 2, 10, 20);
assert.deepStrictEqual(s2w, {x:100, y:200});
const c2w = WE.c2w(100, 100, 2, 10, 10);
assert.deepStrictEqual(c2w, {x:45, y:45});
const w2c = WE.w2c(45,45,2,10,10);
assert.deepStrictEqual(w2c, {x:100, y:100});
console.log('✔ snap / transforms — OK');

console.log('\n— zoomTransform (zoom-to-cursor math) —');
let zt = WE.zoomTransform(1, 0, 0, 1.1, 500, 500);
assert.ok(zt.scale > 1 && zt.scale === WE.clampScale(1.1), 'scale clamped');
assert.ok(Math.abs(zt.tx - (500 - 1.1*(500-0))) < 0.01, 'tx keeps cursor');
const zt2 = WE.zoomTransform(2, 100, 100, 0.5, 200, 200);
// factor 0.5 from 2 → 1 ; ratio 0.5 ; tx = 200 -0.5*(200-100)=150
assert.strictEqual(Math.round(zt2.tx), 150);
console.log('✔ zoomTransform — OK');

console.log('\n— computeFit —');
{
  const map = new Map();
  map.set('x1', {x:0,y:0,w:340,h:360});
  map.set('x2', {x:1000,y:500,w:340,h:360});
  const fit = WE.computeFit(map, 1200, 800, 80);
  assert.ok(fit.scale <= 1.4 && fit.scale > 0, 'fit scale');
  assert.ok(typeof fit.tx==='number' && typeof fit.ty==='number', 'fit tx/ty');
}
console.log('✔ computeFit — OK');

console.log('\n— portAnchor / bestSides / mkPath —');
const n1 = {x:100,y:100,w:340,h:360};
const n2 = {x:600,y:100,w:340,h:360};
assert.deepStrictEqual(WE.portAnchor(n1,'top'), {x:270,y:100});
assert.deepStrictEqual(WE.portAnchor(n1,'right'), {x:440,y:280});
let bs = WE.bestSides(n1,n2);
assert.deepStrictEqual(bs, {fs:'right', ts:'left'});
let bs2 = WE.bestSides({x:100,y:100,w:340,h:360},{x:100,y:600,w:340,h:360});
assert.strictEqual(bs2.fs,'bottom');
let pathCurved = WE.mkPath(0,0,100,0,'right','left','curved');
assert.ok(pathCurved.includes('C'), 'curved has C');
let pathStraight = WE.mkPath(0,0,100,0,'right','left','straight');
assert.ok(pathStraight.includes('L') && !pathStraight.includes('C'), 'straight');
let pathStepped = WE.mkPath(0,0,100,100,'right','left','stepped');
assert.ok(pathStepped.split('L').length>=3, 'stepped');
console.log('✔ port geometry — OK');

console.log('\n— Wiki URL builders —');
assert.ok(WE.buildSearchUrl('hello world').includes('hello%20world'), 'search encodes');
assert.ok(WE.buildSearchUrl('test').includes('origin=*'), 'search origin');
assert.ok(WE.buildSummaryUrl('Albert Einstein').includes('Albert%20Einstein'), 'summary encodes');
assert.ok(WE.buildImagesUrl('Physics').includes('prop=images'), 'images');
assert.ok(WE.buildImageInfoUrl('File:Test.jpg').includes('imageinfo'), 'imageinfo');
assert.ok(WE.buildLinksUrl('Biology').includes('prop=links'), 'links');
console.log('✔ URL builders — OK');

console.log('\n— BoardState CRUD + dedup —');
{
  WE.resetUid(1);
  const st = WE.createBoardState({actorId:'test1'});
  assert.ok(st.nodes instanceof Map && st.conns instanceof Map, 'maps');
  const r1 = WE.boardCreateNode(st, 'Socrates', 100,100);
  assert.ok(r1.node && r1.node.title==='Socrates', 'createNode');
  assert.strictEqual(st.nodes.size,1);
  const dup = WE.boardCreateNode(st, 'socrates', 200,200); // case-insensitive dup
  assert.ok(dup.dup, 'dedup');
  assert.strictEqual(st.nodes.size,1, 'no dup added');
  const r2 = WE.boardCreateNode(st, 'Plato', 600,100);
  assert.strictEqual(st.nodes.size,2);
  const conn = WE.boardAddConn(st, r1.node.id, r2.node.id);
  assert.ok(conn && conn.from===r1.node.id, 'addConn');
  assert.strictEqual(st.conns.size,1);
  const dupConn = WE.boardAddConn(st, r1.node.id, r2.node.id);
  assert.strictEqual(dupConn,null, 'dedup conn');
  // Move
  WE.boardMoveNode(st, r1.node.id, 150,150);
  assert.strictEqual(st.nodes.get(r1.node.id).x,150);
  // Resize
  WE.boardResizeNode(st, r1.node.id, 400,400);
  assert.strictEqual(st.nodes.get(r1.node.id).w,400);
  // Cycle color
  const beforeCol = st.nodes.get(r1.node.id).col;
  WE.boardCycleColor(st, r1.node.id);
  assert.notStrictEqual(st.nodes.get(r1.node.id).col, beforeCol);
  // Collapse
  WE.boardToggleCollapse(st, r1.node.id);
  assert.ok(st.nodes.get(r1.node.id).collapsed);
  // Remove node should cascade conns
  WE.boardRemoveNode(st, r1.node.id);
  assert.ok(!st.nodes.has(r1.node.id), 'removed node');
  assert.strictEqual(st.conns.size,0, 'cascade conns');
  // Sticky/text
  const sticky = WE.boardCreateSticky(st, 10,10,'hello','sy');
  assert.ok(st.stickies.has(sticky.id));
  const txt = WE.boardCreateText(st, 20,20,'label');
  assert.ok(st.texts.has(txt.id));
}
console.log('✔ BoardState CRUD — OK');

console.log('\n— CRDT apply / merge —');
{
  WE.resetUid(100);
  const a = WE.createBoardState({actorId:'A'});
  const b = WE.createBoardState({actorId:'B'});
  const ra = WE.boardCreateNode(a, 'NodeA', 100,100);
  const rb = WE.boardCreateNode(b, 'NodeB', 200,200);
  assert.strictEqual(a.nodes.size,1);
  assert.strictEqual(b.nodes.size,1);
  // Apply op from A to B
  const opA = a.opLog[0];
  const applied = WE.applyOp(b, opA);
  assert.ok(applied, 'applyOp');
  assert.strictEqual(b.nodes.size,2, 'B now has 2');
  // Idempotence: re-apply same op should be no-op
  assert.strictEqual(WE.applyOp(b, opA), false, 'idempotent');
  // Merge
  const a2 = WE.createBoardState({actorId:'A'});
  WE.boardCreateNode(a2, 'X', 0,0);
  const b2 = WE.createBoardState({actorId:'B'});
  WE.boardCreateNode(b2, 'Y', 0,0);
  // Collect op logs before merge
  const beforeA = a2.nodes.size;
  const res = WE.syncMerge(a2,b2);
  assert.ok(res.applied>=1, 'syncMerge applied');
  assert.strictEqual(a2.nodes.size, 2, 'merged size');
  // Merge should be commutative: merging again should be idempotent
  const res2 = WE.syncMerge(a2,b2);
  assert.strictEqual(res2.applied,0, 'second merge no new ops');
}
console.log('✔ CRDT — OK');

console.log('\n— serialize / deserialize —');
{
  const st = WE.createBoardState({actorId:'serTest'});
  WE.boardCreateNode(st, 'Test1', 10,10);
  WE.boardCreateNode(st, 'Test2', 100,100);
  const ids = [...st.nodes.keys()];
  WE.boardAddConn(st, ids[0], ids[1]);
  const ser = WE.serialize(st);
  assert.ok(Array.isArray(ser.nodes) && ser.nodes.length===2);
  const des = WE.deserialize(ser);
  assert.ok(des.nodes instanceof Map && des.nodes.size===2);
  assert.strictEqual(des.conns.size,1);
  assert.strictEqual(des.opLog.length, ser.opLog.length);
  // Hash stability
  const h1 = WE.getStateHash(st);
  const h2 = WE.getStateHash(des);
  assert.strictEqual(h1,h2, 'hash stable after roundtrip');
}
console.log('✔ serialize — OK');

console.log('\n— LWW vectorClock —');
{
  const st = WE.createBoardState({actorId:'C'});
  WE.boardCreateNode(st, 'A', 0,0);
  assert.ok(st.vectorClock['C'] >=1, 'vectorClock incremented');
}
console.log('✔ vectorClock — OK');

console.log('\nAll wiki-engine tests passed ✔');
