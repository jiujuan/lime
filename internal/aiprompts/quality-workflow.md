# 工程质量工作流

状态：current

本页定义 Lime 的交付证据层级。架构边界以 [architecture.md](architecture.md) 为准；命令契约细节见 [commands.md](commands.md)。

## 选择校验

先跑最贴近风险的定向检查，再按实际变更扩大。全量检查不能替代真实 GUI 或跨层证据。

| 改动 | 最低验证 |
| --- | --- |
| 纯 TypeScript projection / selector | 受影响 `*.unit.test.ts` + lint/typecheck |
| React 组件 / hook | 定向 unit 或 component test；用户可见变更补五语言资源与稳定回归 |
| Rust crate | `npm run test:rust:related -- <paths...>` 或 crate 定向测试 |
| JSON-RPC、preload、DevBridge、typed client | `npm run test:contracts` + 受影响 Rust/TS 测试 |
| Agent runtime / stream / projection | `npm run smoke:agent-runtime-current-fixture` |
| GUI 壳、Workspace、主路径 | `npm run verify:gui-smoke` |
| 真实 Electron 交互闭环 | Gate B fixture 或对应 Electron smoke |
| 版本、Forge、workspace manifest | `npm run verify:app-version` |
| 脚本目录边界 | `npm run governance:scripts` |

默认本地入口是 `npm run verify:local`。前端全量测试中断后使用 `npm run test:resume` 或相关 batch 参数续跑，避免丢失已有批次结果。Rust workspace 改动从 `lime-rs/Cargo.toml` 启动，不直接调用孤立 `rustc`。

## Gate A 与 Gate B

| Gate | 证明内容 | 不能证明 |
| --- | --- | --- |
| Gate A | browser / renderer projection、fixture event、read model 到 UI 的展示语义 | Electron main、preload、IPC、sidecar 与真实产品链 |
| Gate B | Electron、preload、`app_server_handle_json_lines`、App Server JSON-RPC、runtime/read model 与可见 UI 的完整链 | live provider 的正确性，除非场景明确要求 |

Gate A 不能替代 Gate B。Agent runtime fixture 不使用 production mock fallback；外部 fixture backend 必须仍通过 App Server、read model 与真实产品事件链。

## 生产与测试边界

- 生产 Renderer、Electron、App Server 和 GUI smoke 不得回退 `defaultMocks`、`mockPriorityCommands`、`invokeMockOnly`、renderer mock 或 App Server mock backend。
- 测试可以显式使用 `src/lib/desktop-host/` fixture、mock backend 或受控 external backend，但不得把它们作为可交付的生产链证据。
- 用户可见文案必须覆盖 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR`；协议 enum、schema 与 evidence facts 不本地化。

## 架构确认

重大架构变更必须更新 [architecture.md](architecture.md)，并由责任开发者在执行计划与 PR 描述中完成确认。CI 会运行 `npm run governance:architecture-confirmation`：每个 PR 都必须声明重大或非重大；触及架构敏感路径时必须声明重大并填写架构影响、架构图章节、责任人和日期。

## 常用入口

```bash
npm run verify:local
npm run test:contracts
npm run test:rust:related -- <paths...>
npm run smoke:agent-runtime-current-fixture
npm run verify:gui-smoke
npm run smoke:claw-chat-current-fixture
npm run governance:legacy-report
```

需要真实点击、截图或复用浏览器会话时继续阅读 [playwright-e2e.md](playwright-e2e.md)。
