import { ProxyAgent, fetch as undiciFetch } from 'undici';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'timeout' | 'http' | 'ratelimit' | 'auth' | 'parse' | 'api',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RateLimit {
  limit?: number;
  remaining?: number;
  reset?: number;
}

export interface HttpOptions {
  timeout: number;
  proxy?: string;
  userAgent?: string;
}

function noProxy(url: string): boolean {
  const list = (process.env.NO_PROXY || process.env.no_proxy || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return false;
  const host = new URL(url).hostname;
  return list.some((p) => p === '*' || host === p || host.endsWith(p.startsWith('.') ? p : '.' + p));
}

export class HttpClient {
  private agent?: ProxyAgent;
  public lastRateLimit: RateLimit = {};

  constructor(private readonly opts: HttpOptions) {
    if (opts.proxy && /^https?:\/\//i.test(opts.proxy)) {
      try {
        this.agent = new ProxyAgent(opts.proxy);
      } catch {
        this.agent = undefined;
      }
    }
  }

  get proxyInUse(): string | undefined {
    return this.agent ? this.opts.proxy : undefined;
  }

  async getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeout);
    const h = {
      'User-Agent': this.opts.userAgent ?? 'v2ex-tui',
      Accept: 'application/json',
      ...headers,
    };
    let res: Response;
    try {
      if (this.agent && !noProxy(url)) {
        res = (await undiciFetch(url, { headers: h, signal: ctrl.signal, dispatcher: this.agent })) as unknown as Response;
      } else {
        res = await fetch(url, { headers: h, signal: ctrl.signal });
      }
    } catch (e) {
      clearTimeout(timer);
      if (ctrl.signal.aborted) throw new ApiError(`请求超时（${Math.round(this.opts.timeout / 1000)}s）`, 'timeout');
      const err = e as Error & { cause?: { code?: string; message?: string } };
      if (err.name === 'AbortError') throw new ApiError(`请求超时（${Math.round(this.opts.timeout / 1000)}s）`, 'timeout');
      const detail = err.cause?.code || err.cause?.message || err.message;
      throw new ApiError(`网络错误：${detail}`, 'network');
    }

    const num = (k: string) => {
      const v = res.headers.get(k);
      return v == null ? undefined : Number(v);
    };
    this.lastRateLimit = {
      limit: num('x-rate-limit-limit'),
      remaining: num('x-rate-limit-remaining'),
      reset: num('x-rate-limit-reset'),
    };

    // keep the timeout armed while the body streams in: a stalled body must not hang forever
    let text: string;
    try {
      text = await res.text();
    } catch (e) {
      if (ctrl.signal.aborted) throw new ApiError(`请求超时（${Math.round(this.opts.timeout / 1000)}s，数据未接收完整）`, 'timeout');
      throw new ApiError(`网络错误：${(e as Error).message}`, 'network');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429 || (res.status === 403 && /rate limit/i.test(text))) {
      const reset = this.lastRateLimit.reset;
      const wait = reset ? Math.max(0, Math.ceil(reset - Date.now() / 1000)) : undefined;
      throw new ApiError(`请求过于频繁，已被限流${wait ? `，约 ${Math.ceil(wait / 60)} 分钟后恢复` : ''}`, 'ratelimit', res.status);
    }
    if (res.status === 401) throw new ApiError('Token 无效或已过期（401）', 'auth', 401);
    if (!res.ok) throw new ApiError(`服务器返回 HTTP ${res.status}`, 'http', res.status);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError('响应解析失败（可能被拦截或返回了 HTML 页面）', 'parse', res.status);
    }
  }
}
