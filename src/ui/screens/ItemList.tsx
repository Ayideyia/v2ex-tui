import React from 'react';
import { Lines, type Line } from '../components/Lines.js';

export interface ListViewState {
  selected: number;
  offset: number;
}

export const ROWS_PER_ITEM = 2;

/** Keep the selected item visible; returns a new offset. */
export function clampOffset(selected: number, offset: number, visibleItems: number, total: number): number {
  let o = offset;
  if (selected < o) o = selected;
  if (selected >= o + visibleItems) o = selected - visibleItems + 1;
  return Math.max(0, Math.min(o, Math.max(0, total - visibleItems)));
}

export function ItemList<T>({
  items, state, width, height, render, empty,
}: {
  items: T[];
  state: ListViewState;
  width: number;
  height: number;
  render: (item: T, index: number, selected: boolean, width: number) => Line[];
  empty?: string;
}) {
  if (items.length === 0) {
    return <Lines lines={[{ text: '' }, { text: `  ${empty ?? '暂无内容'}`, dim: true }]} width={width} height={height} />;
  }
  const visible = Math.max(1, Math.floor(height / ROWS_PER_ITEM));
  const lines: Line[] = [];
  for (let i = state.offset; i < Math.min(items.length, state.offset + visible); i++) {
    lines.push(...render(items[i] as T, i, i === state.selected, width).slice(0, ROWS_PER_ITEM));
  }
  return <Lines lines={lines} width={width} height={height} />;
}
