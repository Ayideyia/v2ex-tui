/** CJK / emoji aware terminal width helpers (no deps). */

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

function isZero(cp: number): boolean {
  return (
    cp === 0x200b || cp === 0x200d || cp === 0xfeff ||
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp < 0x20 || (cp >= 0x7f && cp < 0xa0)
  );
}

export function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (isZero(cp)) return 0;
  return isWide(cp) ? 2 : 1;
}

export function strWidth(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) w += charWidth(ch);
  return w;
}

/** Truncate to max display width, appending an ellipsis when cut. */
export function truncate(s: string, max: number, ellipsis = '…'): string {
  if (max <= 0) return '';
  if (strWidth(s) <= max) return s;
  const target = max - strWidth(ellipsis);
  let w = 0;
  let out = '';
  for (const ch of s) {
    const cw = charWidth(ch);
    if (w + cw > target) break;
    out += ch;
    w += cw;
  }
  return out + ellipsis;
}

export function padEnd(s: string, width: number): string {
  const w = strWidth(s);
  return w >= width ? s : s + ' '.repeat(width - w);
}

/**
 * Wrap a single paragraph (no newlines) to the given width.
 * Latin words are kept together where possible; CJK may break anywhere.
 */
export function wrapLine(line: string, width: number): string[] {
  if (width <= 0) return [line];
  if (line === '') return [''];
  const out: string[] = [];
  // tokens: runs of non-space latin chars, single wide chars, or spaces
  const tokens = line.match(/[\u0021-\u007e\u00a0-\u02ff]+|\s+|[^\s]/gu) ?? [];
  let cur = '';
  let curW = 0;
  const push = () => {
    out.push(cur.replace(/\s+$/, ''));
    cur = '';
    curW = 0;
  };
  for (const tok of tokens) {
    const tw = strWidth(tok);
    if (/^\s+$/.test(tok)) {
      if (curW === 0 && out.length > 0) continue; // drop leading space after wrap
      if (curW + tw > width) { push(); continue; }
      cur += tok; curW += tw;
      continue;
    }
    if (curW + tw <= width) { cur += tok; curW += tw; continue; }
    if (tw <= width && curW > 0) { push(); cur = tok; curW = tw; continue; }
    // hard-break long token
    for (const ch of tok) {
      const cw = charWidth(ch);
      if (curW + cw > width) push();
      cur += ch; curW += cw;
    }
  }
  if (cur !== '' || out.length === 0) push();
  return out;
}

export function wrapText(text: string, width: number): string[] {
  return text.split('\n').flatMap((l) => wrapLine(l, width));
}
