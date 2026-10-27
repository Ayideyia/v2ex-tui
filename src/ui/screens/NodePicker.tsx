import React, { useMemo, useRef, type MutableRefObject } from 'react';
import { Box, Text } from 'ink';
import type { KeyPress } from '../../utils/keys.js';
import type { V2exClient } from '../../api/client.js';
import type { NodeInfo } from '../../api/types.js';
import { padEnd, strWidth, truncate } from '../../utils/width.js';
import { useAsync } from '../hooks/useAsync.js';
import { clampOffset } from './ItemList.js';

interface Props {
  client: V2exClient;
  width: number;
  height: number;
  onSelect: (n: NodeInfo) => void;
  onCancel: () => void;
  /** The root input hook routes key presses here while the picker is open. */
  keyRef: MutableRefObject<((k: KeyPress) => void) | null>;
  /** 1-based screen row where this component starts (for mouse hit-testing). */
  originY: number;
  /** Filter text + selection live in the parent so they survive going into a node and back. */
  state: PickerState;
  setState: (fn: (s: PickerState) => PickerState) => void;
}

export interface PickerState {
  query: string;
  /** index of the selected node in the filtered list */
  sel: number;
  /** first visible grid row */
  offset: number;
}

export const initialPickerState: PickerState = { query: '', sel: 0, offset: 0 };

export function filterNodes(nodes: NodeInfo[], query: string): NodeInfo[] {
  const q = query.trim().toLowerCase();
  // no filter: most popular nodes first
  if (!q) return [...nodes].sort((a, b) => (b.topics ?? 0) - (a.topics ?? 0));
  const scored: Array<[number, NodeInfo]> = [];
  for (const n of nodes) {
    const name = n.name.toLowerCase();
    const title = (n.title || '').toLowerCase();
    const alt = (n.title_alternative || '').toLowerCase();
    const aliases = (n.aliases || []).map((a) => a.toLowerCase());
    let score = -1;
    if (name === q || title === q) score = 0;
    else if (name.startsWith(q) || title.startsWith(q)) score = 1;
    else if (name.includes(q) || title.includes(q) || alt.includes(q) || aliases.some((a) => a.includes(q))) score = 2;
    if (score >= 0) scored.push([score, n]);
  }
  return scored.sort((a, b) => a[0] - b[0] || (b[1].topics ?? 0) - (a[1].topics ?? 0)).map((x) => x[1]);
}

/** Minimum display width of one grid cell. */
export const MIN_CELL_WIDTH = 18;
/** Screen rows per grid cell (title line + name/count line). */
export const CELL_ROWS = 2;

/** Grid geometry for a given terminal width: column count and the (equal) width of each cell. */
export function gridLayout(width: number): { cols: number; cellW: number } {
  const usable = Math.max(MIN_CELL_WIDTH, width - 1);
  const cols = Math.max(1, Math.floor(usable / MIN_CELL_WIDTH));
  return { cols, cellW: Math.floor(usable / cols) };
}

/** Keyboard movement inside the grid. Returns the new selected index. */
export function gridMove(sel: number, count: number, cols: number, move: 'up' | 'down' | 'left' | 'right' | 'pageUp' | 'pageDown' | 'home' | 'end', pageRows = 1): number {
  if (count <= 0) return 0;
  const last = count - 1;
  const clamp = (i: number) => Math.max(0, Math.min(last, i));
  switch (move) {
    case 'left': return clamp(sel - 1); // wraps to the end of the previous row
    case 'right': return clamp(sel + 1); // wraps to the start of the next row
    case 'up': return sel - cols >= 0 ? sel - cols : sel;
    case 'down': {
      if (sel + cols <= last) return sel + cols;
      // partial last row: drop onto its last cell, if there is a row below
      return Math.floor(last / cols) > Math.floor(sel / cols) ? last : sel;
    }
    case 'pageUp': {
      const r = Math.max(0, Math.floor(sel / cols) - pageRows);
      return clamp(r * cols + (sel % cols));
    }
    case 'pageDown': {
      const r = Math.floor(sel / cols) + pageRows;
      return clamp(r * cols + (sel % cols));
    }
    case 'home': return 0;
    case 'end': return last;
  }
}

/** Private-use glyphs (e.g. the Apple logo U+F8FF in " WATCH") render with different widths per terminal — drop them. */
const cleanTitle = (n: NodeInfo) => (n.title || n.name).replace(/[\uE000-\uF8FF]/g, '').trim() || n.name;

const fmtCount = (t = 0) => (t >= 10000 ? `${Math.round(t / 1000)}k` : String(t));

export function NodePicker({ client, width, height, onSelect, onCancel, keyRef, originY, state, setState }: Props) {
  const nodesQ = useAsync(() => client.allNodes(), []);
  const { query } = state;
  const filtered = useMemo(() => filterNodes(nodesQ.data ?? [], query), [nodesQ.data, query]);
  const { cols, cellW } = gridLayout(width);
  const visRows = Math.max(1, Math.floor((height - 2) / CELL_ROWS));
  const totalRows = Math.ceil(filtered.length / cols);
  const sel = Math.max(0, Math.min(filtered.length - 1, state.sel));
  // clamp at render time so a resize (column count change) always keeps the selection visible
  const offset = clampOffset(Math.floor(sel / cols), state.offset, visRows, totalRows);
  const lastClick = useRef<{ at: number; index: number }>({ at: 0, index: -1 });

  const select = (i: number, off = offset) =>
    setState((s) => ({ ...s, sel: i, offset: clampOffset(Math.floor(i / cols), off, visRows, totalRows) }));
  const go = (m: Parameters<typeof gridMove>[3]) => select(gridMove(sel, filtered.length, cols, m, visRows));
  const setQuery = (fn: (q: string) => string) => setState((s) => ({ query: fn(s.query), sel: 0, offset: 0 }));
  const pick = (i: number) => {
    const n = filtered[i];
    if (n) onSelect(n);
  };

  keyRef.current = (k: KeyPress) => {
    const { input } = k;
    if (k.mouse) {
      const m = k.mouse;
      if (m.wheel) {
        // scroll one grid row per wheel step, selection follows into view
        const off = Math.max(0, Math.min(Math.max(0, totalRows - visRows), offset + (m.wheel === 'down' ? 1 : -1)));
        const row = Math.max(off, Math.min(off + visRows - 1, Math.floor(sel / cols)));
        return select(Math.min(filtered.length - 1, row * cols + (sel % cols)), off);
      }
      if (!m.press || m.drag) return;
      if (m.button === 2) return onCancel();
      if (m.button !== 0) return;
      const index = cellAt(m.x, m.y);
      if (index < 0) return;
      const now = Date.now();
      const dbl = lastClick.current.index === index && now - lastClick.current.at < 450;
      lastClick.current = { at: now, index };
      if (index === sel || dbl) return pick(index);
      return select(index);
    }
    if (k.name === 'escape') return onCancel();
    if (k.name === 'return') return pick(sel);
    if (k.name === 'up' || (k.ctrl && input === 'p')) return go('up');
    if (k.name === 'down' || (k.ctrl && input === 'n')) return go('down');
    if (k.name === 'left') return go('left');
    if (k.name === 'right') return go('right');
    if (k.name === 'pagedown') return go('pageDown');
    if (k.name === 'pageup') return go('pageUp');
    if (k.name === 'home') return go('home');
    if (k.name === 'end') return go('end');
    if (k.name === 'backspace' || k.name === 'delete' || (k.ctrl && input === 'h')) {
      setQuery((q) => Array.from(q).slice(0, -1).join(''));
      return;
    }
    if (k.ctrl && input === 'u') return setQuery(() => '');
    if (input && !k.ctrl && !k.meta && !k.name) setQuery((q) => q + input);
  };

  /** 1-based screen coords -> node index, or -1. */
  function cellAt(x: number, y: number): number {
    const relY = y - originY - 2; // filter line + separator
    if (relY < 0) return -1;
    const row = Math.floor(relY / CELL_ROWS);
    const col = Math.floor((x - 1) / cellW);
    if (row >= visRows || col < 0 || col >= cols) return -1;
    const index = (offset + row) * cols + col;
    return index < filtered.length ? index : -1;
  }

  const listH = Math.max(1, height - 2);
  const rows: React.ReactNode[] = [];
  let message: string | undefined;
  let messageColor: string | undefined;
  if (nodesQ.loading && !nodesQ.data) { message = '  正在加载节点列表（首次较慢，之后会缓存 24 小时）…'; messageColor = 'yellow'; }
  else if (nodesQ.error) { message = '  ✖ ' + nodesQ.error.message + '（Esc 返回后重试）'; messageColor = 'red'; }
  else if (filtered.length === 0) message = '  没有匹配的节点';
  if (message) rows.push(<Text key="msg" color={messageColor} dimColor={!messageColor} wrap="truncate">{message}</Text>);
  else {
    for (let r = offset; r < Math.min(totalRows, offset + visRows); r++) {
      const top: React.ReactNode[] = [];
      const bottom: React.ReactNode[] = [];
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const n = filtered[i];
        if (!n) break;
        const on = i === sel;
        const title = padEnd((on ? '▸' : ' ') + truncate(cleanTitle(n), cellW - 2), cellW - 1) + ' ';
        const count = fmtCount(n.topics);
        const nameW = Math.max(1, cellW - 3 - strWidth(count));
        const sub = padEnd(' ' + truncate(n.name, nameW) + ' ', cellW - 1 - strWidth(count)) + count + ' ';
        top.push(<Text key={c} inverse={on} color={on ? 'cyan' : undefined} bold>{title}</Text>);
        bottom.push(<Text key={c} inverse={on} color={on ? 'cyan' : undefined} dimColor={!on}>{sub}</Text>);
      }
      rows.push(<Text key={`${r}a`} wrap="truncate">{top}</Text>, <Text key={`${r}b`} wrap="truncate">{bottom}</Text>);
    }
  }
  while (rows.length < listH) rows.push(<Text key={`pad${rows.length}`}> </Text>);

  const total = nodesQ.data?.length;
  const countText = total === undefined ? '' : query ? `匹配 ${filtered.length} / 共 ${total}` : `共 ${total} 个节点 · 按热度排序`;
  const pos = filtered.length ? ` · 第 ${Math.floor(sel / cols) + 1}/${totalRows} 行` : '';

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Text wrap="truncate">
        <Text color="cyan" bold> 选择节点 › </Text>
        <Text>{query}</Text>
        <Text inverse> </Text>
        <Text dimColor>  {countText}{pos}</Text>
      </Text>
      <Text dimColor>{' ' + '─'.repeat(Math.max(0, width - 2))}</Text>
      <Box flexDirection="column" width={width} height={listH}>{rows.slice(0, listH)}</Box>
    </Box>
  );
}
