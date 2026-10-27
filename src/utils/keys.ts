/**
 * Robust terminal input parser.
 *
 * Handles: plain chars, control chars, CSI / SS3 sequences (arrows, PgUp/PgDn, Home/End, Shift-Tab),
 * Windows ConPTY "win32-input-mode" records (ESC [ Vk;Sc;Uc;Kd;Cs;Rc _), SGR (1006) and legacy X10
 * mouse reports, focus in/out, bracketed-paste markers, and CRLF Enter. Unknown sequences are dropped
 * (never leaked as text), and incomplete sequences at the end of a chunk are buffered until the next
 * chunk or a short timeout, so the parser can never wedge.
 */

export type KeyName =
  | 'up' | 'down' | 'left' | 'right' | 'pageup' | 'pagedown' | 'home' | 'end'
  | 'return' | 'escape' | 'tab' | 'backspace' | 'delete' | 'mouse';

export interface MouseEvent {
  /** 0 left, 1 middle, 2 right, 3 release (X10) */
  button: number;
  /** 1-based column / row */
  x: number;
  y: number;
  /** press (true) or release (false) */
  press: boolean;
  wheel?: 'up' | 'down';
  drag: boolean;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
}

export interface KeyPress {
  /** printable character (or the letter for ctrl combos) */
  input: string;
  name?: KeyName;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  mouse?: MouseEvent;
}

const FINAL_KEYS: Record<string, KeyName> = {
  A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end',
};
const TILDE_KEYS: Record<string, KeyName> = {
  '1': 'home', '7': 'home', '4': 'end', '8': 'end', '5': 'pageup', '6': 'pagedown', '3': 'delete', '2': 'delete',
};
// Windows virtual-key codes used by win32-input-mode
const VK_KEYS: Record<number, KeyName> = {
  8: 'backspace', 9: 'tab', 13: 'return', 27: 'escape', 33: 'pageup', 34: 'pagedown',
  35: 'end', 36: 'home', 37: 'left', 38: 'up', 39: 'right', 40: 'down', 46: 'delete',
};

const mk = (p: Partial<KeyPress>): KeyPress => ({ input: '', ctrl: false, meta: false, shift: false, ...p });

/** Modifier param in CSI 1;<m>X form: 1 + (shift 1 | alt 2 | ctrl 4) */
function applyMod(k: KeyPress, mod: number | undefined): KeyPress {
  if (!mod || mod < 2) return k;
  const m = mod - 1;
  k.shift = Boolean(m & 1);
  k.meta = Boolean(m & 2);
  k.ctrl = Boolean(m & 4);
  return k;
}

function charKey(ch: string): KeyPress | undefined {
  if (ch === '\r' || ch === '\n') return mk({ name: 'return' });
  if (ch === '\t') return mk({ name: 'tab' });
  if (ch === '\x7f' || ch === '\b') return mk({ name: 'backspace' });
  if (ch === '\x1b') return mk({ name: 'escape' });
  const code = ch.codePointAt(0) ?? 0;
  if (code === 0) return undefined;
  if (code < 0x20) return mk({ ctrl: true, input: String.fromCharCode(code + 96) });
  if (code >= 0x80 && code < 0xa0) return undefined; // C1 controls
  return mk({ input: ch, shift: ch !== ch.toLowerCase() });
}

function sgrMouse(params: string, final: string): KeyPress | undefined {
  const [b, x, y] = params.slice(1).split(';').map(Number);
  if (b === undefined || x === undefined || y === undefined || [b, x, y].some(Number.isNaN)) return undefined;
  return mouseFromCode(b, x, y, final === 'M');
}

function mouseFromCode(b: number, x: number, y: number, press: boolean): KeyPress {
  const ev: MouseEvent = {
    button: b & 3,
    x, y, press,
    drag: Boolean(b & 32),
    shift: Boolean(b & 4),
    meta: Boolean(b & 8),
    ctrl: Boolean(b & 16),
  };
  if (b & 64) ev.wheel = b & 1 ? 'down' : 'up';
  return mk({ name: 'mouse', mouse: ev });
}

function win32Key(params: string): KeyPress | undefined {
  // Vk;Sc;Uc;Kd;Cs;Rc  (all optional, default 0 / Rc 1)
  const [vk = 0, , uc = 0, kd = 0, cs = 0] = params.split(';').map((s) => (s === '' ? 0 : Number(s)));
  if (!kd) return undefined; // key-up
  const ctrl = Boolean(cs & 0x0c);
  const alt = Boolean(cs & 0x03);
  const shift = Boolean(cs & 0x10);
  if (vk === 16 || vk === 17 || vk === 18 || vk === 20 || vk === 91 || vk === 92) return undefined; // bare modifiers
  const named = VK_KEYS[vk];
  if (named) return mk({ name: named, shift, ctrl: false, meta: alt });
  if (uc > 0) {
    const ch = String.fromCodePoint(uc);
    const k = charKey(ch);
    if (k) return k;
  }
  if (ctrl && vk >= 65 && vk <= 90) return mk({ ctrl: true, input: String.fromCharCode(vk + 32) });
  return undefined;
}

export interface ParseResult {
  keys: KeyPress[];
  /** leftover bytes that may be the start of an escape sequence */
  rest: string;
}

/**
 * Parse as much of `buf` as possible. If `final` is false, an incomplete escape
 * sequence at the end is returned in `rest` instead of being emitted.
 */
export function parseChunk(buf: string, final = true): ParseResult {
  const keys: KeyPress[] = [];
  let i = 0;
  const n = buf.length;
  while (i < n) {
    const ch = buf[i]!;
    if (ch === '\r') {
      keys.push(mk({ name: 'return' }));
      i += buf[i + 1] === '\n' ? 2 : 1; // CRLF -> single Enter
      continue;
    }
    if (ch !== '\x1b') {
      const cp = buf.codePointAt(i)!;
      const s = String.fromCodePoint(cp);
      const k = charKey(s);
      if (k) keys.push(k);
      i += s.length;
      continue;
    }
    // ESC ...
    if (i + 1 >= n) {
      if (!final) return { keys, rest: buf.slice(i) };
      keys.push(mk({ name: 'escape' }));
      i++;
      continue;
    }
    const next = buf[i + 1]!;
    if (next === '[') {
      // legacy X10 mouse: ESC [ M b x y (3 raw bytes)
      if (buf[i + 2] === 'M' && (i + 3 >= n || !/[0-9;<]/.test(buf[i + 3]!))) {
        if (i + 6 > n) {
          if (!final) return { keys, rest: buf.slice(i) };
          i = n;
          continue;
        }
        const b = buf.charCodeAt(i + 3) - 32;
        keys.push(mouseFromCode(b, buf.charCodeAt(i + 4) - 32, buf.charCodeAt(i + 5) - 32, (b & 3) !== 3 || (b & 64) !== 0));
        i += 6;
        continue;
      }
      // CSI: params [0x30-0x3F]* intermediates [0x20-0x2F]* final [0x40-0x7E]
      let j = i + 2;
      while (j < n && buf.charCodeAt(j) >= 0x30 && buf.charCodeAt(j) <= 0x3f) j++;
      while (j < n && buf.charCodeAt(j) >= 0x20 && buf.charCodeAt(j) <= 0x2f) j++;
      if (j >= n) {
        if (!final) return { keys, rest: buf.slice(i) };
        i = n; // drop truncated garbage
        continue;
      }
      const fc = buf.charCodeAt(j);
      if (fc < 0x40 || fc > 0x7e) {
        // malformed: drop ESC [ and continue after it
        i += 2;
        continue;
      }
      const params = buf.slice(i + 2, j);
      const final_ = buf[j]!;
      i = j + 1;
      const k = csiKey(params, final_);
      if (k) keys.push(k);
      continue;
    }
    if (next === 'O') {
      if (i + 2 >= n) {
        if (!final) return { keys, rest: buf.slice(i) };
        keys.push(mk({ name: 'escape' }));
        i += 2;
        continue;
      }
      const f = buf[i + 2]!;
      const name = FINAL_KEYS[f];
      if (name) keys.push(mk({ name }));
      i += 3;
      continue;
    }
    // ESC + key: this app binds no Alt combos, so emit Escape and process the key normally
    keys.push(mk({ name: 'escape' }));
    i += 1;
  }
  return { keys, rest: '' };
}

function csiKey(params: string, final: string): KeyPress | undefined {
  if (params.startsWith('<') && (final === 'M' || final === 'm')) return sgrMouse(params, final);
  if (final === '_') return win32Key(params);
  if (final === 'Z') return mk({ name: 'tab', shift: true });
  if (final === 'I' || final === 'O') return undefined; // focus in / out
  if (final === '~') {
    const [code, mod] = params.split(';');
    if (code === '200' || code === '201') return undefined; // bracketed paste markers
    const name = TILDE_KEYS[code ?? ''];
    return name ? applyMod(mk({ name }), mod ? Number(mod) : undefined) : undefined;
  }
  if (/^[?>=]/.test(params)) return undefined; // replies to terminal queries
  const name = FINAL_KEYS[final];
  if (!name) return undefined;
  const mod = params.split(';')[1];
  return applyMod(mk({ name }), mod ? Number(mod) : undefined);
}

/** Stateless convenience wrapper (complete chunk). */
export function parseKeys(chunk: string): KeyPress[] {
  return parseChunk(chunk, true).keys;
}

/** Stateful parser: buffers incomplete escape sequences across chunks. */
export class KeyParser {
  private pending = '';

  feed(chunk: string): KeyPress[] {
    const { keys, rest } = parseChunk(this.pending + chunk, false);
    // guard against unbounded buffering of junk
    this.pending = rest.length > 64 ? '' : rest;
    return keys;
  }

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  /** Flush whatever is buffered (e.g. a lone ESC after a timeout). */
  flush(): KeyPress[] {
    const p = this.pending;
    this.pending = '';
    return p ? parseChunk(p, true).keys : [];
  }
}
