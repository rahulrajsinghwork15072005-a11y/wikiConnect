'use strict';
const assert = require('assert');
const Viz = require('../viz.js');
const WE = require('../wiki-engine.js');

console.log('— Viz UMD load check —');
assert.ok(Viz, 'Viz loaded');
assert.ok(typeof Viz.esc === 'function', 'esc');
assert.ok(typeof Viz.buildBoardSVG === 'function', 'buildBoardSVG');
assert.ok(typeof Viz.buildNodeSVG === 'function', 'buildNodeSVG');
assert.ok(typeof Viz.buildConnectionSVG === 'function', 'buildConnectionSVG');
console.log('✔ UMD — OK');

console.log('\n— esc() XSS-safe —');
assert.strictEqual(Viz.esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.strictEqual(Viz.esc('a&b'), 'a&amp;b');
assert.strictEqual(Viz.esc('"quote"'), '&quot;quote&quot;');
assert.strictEqual(Viz.esc("'single'"), '&#39;single&#39;');
assert.strictEqual(Viz.esc(null), '');
assert.strictEqual(Viz.esc(undefined), '');
assert.strictEqual(Viz.esc(0), '0');
const xss = Viz.esc('<img src=x onerror=alert(1)>');
assert.ok(!xss.includes('<'), 'escaped <');
assert.ok(xss.includes('&lt;'), 'has &lt;');
console.log('✔ esc XSS-safe — OK');

console.log('\n— buildNodeSVG —');
const node = { id:'x1', title:'Test & <Bad>', x:100,y:100,w:340,h:360, colObj:{top:'rgba(37,99,235,0.4)'}, excerpt:'Hello world excerpt that is safe' };
let svg = Viz.buildNodeSVG(node);
assert.ok(svg.includes('<svg'), 'svg tag');
assert.ok(svg.includes('Test &amp; &lt;Bad&gt;'), 'escaped title');
assert.ok(!svg.includes('<Bad>'), 'no raw tag');
const collapsed = Viz.buildNodeSVG({...node, collapsed:true});
assert.ok(collapsed.includes('<svg'), 'collapsed svg');
console.log('✔ buildNodeSVG — OK');

console.log('\n— buildConnectionSVG —');
const fn = {x:0,y:0,w:340,h:360};
const tn = {x:500,y:0,w:340,h:360};
let c = {id:'c1', from:'x1', to:'x2', fromSide:'right', toSide:'left', style:'curved'};
let wSvg = Viz.buildConnectionSVG(c, fn, tn, {});
assert.ok(wSvg.includes('<path') || wSvg.includes('<g>'), 'path');
let straight = Viz.buildConnectionSVG({...c, style:'straight'}, fn, tn);
assert.ok(straight.includes('M') && straight.includes('L'), 'straight');
let stepped = Viz.buildConnectionSVG({...c, style:'stepped'}, fn, tn);
assert.ok(stepped.includes('M'), 'stepped');
let labeled = Viz.buildConnectionSVG({...c, label:'<script>alert(1)</script>'}, fn, tn);
assert.ok(!labeled.includes('<script>'), 'label escaped');
assert.ok(labeled.includes('&lt;script'), 'label escaped entity');
console.log('✔ buildConnectionSVG — OK');

console.log('\n— buildStickySVG —');
let sticky = {x:10,y:10,w:160,h:100, text:'Hello <b>world</b>', color:'sy'};
let sSvg = Viz.buildStickySVG(sticky);
assert.ok(sSvg.includes('<svg'), 'sticky svg');
assert.ok(sSvg.includes('Hello'), 'sticky text');
assert.ok(!sSvg.includes('<b>') || sSvg.includes('&lt;b'), 'sticky escaped if raw');
console.log('✔ buildStickySVG — OK');

console.log('\n— buildBoardSVG —');
{
  const board = {
    nodes: new Map([
      ['x1', {id:'x1', title:'Socrates', x:100,y:100,w:340,h:360, colObj:{top:'rgba(37,99,235,0.4)'}, excerpt:'Greek philosopher'}],
      ['x2', {id:'x2', title:'Plato', x:600,y:100,w:340,h:360, colObj:{top:'rgba(220,38,38,0.4)'}, excerpt:'Student of Socrates'}],
    ]),
    conns: new Map([
      ['c1', {id:'c1', from:'x1', to:'x2', fromSide:'right', toSide:'left', style:'curved', label:'student'}]
    ])
  };
  const svgAll = Viz.buildBoardSVG(board);
  assert.ok(svgAll.includes('<svg'), 'board svg');
  assert.ok(svgAll.includes('Socrates'), 'contains node title');
  assert.ok(svgAll.length > 800, 'non-trivial svg');
  // XSS guard
  const badBoard = {
    nodes: new Map([['x1', {id:'x1', title:'<script>alert(1)</script>', x:0,y:0,w:340,h:360, excerpt:'<img onerror=alert(1)>'}]]),
    conns: new Map()
  };
  const badSvg = Viz.buildBoardSVG(badBoard);
  assert.ok(!badSvg.includes('<script>'), 'no raw script');
  assert.ok(badSvg.includes('&lt;script'), 'escaped');
  // Also test plain object form
  const objBoard = {nodes:{x1:{id:'x1',title:'A',x:0,y:0,w:340,h:360}}, conns:{}};
  const objSvg = Viz.buildBoardSVG(objBoard);
  assert.ok(objSvg.includes('<svg'), 'object board svg');
  // Empty board
  const empty = Viz.buildBoardSVG({nodes:new Map(), conns:new Map()});
  assert.ok(empty.includes('empty board') || empty.includes('<svg'), 'empty board handled');
}
console.log('✔ buildBoardSVG — OK (also XSS guard)');

console.log('\n— renderBoard (container integration) —');
const fakeContainer = { innerHTML: '' };
Viz.renderBoard(fakeContainer, {nodes:new Map([['x1', {id:'x1', title:'A', x:0,y:0,w:340,h:360}]]), conns:new Map()});
assert.ok(fakeContainer.innerHTML.includes('<svg'), 'renderBoard sets innerHTML');
Viz.renderBoard(null, null, null); // should not throw
console.log('✔ renderBoard — OK');

console.log('\n— drawMinimapCanvas (canvas stub) —');
{
  const fakeCtx = {
    clearRect(){}, fillRect(){}, strokeRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, fill(){}, roundRect(){}, rect(){}
  };
  fakeCtx.fillStyle=''; fakeCtx.strokeStyle=''; fakeCtx.lineWidth=1;
  const fakeCanvas = { width:138, height:88, getContext:() => fakeCtx };
  // Should not throw
  Viz.drawMinimapCanvas(fakeCanvas, {nodes:new Map([['x1',{id:'x1',x:100,y:100,w:340,h:360, col:'rgba(37,99,235,.15)'}]]), conns:new Map()}, {tx:0,ty:0,scale:1,vw:800,vh:600});
  console.log('  minimap stub draw ok');
}
console.log('✔ minimap — OK');

console.log('\nAll viz tests passed ✔');
