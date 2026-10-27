import React from 'react';
import { HELP } from '../../keybindings.js';
import { padEnd } from '../../utils/width.js';
import { Lines, type Line } from '../components/Lines.js';

export function Help({ width, height, hasToken, proxy, mouse, offset = 0 }: { offset?: number; width: number; height: number; hasToken: boolean; proxy?: string; mouse?: boolean }) {
  const lines: Line[] = [{ text: ' 快捷键帮助（? / Esc / q / 单击 关闭，↑↓ 滚动）', bold: true, color: 'greenBright' }, { text: '' }];
  let group = '';
  for (const [g, keys, desc] of HELP) {
    if (g !== group) {
      group = g;
      lines.push({ text: ` 【${g}】`, color: 'yellow' });
    }
    lines.push({ text: '   ' + padEnd(keys, 30) + desc });
  }
  lines.push({ text: '' });
  lines.push({ text: ` Token：${hasToken ? '已配置（通知 / 节点分页可用）' : '未配置（设置 V2EX_TOKEN 以启用通知和节点分页）'}`, dim: true });
  lines.push({ text: ` 鼠标：${mouse ? '已启用（--no-mouse 可关闭）' : '已关闭'}`, dim: true });
  lines.push({ text: ` 代理：${proxy ?? '未使用'}`, dim: true });
  const max = Math.max(0, lines.length - height);
  const o = Math.min(Math.max(0, offset), max);
  const view = lines.slice(o, o + height);
  if (max > 0 && o < max) view[height - 1] = { text: ' ↓ 更多（j / 滚轮 向下滚动）', color: 'yellow' };
  return <Lines lines={view} width={width} height={height} />;
}
