import assert from 'node:assert/strict';
import test from 'node:test';
import {createPlaceSheetController} from './place-sheet.js';

class FakeNode {
  constructor(tagName = 'DIV', parentElement = null, dataset = {}) {
    this.tagName = tagName;
    this.parentElement = parentElement;
    this.dataset = dataset;
    this.listeners = new Map();
    this.scrollTop = 0;
    this.clientHeight = 0;
    this.scrollHeight = 0;
    this.captured = new Set();
  }
  contains(node) {
    for (let item = node; item; item = item.parentElement) if (item === this) return true;
    return false;
  }
  addEventListener(type, listener, options) {
    const entries = this.listeners.get(type) || [];
    entries.push({listener, capture: options === true || options?.capture === true});
    this.listeners.set(type, entries);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.listener !== listener));
  }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  emit(type, props = {}) {
    const event = {
      type,
      target: this,
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientY: 0,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.propagationStopped = true; },
      ...props
    };
    const entries = this.listeners.get(type) || [];
    for (const {listener} of entries) {
      listener(event);
      if (event.propagationStopped) break;
    }
    return event;
  }
}

function setup(options = {}) {
  let time = 0;
  const {handleTag = 'DIV', ...controllerOptions} = options;
  const root = new FakeNode();
  const header = new FakeNode(handleTag, root);
  const handleIcon = new FakeNode('SPAN', header);
  const content = new FakeNode('DIV', root);
  const scroll = new FakeNode('DIV', content, {sheetScroll: ''});
  Object.assign(scroll, {scrollTop: 0, clientHeight: 100, scrollHeight: 300});
  const action = new FakeNode('BUTTON', header, {sheetMode: 'expanded'});
  const map = new FakeNode();
  const changes = [];
  const drags = [];
  const mapEvents = [];
  const controller = createPlaceSheetController({
    root, handle: header, content, mapTarget: map,
    now: () => time,
    onModeChange: (mode, meta) => changes.push([mode, meta]),
    onDrag: detail => drags.push(detail),
    onMapInteraction: (event, api) => mapEvents.push([event.type, api]),
    stepDistance: 100,
    ...controllerOptions
  });
  const pointer = (target, type, {y = 0, id = 1, advance = 20, ...extra} = {}) => {
    time += advance;
    return root.emit(type, {target, clientY: y, pointerId: id, ...extra});
  };
  return {root, header, handleIcon, content, scroll, action, map, controller, changes, drags, mapEvents, pointer, advance(ms) { time += ms; }};
}

test('pointercancel restores drag presentation without snapping or suppressing a click', () => {
  const s = setup();
  s.pointer(s.header, 'pointerdown', {y: 100});
  s.pointer(s.header, 'pointermove', {y: 35});
  assert.equal(s.drags.at(-1).offsetY, -65);
  s.pointer(s.header, 'pointercancel', {y: 35});
  assert.equal(s.controller.getMode(), 'partial');
  assert.equal(s.changes.length, 0);
  assert.equal(s.drags.at(-1).canceled, true);
  const click = s.root.emit('click', {target: s.header});
  assert.equal(click.defaultPrevented, false);
});

test('a completed drag suppresses its synthetic click once', () => {
  const s = setup();
  s.pointer(s.header, 'pointerdown', {y: 200});
  s.pointer(s.header, 'pointermove', {y: 125});
  s.pointer(s.header, 'pointerup', {y: 125});
  assert.equal(s.controller.getMode(), 'expanded');
  const generated = s.root.emit('click', {target: s.header});
  assert.equal(generated.defaultPrevented, true);
  assert.equal(generated.propagationStopped, true);
  assert.equal(s.root.emit('click', {target: s.header}).defaultPrevented, false);
});

test('a designated button handle drags through its icon while nested buttons remain actions', () => {
  const s = setup({handleTag: 'BUTTON'});
  s.pointer(s.handleIcon, 'pointerdown', {y: 200});
  s.pointer(s.handleIcon, 'pointermove', {y: 125});
  s.pointer(s.handleIcon, 'pointerup', {y: 125});
  assert.equal(s.controller.getMode(), 'expanded');
  assert.equal(s.root.emit('click', {target: s.header}).defaultPrevented, true);

  s.controller.setMode('partial');
  s.pointer(s.action, 'pointerdown', {y: 200});
  s.pointer(s.action, 'pointermove', {y: 125});
  s.pointer(s.action, 'pointerup', {y: 125});
  assert.equal(s.controller.getMode(), 'partial');
  assert.equal(s.drags.filter(drag => !drag.canceled).length, 2);
});

test('lost pointer capture cancels an active drag and releases its presentation', () => {
  const s = setup();
  s.pointer(s.header, 'pointerdown', {y: 100, id: 7});
  s.pointer(s.header, 'pointermove', {y: 30, id: 7});
  assert.equal(s.root.hasPointerCapture(7), true);
  s.pointer(s.header, 'lostpointercapture', {y: 30, id: 7});
  assert.equal(s.root.hasPointerCapture(7), false);
  assert.equal(s.controller.getMode(), 'partial');
  assert.equal(s.changes.length, 0);
  assert.equal(s.drags.at(-1).offsetY, 0);
  assert.equal(s.drags.at(-1).canceled, true);
  assert.equal(s.root.emit('click', {target: s.header}).defaultPrevented, false);
});

test('a new pointer interrupts an active drag cleanly and starts from the current mode', () => {
  const s = setup();
  s.pointer(s.header, 'pointerdown', {y: 100, id: 1});
  s.pointer(s.header, 'pointermove', {y: 50, id: 1});
  s.pointer(s.header, 'pointerdown', {y: 100, id: 2});
  assert.equal(s.drags.at(-1).canceled, true);
  assert.equal(s.controller.getMode(), 'partial');
  s.pointer(s.header, 'pointermove', {y: 25, id: 2});
  s.pointer(s.header, 'pointerup', {y: 25, id: 2});
  assert.equal(s.controller.getMode(), 'expanded');
  assert.equal(s.changes.length, 1);
});

test('scrollable content keeps its own gesture until it reaches the relevant edge', () => {
  const s = setup();
  s.scroll.scrollTop = 80;
  s.pointer(s.scroll, 'pointerdown', {y: 100});
  const scrolling = s.pointer(s.scroll, 'pointermove', {y: 130});
  assert.equal(scrolling.defaultPrevented, false);
  s.pointer(s.scroll, 'pointerup', {y: 130});
  assert.equal(s.controller.getMode(), 'partial');
  assert.equal(s.drags.length, 0);

  s.scroll.scrollTop = 0;
  s.pointer(s.scroll, 'pointerdown', {y: 200});
  s.pointer(s.scroll, 'pointermove', {y: 210});
  const handedOff = s.pointer(s.scroll, 'pointermove', {y: 270});
  assert.equal(handedOff.defaultPrevented, true);
  s.pointer(s.scroll, 'pointerup', {y: 270});
  assert.equal(s.controller.getMode(), 'compact');
});

test('mode state and stable header listener survive content replacement; explicit actions work', () => {
  const s = setup();
  const selection = {placeId: '06075', metric: 'unemployment'};
  s.controller.setMode('expanded');
  const replacement = new FakeNode('DIV', s.content);
  s.content.children = [replacement];
  assert.equal(s.controller.getMode(), 'expanded');
  s.pointer(s.header, 'pointerdown', {y: 200});
  s.pointer(s.header, 'pointermove', {y: 270});
  s.pointer(s.header, 'pointerup', {y: 270});
  assert.equal(s.controller.getMode(), 'partial');
  s.root.emit('click', {target: s.action});
  assert.equal(s.controller.getMode(), 'expanded');
  assert.equal(s.changes.at(-1)[1].source, 'action');
  assert.deepEqual(selection, {placeId: '06075', metric: 'unemployment'});
});

test('snap distance, velocity, and mode boundaries are deterministic', () => {
  const s = setup({initialMode: 'partial'});
  s.pointer(s.header, 'pointerdown', {y: 100});
  s.pointer(s.header, 'pointermove', {y: 20, advance: 500});
  s.pointer(s.header, 'pointerup', {y: 20});
  assert.equal(s.controller.getMode(), 'expanded');

  s.pointer(s.header, 'pointerdown', {y: 20});
  s.pointer(s.header, 'pointermove', {y: 200, advance: 500});
  s.pointer(s.header, 'pointerup', {y: 200});
  assert.equal(s.controller.getMode(), 'compact');

  s.controller.setMode('compact');
  s.pointer(s.header, 'pointerdown', {y: 100});
  s.pointer(s.header, 'pointermove', {y: 120, advance: 10});
  s.pointer(s.header, 'pointerup', {y: 120});
  assert.equal(s.controller.getMode(), 'compact');

  s.controller.setMode('expanded');
  s.pointer(s.header, 'pointerdown', {y: 100});
  s.pointer(s.header, 'pointermove', {y: 80, advance: 10});
  s.pointer(s.header, 'pointerup', {y: 80});
  assert.equal(s.controller.getMode(), 'expanded');
});

test('map interaction delegates collapse to the integration callback', () => {
  const s = setup();
  s.controller.setMode('expanded');
  s.map.emit('pointerdown', {target: s.map});
  assert.equal(s.mapEvents[0][0], 'pointerdown');
  s.mapEvents[0][1].collapse();
  assert.equal(s.controller.getMode(), 'compact');
  assert.equal(s.changes.at(-1)[1].source, 'map-interaction');
});
