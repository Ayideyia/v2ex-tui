# v2ex-tui

终端里的 V2EX 客户端（TUI）。Node.js + TypeScript + [Ink](https://github.com/vadimdemedes/ink)（React for CLI）开发，用 esbuild 打包成**单个 JS 文件**，不需要 `node_modules`，`node v2ex.js` 即可运行。

## 🚀 安装

```bash
npm i -g https://github.com/Ayideyia/v2ex-tui/releases/latest/download/v2ex-tui.tgz
v2ex
```

装好后用 `v2ex`（或 `v2ex-tui`）启动，只需要 Node.js 18+。更新时重新执行一遍安装命令即可；想装指定版本，把 `latest/download` 换成 `download/v1.0.1` 这样的版本号。

不想安装也可以直接运行：

```bash
npx github:Ayideyia/v2ex-tui
```

## 从源码运行

```bash
git clone https://github.com/Ayideyia/v2ex-tui.git && cd v2ex-tui
npm install
npm run build   # 打包出 dist/v2ex.js
node dist/v2ex.js
```

打包后的 `v2ex.js` 是单文件，可以单独拷走运行：

```bash
node v2ex.js                 # 打开首页（热门）
node v2ex.js --node programmer   # 直接进入某个节点
node v2ex.js --no-mouse      # 禁用鼠标
node v2ex.js --help
```

也可以 `chmod +x v2ex.js && ./v2ex.js`，或放到 PATH 里改名为 `v2ex`。

要求：Node.js ≥ 18，交互式终端（建议支持 256 色、UTF-8 的终端，窗口至少 80×24）。

## 功能

- **标签页**：热门 / 最新 / 节点（配置 Token 后多一个「通知」）
- **主题列表**：标题、节点、作者、回复数、相对时间（x 分钟前）、最后回复人
- **主题详情**：正文（HTML 转为终端可读文本：链接、图片、代码块、列表、引用）+ 全部回复（楼层号、楼主标记），中英文混排按显示宽度折行
- **导航**：每个标签页有自己的导航栈，例如节点页是「节点选择 → 节点主题列表 → 主题」，顶部显示面包屑（如 `[‹ 返回]  节点 › 分享创造（create）`），`Esc` 逐级返回；切换标签页再切回来会停在原来的位置
- **节点选择器**：首次加载全部节点（缓存 24 小时到 `~/.cache/v2ex-tui/nodes.json`），以网格方式展示（每格显示中文名、英文名和主题数，列数随终端宽度自动调整），默认按热度（主题数）排序，输入即过滤（英文名 / 中文名 / 别名）；方向键在网格里上下左右移动，鼠标滚轮按行滚动、单击选中、再次单击或双击进入
- 刷新、在浏览器打开、帮助浮层、全键盘操作（Vim 风格 + 方向键）
- 错误处理：网络错误、超时、限流（429 / 速率头）、Token 失效、非 JSON 响应都会在界面里提示，按 `r` 重试
- 状态栏显示 API 剩余额度（V2EX 每小时 600 次）
- 支持 HTTP(S) 代理
- **鼠标**（默认开启，xterm SGR 1006 协议，VS Code 终端 / Windows Terminal / iTerm2 / macOS 终端 / tmux 均可）：滚轮滚动、单击选中、再次单击或双击打开、点顶部标签切换、右键或点右上角 `[‹ 返回]` 返回上一级
- 兼容 Windows（VS Code 集成终端、Windows Terminal、PowerShell、cmd）：回车 `\r` / `\r\n`、ConPTY win32-input-mode 按键序列、焦点事件、粘贴标记都能正确识别，未知或不完整的转义序列会被丢弃，不会被当作文字输入

## 快捷键

| 场景 | 按键 | 作用 |
| --- | --- | --- |
| 通用 | `?` | 显示 / 关闭帮助 |
| 通用 | `Tab` / `Shift-Tab`，`H` / `L` | 切换标签页 |
| 通用 | `1` `2` `3` `4` | 直接跳到对应标签页 |
| 通用 | `r` / `Ctrl-R` | 刷新 |
| 通用 | `o` | 在浏览器打开当前主题 |
| 通用 | `Esc` / `q` / `h` / `←` / `Backspace` | 返回上一级：主题 → 节点主题列表 → 节点选择（保留上次的过滤文字和选中位置） |
| 通用 | `q`（在热门 / 最新 / 通知列表这种最顶层） | 退出；在节点主题列表、主题页里 `q` 只返回，不会退出 |
| 通用 | `Q` / `Ctrl-C` | 直接退出（节点选择界面里字母会进过滤框，用 `Ctrl-C` 退出） |
| 移动 | `↓` / `↑`，`Ctrl-N` / `Ctrl-P` | 下移 / 上移（已取消 `j` / `k`） |
| 移动 | `g` / `G`，`Home` / `End` | 顶部 / 底部 |
| 移动 | `Space` / `f` / `PgDn`，`b` / `PgUp` | 下一屏 / 上一屏 |
| 移动 | `d` / `u`，`Ctrl-D` / `Ctrl-U` | 下半屏 / 上半屏 |
| 列表 | `Enter` / `l` / `→` | 打开主题 |
| 列表 | `/` 或 `s`，或在节点页再点一次「3.节点」标签 | 回到节点选择 |
| 列表 | `]` / `[` | 节点 / 通知 下一页 / 上一页（需 Token） |
| 主题 | `n` / `N` | 跳到下一条 / 上一条回复 |
| 节点选择 | 直接输入 | 过滤；`Backspace` 删除，`Ctrl-U` 清空 |
| 节点选择 | `↑` `↓` `←` `→` / `Ctrl-P` `Ctrl-N` | 在网格中移动（`←` `→` 到行尾 / 行首会换行） |
| 节点选择 | `PgUp` / `PgDn`，`Home` / `End` | 翻一屏 / 第一个 / 最后一个 |
| 节点选择 | `Enter` / `Esc` | 进入节点 / 回到热门 |
| 鼠标 | 滚轮 | 列表 / 主题 / 节点选择 / 帮助中滚动 |
| 鼠标 | 单击；再次单击已选中项或双击 | 选中；打开主题 / 确认节点 |
| 鼠标 | 单击顶部 `1.热门` 等标签 | 切换标签页 |
| 鼠标 | 右键，或点右上角 `[‹ 返回]` | 返回上一级（同 `Esc`） |

开启鼠标后，终端自带的拖动选择文字需要按住 `Shift`（Windows Terminal / VS Code / 多数 Linux 终端）或 `Option`（macOS iTerm2 / 终端）再拖动；也可以用 `--no-mouse` 关闭。

## 配置

都是可选的。环境变量优先于配置文件。

| 环境变量 | 配置文件字段 | 说明 |
| --- | --- | --- |
| `V2EX_TOKEN` | `token` | V2EX 个人访问令牌（在 <https://www.v2ex.com/settings/tokens> 创建）。配置后启用「通知」标签和节点主题翻页（API v2） |
| `V2EX_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` | `proxy` | HTTP 代理，如 `http://127.0.0.1:7890`（支持 `NO_PROXY`）。暂不支持 socks5 |
| `V2EX_TIMEOUT` | `timeout` | 请求超时毫秒数，默认 15000 |
| `V2EX_BASE_URL` | `baseUrl` | 默认 `https://www.v2ex.com` |
| `V2EX_NO_MOUSE=1` / `--no-mouse` | `mouse: false` | 关闭鼠标支持 |

配置文件：`~/.config/v2ex-tui/config.json`

```json
{ "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "proxy": "http://127.0.0.1:7890" }
```

## 开发

```bash
npm install
npm run dev          # tsx 直接运行源码
npm run typecheck    # tsc 类型检查
npm test             # 单元测试（node:test）
npm run build        # 打包 → dist/v2ex.js（压缩，单文件，带 shebang）
npm run build:dev    # 不压缩，便于调试
npm run watch        # 监听改动自动打包
```

目录结构：

```
src/
  index.tsx                 入口：参数解析、备用屏幕、启动 Ink
  config.ts                 读取环境变量 / 配置文件
  keybindings.ts            按键 → 动作映射 + 帮助表
  api/
    http.ts                 fetch 封装：超时、代理、限流、错误分类
    client.ts               V2EX API v1 / v2 客户端、节点缓存
    types.ts                数据类型
  ui/
    App.tsx                 全局状态、标签页、路由、按键分发
    components/             TabBar、StatusBar、Lines（定宽行渲染）
    hooks/                  useKeypress（全局唯一输入订阅）、useAsync、useTerminalSize
    screens/                ItemList、TopicDetail、NodePicker、Help、行渲染
  utils/
    width.ts                中日韩字符宽度、截断、折行
    html.ts                 HTML → 终端文本
    keys.ts                 原始终端输入 → 按键 / 鼠标事件（CSI、SS3、SGR/X10 鼠标、win32-input-mode）
    time.ts / browser.ts    相对时间 / 打开浏览器
scripts/build.mjs           esbuild 打包脚本
test/                       单元测试 + 集成测试（假 TTY 驱动完整 App）
```

实现说明：整个应用只在根组件挂一个输入订阅（`useKeypress`），启动时开启 raw mode、退出时关闭，中途不切换；各界面的按键 / 鼠标事件由根组件分发。不要在子组件里再用 Ink 的 `useInput`——它在组件卸载时会关闭 raw mode 并 `stdin.pause()`，在 Windows ConPTY 下可能导致输入失灵（曾导致“选择节点后卡死”）。退出、Ctrl-C、SIGTERM、崩溃时都会关闭鼠标上报并恢复终端。

打包说明：Ink 3 依赖的 `yoga-layout-prebuilt` 是 emscripten 产物，依赖非严格模式下的隐式全局变量，打包脚本里用一个小插件让它在 sloppy 模式下执行；`react-devtools-core` 只在 `DEV=true` 时加载，已标记为 external。

## 已知限制

- 未配置 Token 时，节点页只能拿到 V2EX API v1 返回的最新 10 条主题，无法翻页；配置 Token 后可用 `]` / `[` 翻页
- V2EX API 只读，不支持发帖、回复、感谢、收藏
- 不显示图片（以链接形式展示，可按 `o` 在浏览器查看）
- 代理只支持 http/https 代理，不支持 socks5
- 未登录的公共 API 限流为每小时 600 次 / IP
