# GUI、Electron 与真实交互门禁

> status: target GUI contract
> owner: agent-ui + desktop-host
> last_verified: 2026-07-12

## GUI 不是 TUI 移植

Codex TUI 只提供三项可复制内容：typed app-server facade、结构化事件消费、状态/fixture 测试。Lime 必须保留桌面 GUI 的：

- 多列工作区、时间线、artifact/media workbench。
- 文件/目录选择、窗口、通知、更新和 sidecar 生命周期。
- 五语言文案：`zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR`。
- 可访问性、响应式布局、真实 Electron 交互和离线/失败状态。

禁止复制 TUI 的 terminal cell、键盘布局、ANSI 渲染和 CLI onboarding。

## Renderer 分层

```text
Scene composition (JSX)
  -> domain view model / command model
  -> pure RuntimeProjection
  -> src/lib/api typed gateway
  -> app-server-client / Desktop Host
```

`AgentChatWorkspace.tsx` 只做 scene composition；新逻辑按以下方向拆分：

| 目标模块 | 职责 |
| --- | --- |
| `chat-command-model` | send/interrupt/approval/queue/attachment intent |
| `chat-runtime-projection` | Thread/Turn/Item -> visible model |
| `chat-scene-composition` | 主区、timeline、workbench、right surface 组装 |
| `chat-host-capabilities` | 文件、窗口、通知、sidecar 状态 |
| `message-renderers` | text/reasoning/tool/media/artifact 单项渲染 |

单一 consumer 不先抽 package；只有两个以上独立 consumer 共享稳定 contract 才进入 `packages/`。

## Electron 边界

Electron 只做：

- preload/contextBridge 和 IPC 白名单。
- `app_server_handle_json_lines` 转发与 sidecar 启停。
- 窗口、文件/目录选择、系统通知、外链、更新、浏览器/语音等宿主能力。

Electron 不做：Thread/Turn/Item、model request、tool execution、read model、provider fallback、GUI mock。

## Gate A / Gate B

| Gate | 证明 | 不能证明 |
| --- | --- | --- |
| Gate A | browser/renderer fixture、notification/read model 到 projection 的正确性 | preload、IPC、sidecar、真实 Electron |
| Gate B | Electron、preload、IPC、App Server JSON-RPC、runtime/read model、可见 GUI 完整闭环 | live provider 的商业/网络质量 |

涉及 Workspace、bridge、Agent 主路径的切片必须至少有 Gate B；只跑 Vitest 或浏览器截图不算产品完成。

## 失败与可见性

GUI 必须显示 accepted/queued/running/completed/failed/interrupted/approval pending 和 recovery 状态。任何失败都不能静默 fallback 到 mock 或“完成”文案。用户可见文案从 i18n resource 读取，不能硬编码在 projection 或 Rust error 中。

## 验证

```bash
npm run verify:gui-smoke
npm run smoke:agent-runtime-current-fixture
npm run test:contracts
npm run i18n:check:json
```

真实点击、截图和窗口状态需要使用 `lime-playwright-e2e`/对应 Playwright 证据；浏览器 Gate A 不替代 Electron Gate B。
