import React from 'react';
import { Box, Text } from 'ink';
import { strWidth, truncate } from '../../utils/width.js';

export interface Status {
  text: string;
  kind?: 'info' | 'error' | 'loading';
}

export function StatusBar({ status, hint, width }: { status?: Status; hint: string; width: number }) {
  const color = status?.kind === 'error' ? 'red' : status?.kind === 'loading' ? 'yellow' : 'green';
  const icon = status?.kind === 'loading' ? '⏳ ' : status?.kind === 'error' ? '✖ ' : '✔ ';
  const room = Math.max(0, width - 1);
  // status message has priority (errors must be readable); the hint gets what is left
  const left = status ? truncate(icon + status.text, room) : '';
  const rest = room - strWidth(left) - (left ? 3 : 0);
  const right = rest >= 8 ? truncate(hint, rest) : '';
  return (
    <Box width={width}>
      <Text color={color} wrap="truncate">{left}</Text>
      {right ? <Text dimColor wrap="truncate">{(left ? ' │ ' : '') + right}</Text> : null}
    </Box>
  );
}
