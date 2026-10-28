import React from 'react';
import { render } from 'ink';
import { writeSync } from 'node:fs';
import { V2exClient } from './api/client.js';
import { CONFIG_PATH, loadConfig } from './config.js';
import { HELP } from './keybindings.js';
import { App } from './ui/App.js';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

function usage(): string {
  return [
    `v2ex-tui ${VERSION} — 终端里的 V2EX 客户端`,
    '',
    '用法：node v2ex.js [选项]',
    '',
    '选项：',
    '  -n, --node <name>   启动后直接进入某个节点，如 --node programmer',
    '      --no-mouse      禁用鼠标支持（也可设 V2EX_NO_MOUSE=1 或配置 "mouse": false）',
    '  -h, --help          显示帮助',
    '  -v, --version       显示版本',
    '',
    '环境变量：',
    '  V2EX_TOKEN          V2EX 个人访问令牌（启用通知、节点分页）',
    '  HTTPS_PROXY 等      HTTP(S) 代理，如 http://127.0.0.1:7890',
    '  V2EX_TIMEOUT        请求超时毫秒数（默认 15000）',
    '  V2EX_NO_MOUSE=1     禁用鼠标',
    '',
    `配置文件：${CONFIG_PATH}  例如 {"token":"xxx","proxy":"http://127.0.0.1:7890"}`,
    '',
    '快捷键：',
    ...HELP.map(([g, k, d]) => `  [${g}] ${k.padEnd(28)} ${d}`),
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  let initialNode: string | undefined;
  let noMouse = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') { console.log(usage()); return; }
    if (a === '-v' || a === '--version') { console.log(VERSION); return; }
    if (a === '--no-mouse') noMouse = true;
    else if (a === '-n' || a === '--node') initialNode = args[++i];
    else if (a?.startsWith('--node=')) initialNode = a.slice(7);
    else { console.error(`未知参数：${a}\n\n${usage()}`); process.exitCode = 1; return; }
  }

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) {
    console.error(`需要 Node.js 18 或更高版本（当前 ${process.version}）`);
    process.exitCode = 1;
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('v2ex-tui 需要在交互式终端（TTY）中运行。');
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  if (noMouse) config.mouse = false;
  const client = new V2exClient(config);

  // xterm SGR mouse: 1000 = press/release + wheel, 1006 = SGR extended coordinates
  const MOUSE_ON = '\x1b[?1000h\x1b[?1006h';
  const MOUSE_OFF = '\x1b[?1006l\x1b[?1002l\x1b[?1000l';
  // bracketed paste, so pasted text (e.g. right-click paste) is never read as hotkeys
  const PASTE_ON = '\x1b[?2004h';
  const PASTE_OFF = '\x1b[?2004l';
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try {
      // writeSync so it still reaches the terminal from 'exit' / crash handlers
      writeSync(1, (config.mouse ? MOUSE_OFF : '') + PASTE_OFF + '\x1b[?1049l\x1b[?25h');
    } catch {
      /* terminal already gone */
    }
    try {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    } catch {
      /* ignore */
    }
  };
  process.stdout.write('\x1b[?1049h\x1b[H\x1b[2J\x1b[?25l' + PASTE_ON + (config.mouse ? MOUSE_ON : ''));
  process.on('exit', restore);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => { restore(); process.exit(128 + (sig === 'SIGINT' ? 2 : sig === 'SIGTERM' ? 15 : 1)); });
  }
  const crash = (e: unknown) => {
    restore();
    console.error('v2ex-tui 崩溃了：', e);
    process.exit(1);
  };
  process.on('uncaughtException', crash);
  process.on('unhandledRejection', crash);

  const app = render(<App client={client} initialNode={initialNode} mouse={config.mouse} />, { exitOnCtrlC: false });
  app.waitUntilExit().then(
    () => { restore(); process.exit(0); },
    (e: Error) => crash(e),
  );
}

main();
