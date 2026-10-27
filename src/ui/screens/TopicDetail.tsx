import React, { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import type { V2exClient } from '../../api/client.js';
import type { Reply, Topic } from '../../api/types.js';
import type { Action } from '../../keybindings.js';
import { htmlToText } from '../../utils/html.js';
import { relativeTime } from '../../utils/time.js';
import { strWidth, wrapText } from '../../utils/width.js';
import { Lines, type Line } from '../components/Lines.js';
import { useAsync } from '../hooks/useAsync.js';
import type { Status } from '../components/StatusBar.js';

export type KeyHandler = (a: Action) => boolean;

interface Props {
  client: V2exClient;
  topicId: number;
  initial?: Topic;
  width: number;
  height: number;
  keyRef: MutableRefObject<KeyHandler | null>;
  setStatus: (s?: Status) => void;
}

function contentOf(x: { content_rendered?: string; content?: string }): string {
  return x.content_rendered ? htmlToText(x.content_rendered) : (x.content ?? '').trim();
}

export function buildTopicLines(topic: Topic | undefined, replies: Reply[] | undefined, width: number, repliesLoading: boolean) {
  const lines: Line[] = [];
  const replyStarts: number[] = [];
  const w = Math.max(10, width - 4);
  if (!topic) return { lines, replyStarts };
  for (const l of wrapText(topic.title, width - 2)) lines.push({ text: ' ' + l, bold: true, color: 'whiteBright' });
  lines.push({
    text: ' ' + [
      topic.node ? `[${topic.node.title || topic.node.name}]` : '',
      topic.member ? `@${topic.member.username}` : '',
      relativeTime(topic.created),
      `${topic.replies} 回复`,
      `#${topic.id}`,
    ].filter(Boolean).join(' · '),
    color: 'gray',
  });
  lines.push({ text: ' ' + '─'.repeat(Math.max(0, width - 2)), dim: true });
  const body = contentOf(topic);
  if (body) for (const l of wrapText(body, w)) lines.push({ text: '  ' + l });
  else lines.push({ text: '  （无正文）', dim: true });
  lines.push({ text: '' });
  const label = repliesLoading && !replies ? ' 回复加载中…' : ` 共 ${replies?.length ?? topic.replies} 条回复 `;
  lines.push({ text: '─' + label + '─'.repeat(Math.max(0, width - 2 - strWidth(label))), color: 'yellow' });
  const op = topic.member?.username;
  (replies ?? []).forEach((r, i) => {
    replyStarts.push(lines.length);
    const who = r.member?.username ?? '匿名';
    lines.push({
      text: ` #${i + 1}  ${who}${who === op ? ' [楼主]' : ''}  ${relativeTime(r.created)}`,
      color: who === op ? 'magenta' : 'cyan',
    });
    for (const l of wrapText(contentOf(r), w)) lines.push({ text: '   ' + l });
    lines.push({ text: '' });
  });
  if (replies && replies.length > 0) lines.push({ text: ' —— 已到底部 ——', dim: true });
  return { lines, replyStarts };
}

export function TopicDetail({ client, topicId, initial, width, height, keyRef, setStatus }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const topicQ = useAsync(
    () => (refreshKey === 0 && initial && initial.content_rendered !== undefined ? Promise.resolve(initial) : client.topic(topicId)),
    [topicId, refreshKey],
  );
  const repliesQ = useAsync(() => client.replies(topicId), [topicId, refreshKey]);
  const [offset, setOffset] = useState(0);

  const topic = topicQ.data ?? initial;
  const { lines, replyStarts } = useMemo(
    () => buildTopicLines(topic, repliesQ.data, width, repliesQ.loading),
    [topic, repliesQ.data, width, repliesQ.loading],
  );
  const maxOffset = Math.max(0, lines.length - height);

  useEffect(() => {
    if (topicQ.loading || repliesQ.loading) setStatus({ kind: 'loading', text: '正在加载主题…' });
    else if (topicQ.error || repliesQ.error) setStatus({ kind: 'error', text: (topicQ.error || repliesQ.error)!.message + '（按 r 重试）' });
    else setStatus({ kind: 'info', text: `已加载 ${repliesQ.data?.length ?? 0} 条回复` });
  }, [topicQ.loading, repliesQ.loading, topicQ.error, repliesQ.error, repliesQ.data]);

  const clamp = (n: number) => Math.max(0, Math.min(maxOffset, n));
  keyRef.current = (a: Action) => {
    const page = Math.max(1, height - 1);
    switch (a) {
      case 'down': setOffset((o) => clamp(o + 1)); return true;
      case 'up': setOffset((o) => clamp(o - 1)); return true;
      case 'pageDown': setOffset((o) => clamp(o + page)); return true;
      case 'pageUp': setOffset((o) => clamp(o - page)); return true;
      case 'halfDown': setOffset((o) => clamp(o + Math.floor(page / 2))); return true;
      case 'halfUp': setOffset((o) => clamp(o - Math.floor(page / 2))); return true;
      case 'top': setOffset(0); return true;
      case 'bottom': setOffset(maxOffset); return true;
      case 'nextReply': {
        const next = replyStarts.find((s) => s > offset);
        if (next !== undefined) setOffset(clamp(next));
        return true;
      }
      case 'prevReply': {
        const prev = [...replyStarts].reverse().find((s) => s < offset);
        setOffset(clamp(prev ?? 0));
        return true;
      }
      case 'refresh': setRefreshKey((k) => k + 1); return true;
      default: return false;
    }
  };

  const view = lines.slice(clamp(offset), clamp(offset) + height);
  if (!topic && topicQ.loading) view.push({ text: '  加载中…', dim: true });
  if (!topic && topicQ.error) view.push({ text: '  ' + topicQ.error.message, color: 'red' });
  const pct = lines.length <= height ? 100 : Math.round((clamp(offset) / maxOffset) * 100);
  return (
    <>
      <Lines lines={view} width={width} height={height - 1} />
      <Lines lines={[{ text: ' '.repeat(Math.max(0, width - 12)) + `${String(pct).padStart(3)}% ${'─'.repeat(4)}`, dim: true }]} width={width} height={1} />
    </>
  );
}
