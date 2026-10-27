import { useEffect, useState } from 'react';
import { useStdout } from 'ink';

export function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  const get = () => ({ columns: stdout?.columns || 80, rows: stdout?.rows || 24 });
  const [size, setSize] = useState(get);
  useEffect(() => {
    if (!stdout) return;
    const onResize = () => setSize(get());
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  return size;
}
