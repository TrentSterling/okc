import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform} from './platform.js';

function fixture(t) {
  const previous = globalThis.document, elements = [], commits = [], cancellations = [], anchors = [];
  let active = null;
  class Element extends EventTarget {
    constructor(tag) { super(); this.tagName = tag; this.style = {}; this.value = ''; this.focusCalls = 0; }
    setAttribute() {}
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    focus() { this.focusCalls++; if (active === this) return; const old = active; active = this; old?.dispatchEvent(new Event('blur')); }
    blur() { if (active !== this) return; active = null; this.dispatchEvent(new Event('blur')); }
    remove() { this.blur(); this.removed = true; }
  }
  globalThis.document = {createElement: tag => { const element = new Element(tag); elements.push(element); return element; }, body: {append() {}}};
  const host = {canvas: new Element('canvas'), invalidate() {}, cancelInputs(reason) { cancellations.push(reason); },
    anchorEditor(id) { anchors.push(id); this.editAnchor = {id}; }};
  const platform = createPlatform(host);
  t.after(() => { platform.dispose(); if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const key = options => {
    const event = new Event('keydown', {cancelable: true, bubbles: true}); Object.assign(event, options);
    elements[0].dispatchEvent(event); return event;
  };
  return {platform, host, elements, commits, cancellations, anchors, key,
    begin(id, value = '', options = {}) { platform.beginEdit(id, value, {onCommit: text => commits.push({id, text}), ...options}); },
    input(value) { elements[0].value = value; elements[0].dispatchEvent(new Event('input')); }};
}

test('IME confirmation Enter preserves editing and default composition behavior', t => {
  const f = fixture(t); f.begin('search', '候補');
  for (const options of [{key: 'Enter', isComposing: true}, {key: 'Enter', keyCode: 229}]) {
    const event = f.key(options); assert.equal(event.defaultPrevented, false);
    assert.equal(f.platform.editing.id, 'search'); assert.equal(f.commits.length, 0);
  }
  f.input('確定'); const enter = f.key({key: 'Enter', isComposing: false, keyCode: 13});
  assert.equal(enter.defaultPrevented, true); assert.equal(f.platform.editing, null);
  assert.deepEqual(f.commits, [{id: 'search', text: '確定'}]);
});

test('switching fields commits the latest prior value once and reuses the native editor', t => {
  const f = fixture(t); f.begin('allowance', '20'); f.input('25.50');
  f.begin('time', '18:30');
  assert.deepEqual(f.commits, [{id: 'allowance', text: '25.50'}]);
  assert.equal(f.elements.length, 1); assert.equal(f.elements[0].value, '18:30');
  assert.equal(f.platform.editing.id, 'time'); assert.deepEqual(f.anchors, ['allowance', 'time']);
  assert.equal(f.host.editAnchor.id, 'time');
  f.platform.endEdit(); f.platform.endEdit();
  assert.deepEqual(f.commits, [{id: 'allowance', text: '25.50'}, {id: 'time', text: '18:30'}]);
  assert.equal(f.host.editAnchor, null);
});

test('reentering the active field preserves its draft, caret and focus', t => {
  const f = fixture(t); f.begin('search', 'old'); f.input('fresh draft');
  const editor = f.elements[0]; editor.setSelectionRange(3, 3);
  const focusCalls = editor.focusCalls, cancelled = f.cancellations.length;
  f.begin('search', 'stale model value');
  assert.equal(editor.value, 'fresh draft'); assert.equal(editor.selectionStart, 3);
  assert.equal(editor.focusCalls, focusCalls); assert.equal(f.cancellations.length, cancelled);
  assert.equal(f.commits.length, 0); assert.equal(f.platform.editing.value, 'fresh draft');
});

test('multiline Enter remains native editing; blur commits once and releases its scroll anchor', t => {
  const f = fixture(t); f.begin('notes', 'first', {multiline: true});
  assert.equal(f.key({key: 'Enter'}).defaultPrevented, false); assert.equal(f.platform.editing.id, 'notes');
  f.input('first\nsecond'); f.elements[0].blur(); f.platform.endEdit();
  assert.deepEqual(f.commits, [{id: 'notes', text: 'first\nsecond'}]);
  assert.equal(f.host.editAnchor, null);
});
