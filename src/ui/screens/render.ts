import type { Notification, Topic } from '../../api/types.js';
import { htmlToText } from '../../utils/html.js';
import { relativeTime } from '../../utils/time.js';
import { strWidth, truncate } from '../../utils/width.js';
import type { Line } from '../components/Lines.js';

export function renderTopicRow(t: Topic, index: number, selected: boolean, width: number): Line[] {
  const marker = selected ? '▶ ' : '  ';
  const num = String(index + 1).padStart(2, ' ') + '. ';
  const replies = t.replies > 0 ? ` [${t.replies}]` : '';
  const titleRoom = width - strWidth(marker + num) - strWidth(replies) - 1;
  const title = marker + num + truncate(t.title.replace(/\s+/g, ' '), titleRoom) + replies;
  const meta = [
    t.node ? `[${t.node.title || t.node.name}]` : '',
    t.member?.username ?? '',
    `${t.replies} 回复`,
    relativeTime(t.last_touched || t.last_modified || t.created),
    t.last_reply_by ? `最后回复 ${t.last_reply_by}` : '',
  ].filter(Boolean).join(' · ');
  return [
    { text: title, bold: selected, color: selected ? 'cyanBright' : undefined },
    { text: '      ' + meta, dim: !selected, color: selected ? 'cyan' : undefined },
  ];
}

export function notificationTopicId(n: Notification): number | undefined {
  const m = n.text.match(/\/t\/(\d+)/);
  return m ? Number(m[1]) : undefined;
}

export function renderNotificationRow(n: Notification, _i: number, selected: boolean, width: number): Line[] {
  const marker = selected ? '▶ ' : '  ';
  const text = htmlToText(n.text).replace(/\s+/g, ' ');
  const payload = htmlToText(n.payload_rendered || n.payload || '').replace(/\s+/g, ' ');
  return [
    { text: marker + truncate(text, width - 3), bold: selected, color: selected ? 'cyanBright' : undefined },
    { text: '    ' + truncate(`${relativeTime(n.created)}${payload ? ' · ' + payload : ''}`, width - 5), dim: !selected },
  ];
}
