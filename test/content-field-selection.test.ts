import assert from 'node:assert/strict';
import test from 'node:test';
import { contentFieldId, focusContentFieldWhenReady } from '../modules/content/studio/field-selection';

test('preview fields resolve to stable inspector IDs and reject uneditable paths', () => {
  const payload = { slides: [{ id: 'slide-7', title: 'Hello', imageUrl: '/photo.jpg' }], heading: 'Welcome', secret: 'hidden' };
  assert.equal(contentFieldId('hero', payload, 'slides.0.title', ['slides']), 'hero-slides-slide-7-title');
  assert.equal(contentFieldId('hero', payload, 'slides.0.imageUrl', ['slides']), 'hero-slides-slide-7-imageUrl');
  assert.equal(contentFieldId('hero', payload, 'heading', ['heading']), 'hero-heading');
  for (const path of ['secret', 'slides.9.title', 'slides.0.missing', 'slides.0.__proto__', 'slides', {}, undefined]) {
    assert.equal(contentFieldId('hero', payload, path, ['slides', 'heading']), null);
  }
});

test('first-click focus waits for Puck fields to mount, then selects and centers exactly once', () => {
  const original = globalThis.MutationObserver;
  let callback: () => void = () => {};
  let observing = false;
  globalThis.MutationObserver = class {
    constructor(fn: () => void) { callback = fn; }
    observe() { observing = true; }
    disconnect() { observing = false; }
  } as unknown as typeof MutationObserver;
  try {
    let mounted = false;
    let focused = 0;
    let selected = 0;
    let scroll: unknown;
    const inspector = {
      ownerDocument: { getElementById: (id: string) => mounted && id === 'hero-title' ? field : null },
      contains: (node: unknown) => node === field,
    };
    const group = { tagName: 'DETAILS', open: false, parentElement: inspector };
    const field = {
      parentElement: group,
      focus: (options: unknown) => { assert.deepEqual(options, { preventScroll: true }); focused++; },
      matches: () => true,
      select: () => { selected++; },
      scrollIntoView: (options: unknown) => { scroll = options; },
    };
    const cleanup = focusContentFieldWhenReady(inspector as unknown as HTMLElement, 'hero-title');
    assert.equal(focused, 0);
    assert.equal(observing, true);
    callback();
    assert.equal(focused, 0, 'unrelated mounting must not steal focus');
    mounted = true;
    callback();
    assert.equal(focused, 1);
    assert.equal(selected, 1);
    assert.equal(group.open, true);
    assert.deepEqual(scroll, { block: 'center', inline: 'nearest' });
    assert.equal(observing, false, 'stop watching so typing does not refocus the field');
    cleanup();
    mounted = false;
    const cancel = focusContentFieldWhenReady(inspector as unknown as HTMLElement, 'hero-title');
    assert.equal(observing, true);
    cancel();
    assert.equal(observing, false, 'switching sections cancels an outstanding selection');
  } finally { globalThis.MutationObserver = original; }
});
