import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AppConfig {
  /** V2EX API v2 Personal Access Token (https://www.v2ex.com/settings/tokens) */
  token?: string;
  /** Override proxy, e.g. http://127.0.0.1:7890 */
  proxy?: string;
  /** Request timeout in ms */
  timeout: number;
  /** Base url, default https://www.v2ex.com */
  baseUrl: string;
  /** Enable mouse support (default true) */
  mouse: boolean;
}

export const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'v2ex-tui');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
export const CACHE_DIR = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'v2ex-tui');

export function loadConfig(): AppConfig {
  let file: Partial<AppConfig> = {};
  try {
    file = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<AppConfig>;
  } catch {
    /* no config file is fine */
  }
  const proxy =
    process.env.V2EX_PROXY || file.proxy ||
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.ALL_PROXY || process.env.all_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy || undefined;
  return {
    token: process.env.V2EX_TOKEN || file.token || undefined,
    proxy,
    timeout: Number(process.env.V2EX_TIMEOUT) || file.timeout || 15000,
    mouse: !(process.env.V2EX_NO_MOUSE === '1' || file.mouse === false),
    baseUrl: (process.env.V2EX_BASE_URL || file.baseUrl || 'https://www.v2ex.com').replace(/\/$/, ''),
  };
}
