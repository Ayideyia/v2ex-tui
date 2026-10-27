/** Minimal HTML -> readable terminal text converter for V2EX content_rendered. */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  mdash: '—', ndash: '–', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  middot: '·', copy: '©', reg: '®', times: '×', laquo: '«', raquo: '»',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : undefined;
}

export function htmlToText(html: string): string {
  if (!html) return '';
  let s = html.replace(/\r\n?/g, '\n');

  // <pre> blocks: keep whitespace, indent
  const pres: string[] = [];
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner: string) => {
    const code = decodeEntities(inner.replace(/<[^>]+>/g, '')).replace(/\n+$/, '');
    pres.push(code.split('\n').map((l) => '  │ ' + l).join('\n'));
    return `\n\u0000PRE${pres.length - 1}\u0000\n`;
  });

  // links: show text and url if different
  s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_m, attrs: string, inner: string) => {
    const href = attr(`<a ${attrs}>`, 'href') ?? '';
    const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim();
    if (!href || href.startsWith('/member/') ) return text;
    const full = href.startsWith('/') ? `https://www.v2ex.com${href}` : href;
    if (!text || text === full || text === href || full.includes(text.replace(/…$/, ''))) return full;
    return `${text} (${full})`;
  });
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attr(tag, 'src') ?? '';
    return src ? `[图片 ${src}]` : '[图片]';
  });
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<hr\s*\/?>/gi, '\n────────\n');
  s = s.replace(/<li[^>]*>/gi, '\n • ');
  s = s.replace(/<h[1-6][^>]*>/gi, '\n\n## ');
  s = s.replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|table|tr)>/gi, '\n');
  s = s.replace(/<(p|div|ul|ol|table)\b[^>]*>/gi, '\n');
  s = s.replace(/<blockquote[^>]*>/gi, '\n> ');
  s = s.replace(/<\/?(code)[^>]*>/gi, '`');
  s = s.replace(/<\/?(strong|b)\b[^>]*>/gi, '**');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  s = s.replace(/\u0000PRE(\d+)\u0000/g, (_m, i: string) => pres[Number(i)] ?? '');
  return s;
}
