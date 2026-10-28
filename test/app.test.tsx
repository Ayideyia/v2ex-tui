/**
 * Integration test: renders the real <App> with a fake TTY and a mock API client,
 * drives it with raw terminal input, and checks the 节点 flow never toggles raw mode
 * (the cause of the "选节点后卡死" freeze on Windows ConPTY) and keeps responding.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import React from 'react';
import { render } from 'ink';
import { App } from '../src/ui/App.js';
import type { V2exClient } from '../src/api/client.js';
import type { NodeInfo, Topic } from '../src/api/types.js';
import { stripAnsi } from '../src/utils/width.js';

class FakeStdin extends EventEmitter {
  isTTY = true;
  rawCalls: boolean[] = [];
  pauses = 0;
  setRawMode(v: boolean) { this.rawCalls.push(v); return this; }
  setEncoding() { return this; }
  resume() { return this; }
  pause() { this.pauses++; return this; }
  ref() { return this; }
  unref() { return this; }
  read() { return null; }
}

class FakeStdout extends EventEmitter {
  columns = 100;
  rows = 30;
  isTTY = true;
  frames: string[] = [];
  write(s: string) { this.frames.push(s); return true; }
  get last() { return stripAnsi(this.frames.join('')).split('\x1b').join(''); }
}

const topic = (id: number, title: string, node: string): Topic => ({
  id, title, url: `https://www.v2ex.com/t/${id}`, content: 'body', content_rendered: '<p>正文 ' + id + '</p>',
  replies: 1, created: Math.floor(Date.now() / 1000) - 60, node: { id: 1, name: node, title: node }, member: { id: 1, username: 'u' },
});

const nodes: NodeInfo[] = Array.from({ length: 1379 }, (_, i) => ({ id: i, name: i === 0 ? 'go' : `n${i}`, title: i === 0 ? 'Go 编程语言' : `节点${i}`, topics: 2000 - i }));

function mockClient(): V2exClient {
  return {
    hasToken: false,
    http: { lastRateLimit: {}, proxyInUse: undefined },
    topicUrl: (id: number) => `https://www.v2ex.com/t/${id}`,
    nodeUrl: (n: string) => `https://www.v2ex.com/go/${n}`,
    hot: async () => [topic(1, '热门主题一', 'qna'), topic(2, '热门主题二', 'qna')],
    latest: async () => [topic(3, '最新主题', 'qna')],
    allNodes: async () => nodes,
    nodeTopics: async (name: string) => ({ items: [topic(10, `${name} 节点主题A`, name), topic(11, `${name} 节点主题B`, name)], page: 1, totalPages: 1 }),
    topic: async (id: number) => topic(id, 'x', 'go'),
    replies: async () => [{ id: 1, content: 'r', content_rendered: '一楼回复', created: 0, member: { id: 2, username: 'replier' } }],
    notifications: async () => ({ items: [], page: 1 }),
  } as unknown as V2exClient;
}

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const inst = render(<App client={mockClient()} />, {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    debug: true, // every frame is written in full
    exitOnCtrlC: false,
    patchConsole: false,
  });
  await tick();
  const send = async (s: string) => { stdin.emit('data', s); await tick(); };
  const frame = () => stripAnsi(stdout.frames[stdout.frames.length - 1] ?? '');
  return { stdin, stdout, inst, send, frame };
}

test('节点: select a node (Windows CRLF Enter), raw mode is never toggled, app stays responsive', async () => {
  const { stdin, inst, send, frame } = await setup();
  assert.match(frame(), /热门主题一/);

  await send('3'); // switch to 节点 -> picker opens automatically
  assert.match(frame(), /选择节点/);
  await send('go\r\n'); // filter + Windows Enter
  assert.match(frame(), /节点 › Go 编程语言（go）/);
  assert.match(frame(), /go 节点主题A/);

  // still responsive: move + open + back
  await send('\x1b[B');
  assert.match(frame(), /▶\s+2\. go 节点主题B/);
  await send('\r');
  assert.match(frame(), /主题 #11/);
  await send('q');
  assert.match(frame(), /go 节点主题B/);

  // second node via arrows, scrolling far down the full 1379-node list
  await send('/');
  assert.match(frame(), /选择节点 › go/); // filter kept
  await send('\x15'); // Ctrl-U clears it
  await send('\x1b[F'); // End
  assert.match(frame(), /节点1378/);
  await send('\x1b[13;28;13;1;0;1_\x1b[13;28;13;0;0;1_'); // Enter as win32-input-mode record
  assert.match(frame(), /节点 › 节点1378/);

  // Tab / H / L switching and back to node tab
  await send('\t');
  await send('H');
  await send('L');
  await send('1');
  assert.match(frame(), /热门主题一/);

  // The fix: input is subscribed once; raw mode switched on exactly once, never off, stdin never paused.
  assert.deepEqual(stdin.rawCalls, [true]);
  assert.equal(stdin.pauses, 0);
  inst.unmount();
});

test('mouse: tabs, list click/double click, wheel, right-click back, picker clicks never type into the filter', async () => {
  const { inst, send, frame } = await setup();
  // click tab "2.最新": tabs start after " V2EX " (6 cols) -> " 1.热门 " cols 7-13, " 2.最新 " cols 14-20
  await send('\x1b[<0;16;1M\x1b[<0;16;1m');
  assert.match(frame(), /最新主题/);
  await send('\x1b[<0;9;1M');
  assert.match(frame(), /热门主题一/);
  // click 2nd item (rows 4-5), then click again -> opens
  await send('\x1b[<0;10;4M');
  assert.match(frame(), /▶\s+2\. 热门主题二/);
  await send('\x1b[<0;10;4M');
  assert.match(frame(), /主题 #2/);
  await send('\x1b[<65;10;10M\x1b[<65;10;10M\x1b[<64;10;10M'); // wheel in topic
  await send('\x1b[<2;10;10M'); // right click -> back
  assert.match(frame(), /热门主题二/);
  // wheel in list
  await send('\x1b[<64;10;10M');
  assert.match(frame(), /▶\s+1\. 热门主题一/);
  // picker: mouse events must not leak into filter text; click a row then click again to pick
  await send('/');
  // grid at 100 cols: 5 columns x 19 wide; x=30 is column 2 -> node #2 (节点1), go is #1
  await send('\x1b[<0;30;5M\x1b[<0;30;5m\x1b[I\x1b[O');
  assert.match(frame(), /选择节点 › \s/);
  assert.match(frame(), /▸节点1 /);
  await send('\x1b[<0;30;4M');
  assert.match(frame(), /节点 › 节点1（n1）/);
  inst.unmount();
});

test('right-click paste in a topic never triggers hotkeys or switches to 节点', async () => {
  const { inst, send, frame } = await setup();
  await send('\x1b[<0;10;4M');
  await send('\x1b[<0;10;4M');
  assert.match(frame(), /主题 #2/);
  // a terminal that pastes on right-click: the mouse report plus a bracketed paste of a URL
  // ("s" in "https" used to open the node picker and the rest landed in its filter)
  await send('\x1b[<2;10;10M\x1b[<2;10;10m\x1b[200~https://www.v2ex.com/t/1\x1b[201~');
  assert.doesNotMatch(frame(), /选择节点/);
  assert.match(frame(), /热门主题二/);
  // a paste split across chunks is still treated as one paste
  await send('\x1b[<0;10;4M');
  assert.match(frame(), /主题 #2/);
  await send('\x1b[200~3 s/');
  await send('q?\x1b[201~');
  assert.match(frame(), /主题 #2/);
  assert.doesNotMatch(frame(), /选择节点/);
  // in the picker a paste goes into the filter as text
  await send('/');
  await send('\x1b[200~n13\r\n\x1b[201~');
  assert.match(frame(), /选择节点 › n13 /);
  inst.unmount();
});

/** 3 -> filter "n13" -> move down twice -> Enter. Returns the picker frame's selected row to compare later. */
async function enterGoNode() {
  const ctx = await setup();
  await ctx.send('3');
  await ctx.send('n13');
  await ctx.send('\x1b[B\x1b[B');
  const selRow = '▸' + /▸(节点\d+)/.exec(ctx.frame())![1]! + ' '; // selected grid cell
  const name = 'n' + /\d+/.exec(selRow)![0];
  await ctx.send('\r');
  assert.match(ctx.frame(), new RegExp(`节点 › 节点\\d+（${name}）`));
  assert.match(ctx.frame(), /\[‹ 返回\]/);
  assert.match(ctx.frame(), /Esc 返回节点列表/);
  assert.match(ctx.frame(), new RegExp(`${name} 节点主题A`));
  return { ...ctx, selRow, name };
}

test('back from a node: Esc returns to the picker with filter + selection kept', async () => {
  const { inst, send, frame, selRow, name } = await enterGoNode();
  const isPickerWithGo = (f: string) => /选择节点 › n13 /.test(f) && f.includes(selRow);
  await send('\x1b');
  await tick(80); // lone ESC is resolved after the 40ms hold
  assert.ok(isPickerWithGo(frame()), frame());
  // and Enter goes straight back into the same node
  await send('\r');
  assert.match(frame(), new RegExp(`${name} 节点主题A`));
  inst.unmount();
});

test('back from a node: q goes back instead of quitting; q on 热门 quits', async () => {
  const { inst, send, frame, selRow, name } = await enterGoNode();
  const isPickerWithGo = (f: string) => /选择节点 › n13 /.test(f) && f.includes(selRow);
  let exited = false;
  void inst.waitUntilExit().then(() => { exited = true; });
  await send('q');
  assert.ok(isPickerWithGo(frame()), frame());
  assert.equal(exited, false);
  // in the picker q is just filter text
  await send('q');
  assert.match(frame(), /选择节点 › n13q/);
  assert.equal(exited, false);
  await send('\x1b'); await tick(80); // Esc in picker -> 热门
  assert.match(frame(), /热门主题一/);
  await send('q');
  await tick();
  assert.equal(exited, true);
});

test('navigation stack: topic -> back -> node list (selection kept) -> back -> picker', async () => {
  const { inst, send, frame, selRow, name } = await enterGoNode();
  const isPickerWithGo = (f: string) => /选择节点 › n13 /.test(f) && f.includes(selRow);
  await send('\x1b[B');
  await send('\r');
  assert.match(frame(), /主题 #11/);
  assert.match(frame(), new RegExp(`（${name}） › 主题 #11`));
  await send('h');
  assert.match(frame(), new RegExp(`▶\\s+2\\. ${name} 节点主题B`));
  await send('\x7f'); // Backspace
  assert.ok(isPickerWithGo(frame()), frame());
  // digits type into the filter in the picker; Esc leaves it for 热门, where ← / h do nothing (no quit)
  await send('\x1b'); await tick(80);
  await send('\x1b[D');
  await send('h');
  assert.match(frame(), /热门主题一/);
  // clicking the active 节点 tab returns to the picker; switching tabs keeps each tab's stack
  await send('3'); // node tab still at picker
  await send('\r');
  assert.match(frame(), new RegExp(`${name} 节点主题A`));
  await send('1');
  await send('3');
  assert.match(frame(), new RegExp(`${name} 节点主题A`)); // node tab kept its stack
  await send('\x1b[<0;24;1M'); // click " 3.节点 " (cols 21-27) while on it
  assert.ok(isPickerWithGo(frame()), frame());
  inst.unmount();
});

test('back from a node: right-click, [‹ 返回] click, win32-input Esc and Backspace', async () => {
  const { inst, send, frame, selRow, name } = await enterGoNode();
  const isPickerWithGo = (f: string) => /选择节点 › n13 /.test(f) && f.includes(selRow);
  await send('\x1b[<2;10;6M'); // right click
  assert.ok(isPickerWithGo(frame()), frame());

  await send('\r');
  const header = frame().split('\n')[0]!;
  const col = header.indexOf('[‹ 返回]'); // ASCII/narrow before it except tab labels
  assert.ok(col > 0);
  await send('\x1b[<0;80;1M'); // within the right-hand header ("[‹ 返回]  节点 › …")
  assert.ok(isPickerWithGo(frame()), frame());

  await send('\r');
  await send('\x1b[27;1;27;1;0;1_\x1b[27;1;27;0;0;1_'); // Esc as win32-input-mode key down + up
  assert.ok(isPickerWithGo(frame()), frame());

  await send('\r');
  await send('\x1b[8;14;8;1;0;1_\x1b[8;14;8;0;0;1_'); // Backspace as win32-input-mode
  assert.ok(isPickerWithGo(frame()), frame());

  await send('\r');
  await send('\b'); // Ctrl-H style backspace
  assert.ok(isPickerWithGo(frame()), frame());
  inst.unmount();
});

const selected = (f: string) => /▸(Go 编程语言|节点\d+)/.exec(f)?.[1];

test('node grid: arrows move across columns/rows, wrap, PgDn/End/Home, Ctrl-N/P', async () => {
  const { inst, send, frame } = await setup();
  await send('3');
  // 100 cols -> 5 columns; order: go, 节点1, 节点2, ... (by topic count)
  assert.match(frame(), /▸Go 编程语言/);
  await send('\x1b[C'); assert.equal(selected(frame()), '节点1');
  await send('\x1b[B'); assert.equal(selected(frame()), '节点6'); // down = +5
  await send('\x1b[C\x1b[C\x1b[C'); assert.equal(selected(frame()), '节点9'); // end of row 2
  await send('\x1b[C'); assert.equal(selected(frame()), '节点10'); // wraps to next row
  await send('\x1b[D'); assert.equal(selected(frame()), '节点9'); // wraps back
  await send('\x1b[A'); assert.equal(selected(frame()), '节点4');
  await send('\x0e'); assert.equal(selected(frame()), '节点9'); // Ctrl-N
  await send('\x10'); assert.equal(selected(frame()), '节点4'); // Ctrl-P
  await send('\x1b[6~'); // PgDn: 30 rows -> height 29 -> body 27 -> (27-2)/2 = 12 grid rows
  assert.equal(selected(frame()), '节点64');
  assert.match(frame(), /第 13\/276 行/);
  await send('\x1b[F'); assert.equal(selected(frame()), '节点1378');
  await send('\x1b[H'); assert.equal(selected(frame()), 'Go 编程语言');
  // the header shows the count, and only visible rows are rendered
  assert.match(frame(), /共 1379 个节点/);
  assert.doesNotMatch(frame(), /节点70 /);
  inst.unmount();
});

test('node grid: resize recalculates columns and keeps the selection visible; clicks hit the right cell', async () => {
  const { inst, send, frame, stdout } = await setup();
  await send('3');
  await send('\x1b[C\x1b[B'); // 节点6 at 5 columns
  assert.equal(selected(frame()), '节点6');
  const cellsInFirstRow = () => frame().split('\n')[3]!.split(/(?=[ ▸](?:Go|节点\d))/).filter((c) => /Go|节点/.test(c)).length;
  assert.equal(cellsInFirstRow(), 5);
  stdout.columns = 160; stdout.emit('resize'); await tick();
  assert.equal(cellsInFirstRow(), 8); // 159 / 18 = 8 columns
  assert.equal(selected(frame()), '节点6');
  await send('\x1b[B'); assert.equal(selected(frame()), '节点14'); // down = +8 now
  // cellW = floor(159/8) = 19 -> column 3 spans x 39..57; row 2 of the grid is screen rows 6-7
  await send('\x1b[<0;45;7M');
  assert.equal(selected(frame()), '节点10');
  await send('\x1b[<0;45;6M'); // click the selected cell again -> open
  assert.match(frame(), /节点 › 节点10（n10）/);
  await send('\x1b'); await tick(80);
  stdout.columns = 40; stdout.emit('resize'); await tick();
  assert.equal(cellsInFirstRow(), 2);
  assert.equal(selected(frame()), '节点10'); // selection kept and scrolled into view
  // wheel scrolls rows
  await send('\x1b[<65;5;10M');
  assert.equal(selected(frame()), '节点10');
  inst.unmount();
});

test('j/k are no longer bindings (lists, topic); in the picker they are filter text', async () => {
  const { inst, send, frame } = await setup();
  assert.match(frame(), /▶\s+1\. 热门主题一/);
  await send('j');
  assert.match(frame(), /▶\s+1\. 热门主题一/);
  await send('\x1b[B');
  assert.match(frame(), /▶\s+2\. 热门主题二/);
  await send('k');
  assert.match(frame(), /▶\s+2\. 热门主题二/);
  await send('3');
  await send('jk');
  assert.match(frame(), /选择节点 › jk /);
  inst.unmount();
});
