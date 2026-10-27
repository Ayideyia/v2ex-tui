import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strWidth, truncate, wrapLine } from '../src/utils/width.js';
import { htmlToText } from '../src/utils/html.js';
import { filterNodes } from '../src/ui/screens/NodePicker.js';
import { relativeTime } from '../src/utils/time.js';

test('CJK aware width', () => {
  assert.equal(strWidth('abc'), 3);
  assert.equal(strWidth('中文'), 4);
  assert.equal(strWidth('V2EX 社区'), 9);
});

test('truncate respects display width', () => {
  assert.equal(truncate('你好世界', 5), '你好…');
  assert.ok(strWidth(truncate('创业一年了，还活着', 10)) <= 10);
});

test('wrapLine keeps lines within width', () => {
  const lines = wrapLine('这是一段很长的中文文本 with some English words mixed in 用来测试换行', 16);
  for (const l of lines) assert.ok(strWidth(l) <= 16, l);
  assert.equal(lines.join('').replace(/\s/g, ''), '这是一段很长的中文文本withsomeEnglishwordsmixedin用来测试换行');
});

test('htmlToText', () => {
  const t = htmlToText('<p>Hello &amp; <a href="/t/1">topic</a><br>line2</p><pre><code>a &lt; b</code></pre><img src="https://i.imgur.com/x.png">');
  assert.match(t, /Hello & topic \(https:\/\/www\.v2ex\.com\/t\/1\)/);
  assert.match(t, /line2/);
  assert.match(t, /│ a < b/);
  assert.match(t, /\[图片 https:\/\/i\.imgur\.com\/x\.png\]/);
});

test('filterNodes ranks exact/prefix matches first', () => {
  const nodes = [
    { id: 1, name: 'go', title: 'Go 编程语言', topics: 10 },
    { id: 2, name: 'programmer', title: '程序员', topics: 100 },
    { id: 3, name: 'google', title: 'Google', topics: 50 },
  ];
  assert.deepEqual(filterNodes(nodes, 'go').map((n) => n.name), ['go', 'google']);
  assert.deepEqual(filterNodes(nodes, '程序').map((n) => n.name), ['programmer']);
});

test('relativeTime', () => {
  const now = 1_700_000_000_000;
  assert.equal(relativeTime(now / 1000 - 30, now), '刚刚');
  assert.equal(relativeTime(now / 1000 - 3 * 3600, now), '3 小时前');
});

test('gridLayout / gridMove', async () => {
  const { gridLayout, gridMove } = await import('../src/ui/screens/NodePicker.js');
  assert.deepEqual(gridLayout(100), { cols: 5, cellW: 19 });
  assert.deepEqual(gridLayout(160), { cols: 8, cellW: 19 });
  assert.deepEqual(gridLayout(20), { cols: 1, cellW: 19 });
  // 12 items, 5 cols: rows [0-4] [5-9] [10-11]
  assert.equal(gridMove(7, 12, 5, 'down'), 11); // partial last row -> its last cell
  assert.equal(gridMove(10, 12, 5, 'down'), 10);
  assert.equal(gridMove(2, 12, 5, 'up'), 2);
  assert.equal(gridMove(4, 12, 5, 'right'), 5);
  assert.equal(gridMove(0, 12, 5, 'left'), 0);
  assert.equal(gridMove(11, 12, 5, 'right'), 11);
  assert.equal(gridMove(1, 12, 5, 'pageDown', 2), 11);
  assert.equal(gridMove(8, 12, 5, 'pageUp', 1), 3);
  assert.equal(gridMove(0, 0, 5, 'down'), 0);
});
