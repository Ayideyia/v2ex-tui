import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, type AppConfig } from '../config.js';
import { ApiError, HttpClient } from './http.js';
import type { NodeInfo, Notification, Page, Reply, Topic } from './types.js';

interface V2Envelope<T> {
  success: boolean;
  message?: string;
  result: T;
  pagination?: { per_page: number; total: number; pages: number };
}

const NODES_CACHE_TTL = 24 * 3600 * 1000;

export class V2exClient {
  readonly http: HttpClient;
  private memo = new Map<string, { at: number; data: unknown }>();

  constructor(private readonly cfg: AppConfig) {
    this.http = new HttpClient({ timeout: cfg.timeout, proxy: cfg.proxy, userAgent: 'v2ex-tui/1.0 (+terminal client)' });
  }

  get hasToken(): boolean {
    return Boolean(this.cfg.token);
  }

  topicUrl(id: number): string {
    return `${this.cfg.baseUrl}/t/${id}`;
  }

  nodeUrl(name: string): string {
    return `${this.cfg.baseUrl}/go/${name}`;
  }

  private async v1<T>(path: string, ttlMs = 0): Promise<T> {
    const url = `${this.cfg.baseUrl}/api/${path}`;
    const hit = this.memo.get(url);
    if (ttlMs > 0 && hit && Date.now() - hit.at < ttlMs) return hit.data as T;
    const data = await this.http.getJson<T>(url);
    if (data && typeof data === 'object' && !Array.isArray(data) && (data as { status?: string }).status === 'error') {
      throw new ApiError(`接口错误：${(data as { message?: string }).message ?? '未知错误'}`, 'api');
    }
    if (ttlMs > 0) this.memo.set(url, { at: Date.now(), data });
    return data;
  }

  private async v2<T>(path: string): Promise<V2Envelope<T>> {
    if (!this.cfg.token) throw new ApiError('该功能需要 V2EX Token（设置环境变量 V2EX_TOKEN 或配置文件）', 'auth');
    const env = await this.http.getJson<V2Envelope<T>>(`${this.cfg.baseUrl}/api/v2/${path}`, {
      Authorization: `Bearer ${this.cfg.token}`,
    });
    if (!env.success) throw new ApiError(`接口错误：${env.message ?? '未知错误'}`, 'api');
    return env;
  }

  // ---------- v1 ----------
  hot(): Promise<Topic[]> {
    return this.v1<Topic[]>('topics/hot.json');
  }

  latest(): Promise<Topic[]> {
    return this.v1<Topic[]>('topics/latest.json');
  }

  async topic(id: number): Promise<Topic> {
    const list = await this.v1<Topic[]>(`topics/show.json?id=${id}`);
    if (!list[0]) throw new ApiError('主题不存在或已被删除', 'api');
    return list[0];
  }

  /** v1 replies endpoint returns every reply in one go. */
  replies(topicId: number): Promise<Reply[]> {
    return this.v1<Reply[]>(`replies/show.json?topic_id=${topicId}`);
  }

  /** Node topics: uses v2 pagination when a token is available, else v1 (first page only). */
  async nodeTopics(name: string, page = 1): Promise<Page<Topic>> {
    if (this.hasToken) {
      const env = await this.v2<Topic[]>(`nodes/${encodeURIComponent(name)}/topics?p=${page}`);
      return { items: env.result, page, totalPages: env.pagination?.pages };
    }
    const items = await this.v1<Topic[]>(`topics/show.json?node_name=${encodeURIComponent(name)}`);
    return { items, page: 1, totalPages: 1 };
  }

  async allNodes(): Promise<NodeInfo[]> {
    const file = join(CACHE_DIR, 'nodes.json');
    try {
      if (Date.now() - statSync(file).mtimeMs < NODES_CACHE_TTL) {
        return JSON.parse(readFileSync(file, 'utf8')) as NodeInfo[];
      }
    } catch {
      /* cache miss */
    }
    const nodes = await this.v1<NodeInfo[]>('nodes/all.json', NODES_CACHE_TTL);
    const slim = nodes
      .map((n) => ({ id: n.id, name: n.name, title: n.title, title_alternative: n.title_alternative, topics: n.topics, stars: n.stars, aliases: n.aliases }))
      .sort((a, b) => (b.topics ?? 0) - (a.topics ?? 0));
    try {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify(slim));
    } catch {
      /* cache is best effort */
    }
    return slim;
  }

  // ---------- v2 ----------
  async notifications(page = 1): Promise<Page<Notification>> {
    const env = await this.v2<Notification[]>(`notifications?p=${page}`);
    return { items: env.result, page, totalPages: env.pagination?.pages };
  }
}
