import type { KeyPress } from './utils/keys.js';

export type Action =
  | 'up' | 'down' | 'top' | 'bottom'
  | 'pageUp' | 'pageDown' | 'halfUp' | 'halfDown'
  | 'open' | 'back' | 'backOrQuit' | 'quit' | 'refresh' | 'browser' | 'help'
  | 'nextTab' | 'prevTab' | 'tab1' | 'tab2' | 'tab3' | 'tab4'
  | 'nodePicker' | 'nextPage' | 'prevPage' | 'nextReply' | 'prevReply';

/** Map a raw ink keypress to a semantic action. */
export function resolveAction(k: KeyPress): Action | undefined {
  const { input } = k;
  // pasted text is never a command
  if (k.name === 'paste') return undefined;
  if (k.ctrl) {
    switch (input) {
      case 'c': return 'quit';
      case 'd': return 'halfDown';
      case 'u': return 'halfUp';
      case 'f': return 'pageDown';
      case 'b': return 'pageUp';
      case 'n': return 'down';
      case 'p': return 'up';
      case 'r': return 'refresh';
      default: return undefined;
    }
  }
  if (k.meta) return undefined;
  switch (k.name) {
    case 'up': return 'up';
    case 'down': return 'down';
    case 'pageup': return 'pageUp';
    case 'pagedown': return 'pageDown';
    case 'home': return 'top';
    case 'end': return 'bottom';
    case 'return': return 'open';
    case 'escape': return 'back';
    case 'backspace': return 'back';
    case 'tab': return k.shift ? 'prevTab' : 'nextTab';
    case 'left': return 'back';
    case 'right': return 'open';
    default: break;
  }
  switch (input) {
    case 'g': return 'top';
    case 'G': return 'bottom';
    case ' ': case 'f': return 'pageDown';
    case 'b': return 'pageUp';
    case 'd': return 'halfDown';
    case 'u': return 'halfUp';
    case 'l': return 'open';
    case 'h': return 'back';
    case 'q': return 'backOrQuit';
    case 'Q': return 'quit';
    case 'r': return 'refresh';
    case 'o': return 'browser';
    case '?': return 'help';
    case 'H': return 'prevTab';
    case 'L': return 'nextTab';
    case '1': return 'tab1';
    case '2': return 'tab2';
    case '3': return 'tab3';
    case '4': return 'tab4';
    case '/': case 's': return 'nodePicker';
    case ']': return 'nextPage';
    case '[': return 'prevPage';
    case 'n': return 'nextReply';
    case 'N': return 'prevReply';
    default: return undefined;
  }
}

/** Help text shown in the overlay and README. [keys, description] */
export const HELP: Array<[string, string, string]> = [
  ['通用', '?', '显示 / 关闭帮助'],
  ['通用', 'Tab / Shift-Tab, H / L', '切换标签页（热门 / 最新 / 节点 / 通知）'],
  ['通用', '1 2 3 4', '直接跳到对应标签页'],
  ['通用', 'r / Ctrl-R', '刷新当前页面'],
  ['通用', 'o', '在浏览器中打开当前主题'],
  ['通用', 'Esc / q / h / ← / Backspace', '返回上一级（主题 → 节点主题列表 → 节点选择）'],
  ['通用', 'q（在热门 / 最新列表）', '退出'],
  ['通用', 'Q / Ctrl-C', '直接退出（任何界面）'],
  ['移动', '↓ / ↑, Ctrl-N / Ctrl-P', '下移 / 上移'],
  ['移动', 'g / G, Home / End', '跳到顶部 / 底部'],
  ['移动', 'Space / f / PgDn, b / PgUp', '下一屏 / 上一屏'],
  ['移动', 'd / u (Ctrl-D / Ctrl-U)', '下半屏 / 上半屏'],
  ['列表', 'Enter / l / →', '打开主题'],
  ['列表', '/ 或 s，或再次点 / 按「节点」标签', '回到节点选择（保留上次的过滤和位置）'],
  ['列表', '] / [', '节点下一页 / 上一页（需要 Token）'],
  ['主题', 'n / N', '跳到下一条 / 上一条回复'],
  ['节点选择', '输入文字', '按名称 / 中文名 / 别名过滤'],
  ['节点选择', '↑ ↓ ← → / Ctrl-P Ctrl-N', '在网格中移动（← → 跨行）'],
  ['节点选择', 'PgUp / PgDn, Home / End', '翻页 / 第一个 / 最后一个'],
  ['节点选择', 'Enter / Esc', '进入节点 / 回到热门（此处字母会输入到过滤框，用 Ctrl-C 退出）'],
  ['鼠标', '滚轮', '在列表 / 主题 / 节点选择中滚动'],
  ['鼠标', '单击 / 再次单击或双击', '选中 / 打开（主题、节点）'],
  ['鼠标', '单击顶部标签', '切换标签页'],
  ['鼠标', '右键 / 点右上角 [‹ 返回]', '返回上一级'],
];
