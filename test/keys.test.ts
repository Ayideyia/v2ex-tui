import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyParser, parseKeys, type KeyPress } from '../src/utils/keys.js';

const names = (ks: KeyPress[]) =>
  ks.map((k) => (k.mouse ? `mouse:${k.mouse.wheel ?? k.mouse.button}@${k.mouse.x},${k.mouse.y}${k.mouse.press ? '' : '^'}` : k.name ?? (k.ctrl ? 'C-' + k.input : k.input)));

test('CRLF Enter (Windows) is a single Enter', () => {
  assert.deepEqual(names(parseKeys('go\r\n')), ['g', 'o', 'return']);
  assert.deepEqual(names(parseKeys('\r')), ['return']);
  assert.deepEqual(names(parseKeys('\n')), ['return']);
});

test('arrows, paging, home/end, modifiers, shift-tab', () => {
  assert.deepEqual(names(parseKeys('\x1b[A\x1b[B\x1bOC\x1b[5~\x1b[6~\x1b[H\x1b[4~\x1b[1;5A\x1b[Z')),
    ['up', 'down', 'right', 'pageup', 'pagedown', 'home', 'end', 'up', 'tab']);
  const k = parseKeys('\x1b[1;5A')[0]!;
  assert.equal(k.ctrl, true);
});

test('win32-input-mode records decode to keys and key-ups are ignored', () => {
  // Enter down/up, 'a' down/up, Down arrow down
  const ks = parseKeys('\x1b[13;28;13;1;0;1_\x1b[13;28;13;0;0;1_\x1b[65;30;97;1;0;1_\x1b[65;30;97;0;0;1_\x1b[40;80;0;1;0;1_');
  assert.deepEqual(names(ks), ['return', 'a', 'down']);
  // bare Shift press produces nothing
  assert.deepEqual(names(parseKeys('\x1b[16;42;0;1;16;1_')), []);
});

test('focus events, bracketed paste markers and unknown CSI never leak as text', () => {
  assert.deepEqual(names(parseKeys('\x1b[I\x1b[O\x1b[200~go\x1b[201~\x1b[?1;2c\x1b[99x')), ['g', 'o']);
});

test('SGR mouse: click, release, wheel, right click', () => {
  assert.deepEqual(names(parseKeys('\x1b[<0;10;5M\x1b[<0;10;5m\x1b[<64;3;4M\x1b[<65;3;4M\x1b[<2;1;1M')),
    ['mouse:0@10,5', 'mouse:0@10,5^', 'mouse:up@3,4', 'mouse:down@3,4', 'mouse:2@1,1']);
});

test('legacy X10 mouse', () => {
  const s = '\x1b[M' + String.fromCharCode(32 + 0, 32 + 7, 32 + 3);
  assert.deepEqual(names(parseKeys(s)), ['mouse:0@7,3']);
});

test('escape handling: lone ESC, ESC+key', () => {
  assert.deepEqual(names(parseKeys('\x1b')), ['escape']);
  assert.deepEqual(names(parseKeys('\x1bq')), ['escape', 'q']);
});

test('stateful parser buffers split sequences and flushes lone ESC', () => {
  const p = new KeyParser();
  assert.deepEqual(names(p.feed('j\x1b[<0;1')), ['j']);
  assert.equal(p.hasPending, true);
  assert.deepEqual(names(p.feed('2;3M')), ['mouse:0@12,3']);
  assert.deepEqual(names(p.feed('\x1b')), []);
  assert.deepEqual(names(p.flush()), ['escape']);
  // junk never wedges the parser
  assert.deepEqual(names(p.feed('\x1b[' + '1;'.repeat(100))), []);
  assert.deepEqual(names(p.feed('k')), ['k']);
});

test('random garbage never throws', () => {
  for (let i = 0; i < 2000; i++) {
    let s = '';
    for (let j = 0; j < 12; j++) s += String.fromCharCode(Math.floor(Math.random() * 128));
    parseKeys(s);
    new KeyParser().feed(s);
  }
});

test('back keys: lone ESC, win32 Esc, Backspace variants all resolve to back', async () => {
  const { resolveAction } = await import('../src/keybindings.js');
  const names = (s: string) => parseKeys(s).map((k) => k.name);
  assert.deepEqual(names('\x1b[27;1;27;1;0;1_\x1b[27;1;27;0;0;1_'), ['escape']);
  assert.deepEqual(names('\x1b[8;14;8;1;0;1_\x1b[8;14;8;0;0;1_'), ['backspace']);
  assert.deepEqual(names('\x7f'), ['backspace']);
  assert.deepEqual(names('\b'), ['backspace']);
  for (const s of ['\x1b', '\x7f', '\b', '\x1b[D', 'h', '\x1b[27;1;27;1;0;1_']) {
    assert.equal(resolveAction(parseKeys(s)[0]!), 'back', JSON.stringify(s));
  }
  assert.equal(resolveAction(parseKeys('q')[0]!), 'backOrQuit');
  assert.equal(resolveAction(parseKeys('Q')[0]!), 'quit');
});
