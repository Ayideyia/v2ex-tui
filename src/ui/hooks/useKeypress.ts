import { useEffect, useRef } from 'react';
import { useStdin } from 'ink';
import { KeyParser, type KeyPress } from '../../utils/keys.js';

const ESC_TIMEOUT_MS = 40;

/**
 * The single keyboard/mouse input subscription for the whole app.
 *
 * IMPORTANT: mount this exactly once (in the root component) and keep it mounted.
 * Ink switches raw mode off and calls stdin.pause() whenever its raw-mode reference
 * count drops to 0, then back on when it rises again. Toggling that while a screen
 * opens/closes (as separate per-screen input hooks did) can leave stdin dead on
 * Windows ConPTY (VS Code terminal, Windows Terminal) — the app looks frozen.
 * Screens receive keys by routing from the root instead.
 */
export function useKeypress(handler: (k: KeyPress) => void) {
  const { stdin, setRawMode, isRawModeSupported } = useStdin();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!stdin) return;
    if (isRawModeSupported) setRawMode(true);
    const parser = new KeyParser();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dispatch = (keys: KeyPress[]) => {
      for (const k of keys) {
        try {
          ref.current(k);
        } catch {
          /* a failing handler must never kill the input loop */
        }
      }
    };
    const onData = (data: Buffer | string) => {
      if (timer) clearTimeout(timer);
      dispatch(parser.feed(String(data)));
      if (parser.hasPending) timer = setTimeout(() => dispatch(parser.flush()), ESC_TIMEOUT_MS);
    };
    stdin.on('data', onData);
    return () => {
      if (timer) clearTimeout(timer);
      stdin.off('data', onData);
      if (isRawModeSupported) setRawMode(false);
    };
    // mount once for the app lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stdin]);
}
