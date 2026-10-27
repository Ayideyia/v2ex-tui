import React from 'react';
import { Box, Text } from 'ink';
import { padEnd, truncate } from '../../utils/width.js';

export interface Line {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
}

/** Render exactly `height` lines, each truncated/padded to `width` (stable full-screen layout). */
export function Lines({ lines, width, height }: { lines: Line[]; width: number; height: number }) {
  const out: Line[] = lines.slice(0, height);
  while (out.length < height) out.push({ text: '' });
  return (
    <Box flexDirection="column" width={width} height={height}>
      {out.map((l, i) => (
        <Text key={i} color={l.color} bold={l.bold} dimColor={l.dim} inverse={l.inverse} wrap="truncate">
          {padEnd(truncate(l.text, width), l.inverse ? width : 0) || ' '}
        </Text>
      ))}
    </Box>
  );
}
