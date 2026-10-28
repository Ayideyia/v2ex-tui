import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, useApp } from 'ink';
import type { KeyPress, MouseEvent } from '../utils/keys.js';
import { strWidth, truncate } from '../utils/width.js';
import { useKeypress } from './hooks/useKeypress.js';
import type { V2exClient } from '../api/client.js';
import type { NodeInfo, Notification, Topic } from '../api/types.js';
import { resolveAction, type Action } from '../keybindings.js';
import { openInBrowser } from '../utils/browser.js';
import { relativeTime } from '../utils/time.js';
import { Lines } from './components/Lines.js';
import { StatusBar, type Status } from './components/StatusBar.js';
import { TabBar, tabRanges, type TabDef } from './components/TabBar.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { Help } from './screens/Help.js';
import { ItemList, ROWS_PER_ITEM, clampOffset } from './screens/ItemList.js';
import { NodePicker, initialPickerState, type PickerState } from './screens/NodePicker.js';
import { notificationTopicId, renderNotificationRow, renderTopicRow } from './screens/render.js';
import { TopicDetail, type KeyHandler } from './screens/TopicDetail.js';

type TabId = 'hot' | 'latest' | 'node' | 'notify';

interface Feed<T> {
  items: T[];
  loading: boolean;
  error?: string;
  page: number;
  totalPages?: number;
  selected: number;
  offset: number;
  loadedAt?: number;
}

const emptyFeed = <T,>(): Feed<T> => ({ items: [], loading: false, page: 1, selected: 0, offset: 0 });

/** One screen on a tab's navigation stack. */
export type Screen =
  | { kind: 'picker' }
  | { kind: 'list'; feedKey: string; node?: { name: string; title: string } }
  | { kind: 'topic'; id: number; topic?: Topic };

type Stacks = Record<TabId, Screen[]>;

function initialStacks(initialNode?: string): Stacks {
  return {
    hot: [{ kind: 'list', feedKey: 'hot' }],
    latest: [{ kind: 'list', feedKey: 'latest' }],
    node: initialNode
      ? [{ kind: 'picker' }, { kind: 'list', feedKey: `node:${initialNode}`, node: { name: initialNode, title: initialNode } }]
      : [{ kind: 'picker' }],
    notify: [{ kind: 'list', feedKey: 'notify' }],
  };
}

export interface AppProps {
  client: V2exClient;
  initialNode?: string;
  mouse?: boolean;
}

export function App({ client, initialNode, mouse = true }: AppProps) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  // keep 1 spare row so ink never needs to clear the whole screen (avoids flicker)
  const height = Math.max(8, rows - 1);
  const width = Math.max(30, columns);
  const bodyH = height - 2;

  const tabs: TabDef[] = [
    { id: 'hot', label: '热门' },
    { id: 'latest', label: '最新' },
    { id: 'node', label: '节点' },
    ...(client.hasToken ? [{ id: 'notify', label: '通知' }] : []),
  ];

  const [tab, setTab] = useState<TabId>(initialNode ? 'node' : 'hot');
  // per-tab navigation stacks: e.g. 节点 = [picker, list(node), topic]
  const [stacks, setStacks] = useState<Stacks>(() => initialStacks(initialNode));
  const [pickerState, setPickerState] = useState<PickerState>(initialPickerState);
  const [feeds, setFeeds] = useState<Record<string, Feed<Topic | Notification>>>({});
  const [help, setHelpRaw] = useState(false);
  const [helpOffset, setHelpOffset] = useState(0);
  const setHelp = (v: boolean) => { setHelpRaw(v); setHelpOffset(0); };
  const [status, setStatus] = useState<Status | undefined>();
  const topicKeys = useRef<KeyHandler | null>(null);
  const pickerKeys = useRef<((k: KeyPress) => void) | null>(null);
  const lastClick = useRef<{ at: number; index: number }>({ at: 0, index: -1 });

  const stack = stacks[tab];
  const top = stack[stack.length - 1]!;
  const canGoBack = stack.length > 1;
  // the list screen that is showing, or that the open topic came from
  const listScreen = [...stack].reverse().find((sc): sc is Extract<Screen, { kind: 'list' }> => sc.kind === 'list');
  const feedKey = top.kind === 'list' ? top.feedKey : top.kind === 'topic' ? listScreen?.feedKey ?? '' : '';
  const feed = (feeds[feedKey] ?? emptyFeed()) as Feed<Topic | Notification>;
  const node = listScreen?.node;

  const push = (t: TabId, sc: Screen) => setStacks((all) => ({ ...all, [t]: [...all[t], sc] }));
  const resetTo = (t: TabId, st: Screen[]) => setStacks((all) => ({ ...all, [t]: st }));

  const patchFeed = useCallback((key: string, patch: Partial<Feed<Topic | Notification>>) => {
    setFeeds((f) => ({ ...f, [key]: { ...(f[key] ?? emptyFeed()), ...patch } }));
  }, []);

  const feedStatus = (f?: Feed<Topic | Notification>): Status | undefined =>
    !f ? undefined
    : f.error ? { kind: 'error', text: `${f.error}（按 r 重试）` }
    : f.loading ? { kind: 'loading', text: '加载中…' }
    : f.loadedAt ? { kind: 'info', text: `${f.items.length} 条 · 更新于 ${relativeTime(Math.floor(f.loadedAt / 1000))}` }
    : undefined;

  const load = useCallback(
    async (key: string, page = 1) => {
      if (!key) return;
      patchFeed(key, { loading: true, error: undefined });
      setStatus({ kind: 'loading', text: '加载中…' });
      try {
        let items: Array<Topic | Notification>;
        let totalPages: number | undefined;
        if (key === 'hot') items = await client.hot();
        else if (key === 'latest') items = await client.latest();
        else if (key === 'notify') ({ items, totalPages } = await client.notifications(page));
        else ({ items, totalPages } = await client.nodeTopics(key.slice(5), page));
        patchFeed(key, { items, loading: false, page, totalPages, selected: 0, offset: 0, loadedAt: Date.now() });
        const rl = client.http.lastRateLimit;
        setStatus({
          kind: 'info',
          text: `已加载 ${items.length} 条${totalPages && totalPages > 1 ? `（第 ${page}/${totalPages} 页）` : ''}${rl.remaining !== undefined ? ` · API 余量 ${rl.remaining}/${rl.limit}` : ''}`,
        });
      } catch (e) {
        const msg = (e as Error).message;
        patchFeed(key, { loading: false, error: msg });
        setStatus({ kind: 'error', text: `${msg}（按 r 重试）` });
      }
    },
    [client, patchFeed],
  );

  // auto-load a feed the first time it is shown
  useEffect(() => {
    if (top.kind === 'list' && !feeds[top.feedKey]) void load(top.feedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top.kind === 'list' ? top.feedKey : '']);

  const switchTab = (id: TabId) => {
    setHelp(false);
    if (id === tab) {
      // clicking / selecting the current tab again: 节点 goes back to the node picker,
      // other tabs pop back to their list
      resetTo(id, stacks[id].slice(0, 1));
      if (id !== 'node') setStatus(feedStatus(feeds[id]));
      return;
    }
    setTab(id);
    const t = stacks[id][stacks[id].length - 1]!;
    const k = t.kind === 'list' ? t.feedKey : '';
    setStatus(k ? feedStatus(feeds[k]) : undefined);
  };

  /** Pop one screen. Returns false at the root of the tab. */
  const goBack = (): boolean => {
    if (!canGoBack) return false;
    const next = stack.slice(0, -1);
    resetTo(tab, next);
    const t = next[next.length - 1]!;
    setStatus(t.kind === 'list' ? feedStatus(feeds[t.feedKey]) : undefined);
    return true;
  };

  const openPicker = () => {
    setHelp(false);
    setTab('node');
    resetTo('node', [{ kind: 'picker' }]);
  };

  const currentUrl = (): string | undefined => {
    if (top.kind === 'topic') return client.topicUrl(top.id);
    if (top.kind === 'picker') return undefined;
    const item = feed.items[feed.selected];
    if (!item) return node ? client.nodeUrl(node.name) : undefined;
    if (tab === 'notify') {
      const id = notificationTopicId(item as Notification);
      return id ? client.topicUrl(id) : undefined;
    }
    return (item as Topic).url || client.topicUrl((item as Topic).id);
  };

  const listAction = (a: Action, at?: number) => {
    const n = feed.items.length;
    const visible = Math.max(1, Math.floor(bodyH / ROWS_PER_ITEM));
    // functional update so several keys arriving in one chunk (e.g. "jjj") all apply
    const select = (to: (cur: number) => number) =>
      setFeeds((all) => {
        const f = all[feedKey];
        if (!f || f.items.length === 0) return all;
        const s = Math.max(0, Math.min(f.items.length - 1, to(f.selected)));
        return { ...all, [feedKey]: { ...f, selected: s, offset: clampOffset(s, f.offset, visible, f.items.length) } };
      });
    switch (a) {
      case 'down': return select((c) => c + 1);
      case 'up': return select((c) => c - 1);
      case 'top': return select(() => 0);
      case 'bottom': return select(() => n - 1);
      case 'pageDown': return select((c) => c + visible);
      case 'pageUp': return select((c) => c - visible);
      case 'halfDown': return select((c) => c + Math.ceil(visible / 2));
      case 'halfUp': return select((c) => c - Math.ceil(visible / 2));
      case 'refresh': return void load(feedKey, feed.page);
      case 'nextPage':
      case 'prevPage': {
        if (tab !== 'node' && tab !== 'notify') return;
        if (!client.hasToken) return setStatus({ kind: 'error', text: '分页需要配置 V2EX_TOKEN（v1 接口只返回第一页）' });
        const p = feed.page + (a === 'nextPage' ? 1 : -1);
        if (p < 1 || (feed.totalPages && p > feed.totalPages)) return setStatus({ kind: 'info', text: '没有更多页了' });
        return void load(feedKey, p);
      }
      case 'open': {
        const item = feed.items[at ?? feed.selected];
        if (!item) return;
        if (tab === 'notify') {
          const id = notificationTopicId(item as Notification);
          if (id) push(tab, { kind: 'topic', id });
          return;
        }
        push(tab, { kind: 'topic', id: (item as Topic).id, topic: item as Topic });
        return;
      }
      default: return;
    }
  };

  // One input subscription for the whole app lifetime (see useKeypress for why).
  useKeypress(handleKey);

  const backLabel = '[‹ 返回]';

  function handleMouse(m: MouseEvent) {
    const bodyTop = 2; // row 1 is the tab bar
    if (help) {
      if (m.wheel) setHelpOffset((o) => Math.max(0, Math.min(40, o + (m.wheel === 'down' ? 3 : -3))));
      else if (m.press) setHelp(false);
      return;
    }
    if (m.y === 1 && m.press && !m.wheel && m.button === 0) {
      const hit = tabRanges(tabs).find((r) => m.x >= r.start && m.x <= r.end);
      if (hit) return switchTab(hit.id as TabId);
      // the header's right part starts with "[‹ 返回]"
      const start = width - strWidth(right);
      if (canGoBack && m.x >= start - 1) goBack();
      return;
    }
    if (top.kind === 'picker') {
      pickerKeys.current?.({ input: '', ctrl: false, meta: false, shift: false, name: 'mouse', mouse: m });
      return;
    }
    if (m.wheel) {
      const a: Action = m.wheel === 'down' ? 'down' : 'up';
      if (top.kind === 'topic') for (let i = 0; i < 3; i++) topicKeys.current?.(a);
      else listAction(a);
      return;
    }
    if (!m.press || m.drag) return;
    if (m.button === 2) {
      goBack();
      return;
    }
    if (m.button !== 0) return;
    if (top.kind !== 'list' || m.y < bodyTop || m.y >= bodyTop + bodyH) return;
    const index = feed.offset + Math.floor((m.y - bodyTop) / ROWS_PER_ITEM);
    if (index >= feed.items.length) return;
    const now = Date.now();
    const dbl = lastClick.current.index === index && now - lastClick.current.at < 450;
    lastClick.current = { at: now, index };
    if (index === feed.selected || dbl) {
      patchFeed(feedKey, { selected: index });
      listAction('open', index);
      return;
    }
    const visible = Math.max(1, Math.floor(bodyH / ROWS_PER_ITEM));
    patchFeed(feedKey, { selected: index, offset: clampOffset(index, feed.offset, visible, feed.items.length) });
  }

  function handleKey(k: KeyPress) {
    if (k.ctrl && k.input === 'c') return exit();
    if (k.mouse) return handleMouse(k.mouse);
    if (top.kind === 'picker' && !help) {
      // the picker owns the keyboard (letters go into the filter)
      pickerKeys.current?.(k);
      return;
    }
    // pasted text only goes into the picker filter; anywhere else it is ignored
    if (k.name === 'paste') return;
    const a = resolveAction(k);
    if (!a) return;
    if (a === 'quit') return exit();
    if (help) {
      if (a === 'help' || a === 'back' || a === 'backOrQuit') setHelp(false);
      else if (a === 'down' || a === 'pageDown' || a === 'halfDown') setHelpOffset((o) => Math.min(40, o + (a === 'down' ? 1 : 10)));
      else if (a === 'up' || a === 'pageUp' || a === 'halfUp') setHelpOffset((o) => Math.max(0, o - (a === 'up' ? 1 : 10)));
      else if (a === 'top') setHelpOffset(0);
      return;
    }
    if (a === 'back') return void goBack();
    // q goes back while there is somewhere to go back to; quits only at a tab's root
    if (a === 'backOrQuit') return void (goBack() || exit());
    if (a === 'help') return setHelp(true);
    const ids = tabs.map((t) => t.id as TabId);
    const idx = ids.indexOf(tab);
    if (a === 'nextTab') return switchTab(ids[(idx + 1) % ids.length]!);
    if (a === 'prevTab') return switchTab(ids[(idx - 1 + ids.length) % ids.length]!);
    if (a === 'tab1' || a === 'tab2' || a === 'tab3' || a === 'tab4') {
      const t = ids[Number(a.slice(3)) - 1];
      return t ? switchTab(t) : undefined;
    }
    if (a === 'nodePicker') return openPicker();
    if (a === 'browser') {
      const url = currentUrl();
      if (!url) return;
      openInBrowser(url).then(
        () => setStatus({ kind: 'info', text: `已在浏览器打开 ${url}` }),
        () => setStatus({ kind: 'error', text: `无法打开浏览器，请手动访问 ${url}` }),
      );
      return;
    }
    if (top.kind === 'topic') {
      topicKeys.current?.(a);
      return;
    }
    listAction(a);
  }

  const onPickNode = (n: NodeInfo) => {
    const nd = { name: n.name, title: n.title || n.name };
    setTab('node');
    resetTo('node', [{ kind: 'picker' }, { kind: 'list', feedKey: `node:${n.name}`, node: nd }]);
    const f = feeds[`node:${n.name}`];
    setStatus(feedStatus(f));
  };

  let body: React.ReactNode;
  if (help) {
    body = <Help width={width} height={bodyH} hasToken={client.hasToken} proxy={client.http.proxyInUse} mouse={mouse} offset={helpOffset} />;
  } else if (top.kind === 'picker') {
    body = (
      <NodePicker
        client={client}
        width={width}
        height={bodyH}
        onSelect={onPickNode}
        onCancel={() => switchTab('hot')}
        keyRef={pickerKeys}
        originY={2}
        state={pickerState}
        setState={setPickerState}
      />
    );
  } else if (top.kind === 'topic') {
    body = (
      <TopicDetail
        key={top.id}
        client={client}
        topicId={top.id}
        initial={top.topic}
        width={width}
        height={bodyH}
        keyRef={topicKeys}
        setStatus={setStatus}
      />
    );
  } else if (feed.loading && feed.items.length === 0) {
    body = <Lines lines={[{ text: '' }, { text: '  加载中…', color: 'yellow' }]} width={width} height={bodyH} />;
  } else if (feed.error && feed.items.length === 0) {
    body = (
      <Lines
        lines={[{ text: '' }, { text: '  ✖ ' + feed.error, color: 'red' }, { text: '' }, { text: canGoBack ? '  按 r 重试，Esc 返回节点列表' : '  按 r 重试，按 q 退出', dim: true }]}
        width={width}
        height={bodyH}
      />
    );
  } else if (tab === 'notify') {
    body = <ItemList items={feed.items as Notification[]} state={feed} width={width} height={bodyH} render={renderNotificationRow} empty="暂无通知" />;
  } else {
    body = <ItemList items={feed.items as Topic[]} state={feed} width={width} height={bodyH} render={renderTopicRow} empty="暂无主题" />;
  }

  // header breadcrumb (right side of the tab bar); starts with the back affordance when there is one
  const pageInfo = feed.totalPages && feed.totalPages > 1 ? ` 第${feed.page}/${feed.totalPages}页` : '';
  const crumbs: string[] = [];
  if (tab === 'node') {
    crumbs.push('节点');
    if (node) crumbs.push(`${node.title}（${node.name}）${pageInfo}`);
    else crumbs.push('选择节点');
  }
  if (top.kind === 'topic') crumbs.push(`主题 #${top.id}`);
  else if (top.kind === 'list' && feed.items.length) crumbs.push(`${feed.selected + 1}/${feed.items.length}`);
  const tabsW = tabRanges(tabs).at(-1)!.end;
  const right = truncate((canGoBack ? backLabel + '  ' : '') + crumbs.join(' › '), Math.max(0, width - tabsW - 2));

  const hint = help ? '? / Esc 关闭帮助'
    : top.kind === 'picker' ? '输入过滤 · ↑↓←→ 移动 · PgUp/PgDn 翻页 · Enter/双击 进入 · Esc/右键 回到热门 · Ctrl-U 清空 · Ctrl-C 退出'
    : top.kind === 'topic' ? `Esc/q 返回${tab === 'node' ? '节点主题列表' : '列表'} · ↑↓ 滚动 · n/N 回复 · g/G 顶/底 · o 浏览器 · r 刷新 · ? 帮助`
    : canGoBack ? 'Esc 返回节点列表 · ↑↓ 移动 · Enter 打开 · / 换节点 · r 刷新 · o 浏览器 · ? 帮助'
    : '↑↓ 移动 · Enter 打开 · Tab 切换 · / 节点 · r 刷新 · o 浏览器 · ? 帮助 · q 退出';

  return (
    <Box flexDirection="column" width={width} height={height}>
      <TabBar tabs={tabs} active={tab} right={right} />
      {body}
      <StatusBar status={top.kind === 'picker' && !help ? undefined : status} hint={hint} width={width} />
    </Box>
  );
}
