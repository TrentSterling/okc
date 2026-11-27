import test from 'node:test';
import assert from 'node:assert/strict';
import {createInputRouter} from './input-router.js';
import {createWidgets} from './widgets.js';

const touch = (pointerId, x, y, extra = {}) => ({pointerId, x, y, pointerType: 'touch', button: 0, ...extra});
const rect = {x: 10, y: 10, w: 80, h: 80};

test('two held fingers are released independently across UI redraws', () => {
  const held = new Set(), steer = new Set(), router = createInputRouter();
  const host = {router, width: 390, height: 844, insets: {}, scrolls: new Map(), platform: {}, invalidate() {}};
  const surface = {rect() {}, text() {}, circle() {}, line() {}, measure(value, size = 16) { return value.length * size * .6; }};
  const draw = () => {
    const widgets = createWidgets(host, surface);
    widgets.hold('throttle', 'GO', rect, {onDown: id => held.add(id), onUp: id => held.delete(id)});
    widgets.hold('steer', 'LEFT', {x: 110, y: 10, w: 80, h: 80}, {onDown: id => steer.add(id), onUp: id => steer.delete(id)});
    router.setTargets(widgets.targets);
  };
  draw(); router.down(touch(1, 30, 30)); router.down(touch(2, 40, 30)); router.down(touch(3, 130, 30));
  assert.deepEqual([...held], [1, 2]); assert.deepEqual([...steer], [3]); draw();
  router.move(touch(1, 380, 700)); assert.deepEqual([...held], [1, 2]);
  router.cancel(1); assert.deepEqual([...held], [2]); assert.deepEqual([...steer], [3]);
  router.up(touch(2, 40, 30)); assert.equal(held.size, 0); assert.equal(steer.size, 1);
  router.clear(); assert.equal(steer.size, 0); assert.equal(router.pointers.size, 0);
});

test('a touch drag transfers a button to its scroll region without camera or click leakage', () => {
  const calls = [], router = createInputRouter({scrollBy: (id, delta) => calls.push(['scroll', id, delta]), worldTap: () => calls.push(['worldTap'])});
  router.setWorld({down: () => calls.push(['worldDown']), move: () => calls.push(['worldMove'])});
  router.setTargets([{id: 'result', rect, scrollId: 'results', onDown: () => calls.push(['down']),
    onCancel: () => calls.push(['cancel']), onUp: () => calls.push(['up']), onTap: () => calls.push(['tap'])}]);
  assert.equal(router.down(touch(1, 30, 30)), 'ui');
  router.move(touch(1, 30, 34)); router.move(touch(1, 30, 46)); router.move(touch(1, 30, 60));
  router.up(touch(1, 30, 60));
  assert.deepEqual(calls, [['down'], ['cancel'], ['scroll', 'results', -12], ['scroll', 'results', -14]]);
});

test('hold controls keep their pointer while an independent finger pans the world', () => {
  const calls = [], router = createInputRouter({worldTap: () => calls.push('tap')});
  router.setWorld({down: e => calls.push(['worldDown', e.pointerId]), move: e => calls.push(['worldMove', e.pointerId]), up: e => calls.push(['worldUp', e.pointerId])});
  router.setTargets([{id: 'drive', rect, lockDrag: true, scrollId: 'panel', onDown: e => calls.push(['hold', e.pointerId]), onUp: e => calls.push(['release', e.pointerId])}]);
  router.down(touch(1, 30, 30)); router.down(touch(2, 200, 200));
  router.move(touch(1, 200, 200)); router.move(touch(2, 240, 220)); router.up(touch(2, 240, 220));
  assert.ok(router.pointers.has(1)); assert.deepEqual(calls.slice(0, 4), [['hold', 1], ['worldDown', 2], ['worldMove', 2], ['worldUp', 2]]);
  router.up(touch(1, 200, 200)); assert.deepEqual(calls.at(-1), ['release', 1]); assert.ok(!calls.includes('tap'));
});

test('cancel and lost-capture cleanup are idempotent and never synthesize taps', () => {
  const calls = [], router = createInputRouter({worldTap: () => calls.push('worldTap')});
  router.setWorld({cancel: e => calls.push(['worldCancel', e.pointerId])});
  router.setTargets([{id: 'button', rect, onTap: () => calls.push('tap'), onCancel: e => calls.push(['uiCancel', e.pointerId])}]);
  router.down(touch(1, 20, 20)); router.cancel(1); router.cancel(1); router.up(touch(1, 20, 20));
  router.down(touch(2, 200, 200)); router.cancel(2); router.cancel(2); router.up(touch(2, 200, 200));
  assert.deepEqual(calls, [['uiCancel', 1], ['worldCancel', 2]]); assert.equal(router.pointers.size, 0);
});

test('a pinch cannot become a world tap when one finger is released first', () => {
  let taps = 0; const router = createInputRouter({worldTap: () => taps++});
  router.down(touch(1, 100, 100)); router.down(touch(2, 200, 100));
  router.up(touch(2, 200, 100)); router.up(touch(1, 100, 100)); assert.equal(taps, 0);
  router.down(touch(3, 100, 100)); router.up(touch(3, 100, 100)); assert.equal(taps, 1);
});

test('clipped controls cannot steal taps or wheel events outside their visible region', () => {
  const calls = [], router = createInputRouter({scrollBy: id => calls.push(id)});
  router.setWorld({wheel: () => calls.push('world')});
  router.setTargets([{id: 'sheet', rect: {x: 0, y: 0, w: 100, h: 100}, scrollId: 'sheet'},
    {id: 'clipped', rect: {x: 0, y: 0, w: 100, h: 200}, clip: {x: 0, y: 0, w: 100, h: 50}, scrollId: 'clipped'}]);
  assert.equal(router.hit(20, 30).id, 'clipped'); assert.equal(router.hit(20, 80).id, 'sheet');
  assert.equal(router.hit(20, 130), null); router.wheel({x: 20, y: 80, deltaY: 20}); router.wheel({x: 20, y: 130, deltaY: 20});
  assert.deepEqual(calls, ['sheet', 'world']);
});

test('modal input blocking prevents the world from acquiring or finishing a tap', () => {
  const calls = [], router = createInputRouter({isBlocked: () => true, worldTap: () => calls.push('tap')});
  router.setWorld({down: () => calls.push('down'), move: () => calls.push('move'), up: () => calls.push('up')});
  assert.equal(router.down(touch(1, 200, 200)), 'blocked'); router.move(touch(1, 210, 200)); router.up(touch(1, 210, 200));
  assert.deepEqual(calls, []);
});

test('pointer-up displacement rejects a swipe even if the browser coalesced every move', () => {
  let taps = 0; const router = createInputRouter();
  router.setTargets([{id: 'wide', rect: {x: 0, y: 0, w: 200, h: 100}, onTap: () => taps++}]);
  router.down(touch(1, 10, 10)); router.up(touch(1, 100, 10)); assert.equal(taps, 0);
});
