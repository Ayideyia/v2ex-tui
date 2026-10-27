import React from 'react';
import { Box, Text } from 'ink';
import { strWidth } from '../../utils/width.js';

export interface TabDef {
  id: string;
  label: string;
}

const BRAND = ' V2EX ';
const tabText = (t: TabDef, i: number) => ` ${i + 1}.${t.label} `;

/** 1-based inclusive column ranges of each tab label (for mouse clicks). */
export function tabRanges(tabs: TabDef[]): Array<{ id: string; start: number; end: number }> {
  let x = strWidth(BRAND) + 1;
  return tabs.map((t, i) => {
    const w = strWidth(tabText(t, i));
    const r = { id: t.id, start: x, end: x + w - 1 };
    x += w;
    return r;
  });
}

export function TabBar({ tabs, active, right }: { tabs: TabDef[]; active: string; right?: string }) {
  return (
    <Box justifyContent="space-between">
      <Box>
        <Text bold color="greenBright">{BRAND}</Text>
        {tabs.map((t, i) => (
          <Text key={t.id} inverse={t.id === active} color={t.id === active ? 'cyan' : undefined} dimColor={t.id !== active}>
            {tabText(t, i)}
          </Text>
        ))}
      </Box>
      {right ? <Text dimColor wrap="truncate">{right} </Text> : null}
    </Box>
  );
}
