import { spawn, type SpawnOptions } from 'node:child_process';

/** Open a URL in the default browser without blocking or attaching to our TTY. */
export function openInBrowser(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return Promise.reject(new Error('invalid url'));
  let cmd: string;
  let args: string[];
  const opts: SpawnOptions = { stdio: 'ignore', detached: process.platform !== 'win32', windowsHide: true };
  if (process.platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (process.platform === 'win32') {
    // `start` is a cmd builtin; the empty "" is the window title. Verbatim args so Node
    // does not re-quote them, and ^-escape cmd metacharacters in the URL.
    cmd = process.env.ComSpec || 'cmd.exe';
    args = ['/d', '/s', '/c', `start "" "${url.replace(/[&^|<>%]/g, '^$&')}"`];
    opts.windowsVerbatimArguments = true;
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), 3000);
    try {
      const child = spawn(cmd, args, opts);
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('spawn', () => { clearTimeout(timer); child.unref(); resolve(); });
    } catch (e) {
      clearTimeout(timer);
      reject(e as Error);
    }
  });
}
