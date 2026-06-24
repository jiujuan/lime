# Browser Runtime / Right Surface 骨架实施计划

更新时间：2026-06-24

状态：In Progress

主目标：先把 Browser 模块骨架落到 current 主链，再按阶段补 Chrome 类细节、CDP current 接线、Browser Assist 可见执行和 evidence。右侧栏内嵌浏览器是用户可见主路径，`lime-rs/crates/browser-runtime` 是外部 Chrome / CDP 自动化和观测事实源，二者通过 `browserSessionId / launchUrl / action trace / evidence refs` 收敛，不新增第二套 browser backend。

关联路线图：

- `internal/roadmap/browser/README.md`
- `internal/roadmap/rightsurface/README.md`
- `internal/roadmap/agentapp/v3/README.md`
- `internal/roadmap/agentworkbench/README.md`
- `internal/develop/traceable-agent-acceptance-methodology.md`

## 1. Skeleton-first 执行原则

1. 先实现模块骨架和事实源接线，再补细节体验。
2. P1 / P2 不新增顶层 package、Rust crate、Playwright production server 或 browser 专用 mock backend。
3. P1 继续复用 App Server `workspaceRightSurface/*` pending contract，通过 `metadata` 解析 browser intent；字段稳定后再提升为强类型 protocol。
4. CDP 不走旧 Electron / Tauri command。`launch_browser_session`、`close_chrome_profile_session` 只能作为旧 smoke 阻塞证据，不恢复为 current。
5. 每一阶段的 Partial / Evidence Gap / Fail 必须转成测试、contract、smoke、guard 或本计划 checklist。

## 2. Current / Compat / Dead 分类

| 分类       | 路径                                                                                       | 规则                                                                 |
| ---------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| current    | `electron/embeddedBrowserHost.ts`、`src/lib/api/embeddedBrowser.ts`                        | 内嵌 `WebContentsView` host 和 renderer typed API                    |
| current    | `src/components/agent/chat/workspace/right-surface/**`                                     | Right Surface `browser` tab、pending intent、launcher、host 渲染     |
| current    | `lime-rs/crates/app-server*/**` 的 `workspaceRightSurface/*`                               | Browser surface intent 的 App Server pending 事实源                  |
| current    | `lime-rs/crates/browser-runtime/src/**`                                                    | 外部 Chrome / CDP session、action、event buffer、后续 evidence facts |
| compat     | `src/components/agent/chat/components/canvas-workbench/browser/**`                         | 迁移来源和短期 thin panel 复用，不再新增 Browser Runtime 主能力      |
| deprecated | `src/lib/webview-api.ts` 中 rejectMissingBrowserRuntimeCurrent 的旧 browser runtime 命令面 | 只记录 current 缺口，不补 mock fallback                              |
| dead       | 旧 Tauri wrapper、`<webview>`、BrowserView、新增 legacy desktop facade                     | 不恢复、不接生产路径                                                 |

## 3. 阶段计划

### P1 Right Surface Browser 骨架

目标：用户或 App Server pending intent 能打开右侧 `browser` surface，并带上 `launchUrl / title / browserSessionId` 投影。

交付物：

- [x] `browser` surface kind / registry / available launcher 接入。
- [x] `RightSurfaceBrowserPanel` 复用现有 `CanvasWorkbenchBrowserPanel`，不新增 backend。
- [x] 顶部 Browser 按钮打开右侧栏，不弹系统浏览器。
- [x] `surfaceKind=browser` pending metadata 解析为 `WorkspaceRightSurfaceBrowserIntent`。
- [x] `priority=foreground` browser pending 自动打开右侧 browser surface。
- [x] `priority!=foreground` browser pending 只进入 launcher badge，用户点击后打开。
- [x] GUI smoke 复测右侧浏览器打开后不出现下拉空白或系统浏览器弹出。

写集：

- `src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.ts`
- `src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.ts`
- `src/components/agent/chat/AgentChatWorkspace.tsx`
- `src/components/agent/chat/workspace/right-surface/browser/**`
- 对应 `*.unit.test.ts(x)` / `*.test.tsx`

### P2 Chrome 类基础体验

目标：在不扩大 runtime 的前提下补齐用户感知最强的浏览器 chrome。

交付物：

- [x] stop / reload 状态合一。
- [x] favicon / title / loading progress。
- [x] find in page。
- [x] per-tab zoom。
- [x] 错误页分类：DNS / TLS / blocked / load failed。
- [x] bounds / visible 同步回归，覆盖切 tab / 收起 / resize。

### P3 Browser Session / Profile 合同

目标：把 embedded adapter 与 CDP adapter 的 session/profile 语义对齐，但不提前做完整 profile UI。

交付物：

- [x] 定义最小 `BrowserSessionRef`：`browserSessionId / profileKey / adapterKind / launchUrl / title / sourceRequestId`。
- [x] Right Surface browser intent、CDP session state 统一映射到该 ref。
- [x] Browser Assist metadata 统一映射到该 ref。
- [x] 临时 profile 清理和 task scoped profile 只做 host/runtime owner，不落 UI 大中心。

### P4 CDP Runtime current 接线

目标：让 `lime-rs/crates/browser-runtime` 从孤立 crate 进入 App Server / Runtime current method，不恢复旧 `launch_browser_session`。

候选 current method：

- `browserSession/target/list`
- `browserSession/open`
- `browserSession/read`
- `browserSession/close`
- `browserSession/event/list`
- `browserSession/action/execute`

交付物：

- [x] App Server protocol / client / processor / RuntimeCore owner 成组接入。
- [x] `BrowserRuntimeManager` 由 RuntimeCore 持有或通过明确 service owner 注入。
- [x] 前端 gateway 只进 `src/lib/api/browserRuntime.ts`，页面不直接 `safeInvoke`。
- [x] `smoke:browser-runtime` 迁到 current App Server method；通过 `--remote-debugging-port` attach 已启动的 Chrome / Chromium CDP，不再负责启动旧 Chrome session。
- [x] `npm run test:contracts` 覆盖新 method / mock 不回流。

P4 当前结论：Skeleton current 已收口。`browserSession/*` 已进入 App Server current 方法、Rust client、npm client、前端 API 网关、治理 catalog 和 `smoke:browser-runtime`；真实 smoke 仍要求用户先启动带 remote debugging port 的 Chrome / Chromium，例如 `--remote-debugging-port 9222`，避免恢复旧 `launch_browser_session`。

### P5 Browser Assist 可见执行

目标：`@浏览器` / `mcp__lime-browser__*` 绑定可见 `browserSessionId`，不退回 WebSearch。

交付物：

- [x] `@浏览器` 发送边界继续写 `browser_requirement / browser_launch_url`，关闭本轮 WebSearch，并触发 Browser Assist / 右侧 browser surface prime。
- [x] `@浏览器` 发送边界把当前可见 Browser Assist session 投影到 `harness.browser_assist.session_id / profile_key / launch_url / title / target_id / transport_kind / lifecycle_state / control_mode`。
- [x] `mcp__lime-browser__*` 工具结果与 current `BrowserSessionRef` / 右侧 visible session 首轮绑定：tool result -> `BrowserAssistSessionState` -> `BrowserSessionRef` -> Right Surface browser session facts / initialUrl。
- [x] Browser Assist navigate / observe 使用 current session ref：CDP session 走 App Server `browserSession/action/execute`，attached Chrome session 走 extension bridge，embedded ref 只做右栏展示不伪造控制。
- [x] 人工接管状态进入 Right Surface overlay 和 Runtime flags：`controlMode/lifecycleState` 统一投影为 `agent/human/shared/unknown`，右侧 browser surface 暴露 data flags，并在 `human/shared` 时显示接管 overlay。
- [x] 高风险动作走 action.required / confirmation skeleton：当前仅 `navigate / read_page / read_console_messages / read_network_requests` 自动执行，`click / type / form_input / javascript / unknown` 等动作 fail-closed 为 `tool_confirmation` 请求，并复用 `DecisionPanel` 的 `permission_facts` 风险展示。

### P6 Evidence / Replay

目标：浏览器动作、截图、DOM / accessibility、network、console 和人工接管都能进入 evidence。

交付物：

- [x] `browser_session` evidence artifact。
- [x] `browser_snapshot` evidence artifact。
- [x] `BrowserActionTrace` 带 `sessionId / tabId / actionId / status / evidenceRefs`。
- [x] `browser_network_log` / `browser_console_log` / `browser_screenshot` 文件级 evidence artifact。
- [x] 历史打开能恢复 snapshot 或 replay viewer，不自动继续危险动作。

## 4. 可追踪验收链

按 `Traceable Agent Acceptance Loop` 执行：

| 节点                   | current owner                                          | 可观测证据                                                 | 通过判据                                         | 失败分类         |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------ | ---------------- |
| Browser 入口           | TaskCenter / Right Surface launcher                    | launcher projection、组件回归                              | 点击后 active surface 是 `browser`               | `projection_gap` |
| Browser pending intent | App Server `workspaceRightSurface/*` + 前端 projection | pending request、`WorkspaceRightSurfaceBrowserIntent` 单测 | `launchUrl / title / browserSessionId` 可解析    | `protocol_gap`   |
| 右侧嵌入               | `RightSurfaceHost` + `RightSurfaceBrowserPanel`        | DOM / component test / GUI smoke                           | 浏览器在右侧 active pane，不弹系统浏览器         | `projection_gap` |
| Embedded view          | Electron Host                                          | host test、state event、GUI smoke                          | `WebContentsView` mount / navigate / bounds 成功 | `protocol_gap`   |
| CDP action             | `lime-rs/crates/browser-runtime`                       | Rust unit、App Server method、event buffer                 | action 有 session/action/result/error            | `evidence_gap`   |
| Browser Assist         | Runtime / Browser tools                                | `browser_requirement`、tool timeline、surface intent       | `@浏览器` 不退回 WebSearch，绑定可见 session     | `routing_gap`    |
| Evidence               | App Server `evidence/export`                           | `browser_session` / `browser_snapshot`                     | 可按 session/thread/turn/action join             | `evidence_gap`   |

## 5. 验证矩阵

P1 最低验证：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" \
  "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/RightSurfaceHost.unit.test.tsx" \
  "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.test.tsx"
npx eslint \
  "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.ts" \
  "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.ts" \
  "src/components/agent/chat/AgentChatWorkspace.tsx" \
  --max-warnings 0
npm run typecheck:electron
```

触碰命令 / App Server protocol 后追加：

```bash
npm run test:contracts
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-browser-runtime
```

触碰 GUI 主路径后追加：

```bash
npm run verify:gui-smoke
```

当前已知限制：

- `npm run smoke:browser-runtime` 已迁 current，但真实运行需要已启动的 Chrome / Chromium CDP 端口；本脚本只验证 `browserSession/*` attach / action / event / close，不负责启动浏览器进程。退出条件：如后续需要 task-scoped profile 自动拉起，应继续扩展 App Server current profile/session owner，不恢复旧 Electron Host 命令。
- `lime-rs/crates/app-server/src/processor/mod.rs` 已超过 `1000` 行；本轮只保留 method dispatch 接线，业务逻辑已拆到 `processor/browser_session.rs`。退出条件：后续新增 Browser Session method 时继续进入分域 processor，不再扩中心文件。
- `lime-rs/crates/browser-runtime/src/manager.rs` 已从 `1216` 行拆为 `344` 行 facade；`manager/session.rs` 只保留 `CdpSessionHandle` core / CDP command helpers，`manager/session_reader.rs` 承接 CDP reader，`manager/session_events.rs` 承接 event buffer / collection，`manager/session_stream.rs` 承接 screencast / screenshot fallback，`manager/session_lifecycle.rs` 承接 control lifecycle，`manager/cdp_targets.rs` 承接 CDP target discovery，`profile_scope.rs` 承接 task scoped profile owner / cleanup plan。退出条件：后续新增 trace、evidence、profile policy 时继续进分域子模块，不回填 `manager.rs` 或 `manager/session.rs`。
- `lime-rs/crates/app-server/src/runtime/evidence_provider/browser.rs` 已拆为 `35` 行 facade，`browser/action_index.rs` 承接既有 action index 逻辑，`browser/file_artifacts.rs` 承接 network / console / screenshot 文件级 evidence。退出条件：`browser/action_index.rs` 不再继续追加 network / console / screenshot 细节；后续新增 evidence 维度必须进入同级子模块。
- 标准 `npm run verify:gui-smoke` 已于 2026-06-25 重新跑通；此前 `dist/` EPERM 构建目录问题未复现。
- `src/components/agent/chat/AgentChatWorkspace.tsx` 已超过 `1000` 行；本轮仅做 Right Surface browser props 透传接线，控制状态判断已抽到 `workspaceBrowserControlMode.ts`，未在中心文件新增状态机。退出条件：后续继续扩 Browser Right Surface 时先抽 `workspaceRightSurfaceBrowserRuntime.ts` 或同级 facade，中心文件只保留 props 装配。

本轮已执行：

- [x] `npx vitest run "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" "src/components/agent/chat/workspace/right-surface/RightSurfaceHost.unit.test.tsx" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.test.tsx"`
- [x] `npx eslint "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" --max-warnings 0`
- [x] `npm run typecheck:electron`
- [x] `npm run verify:gui-smoke`
- [x] `npm run test:contracts`
- [x] `git diff --check`
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol browser_session`
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server browser_session`
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol`
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client`
- [x] `rustfmt --edition 2021 --check "lime-rs/crates/app-server-protocol/src/protocol/v0/browser_session.rs" "lime-rs/crates/app-server/src/runtime/browser_session.rs" "lime-rs/crates/app-server/src/processor/browser_session.rs" "lime-rs/crates/app-server-client/src/lib.rs"`
- [x] `npx vitest run "src/lib/api/browserRuntime.test.ts" "packages/app-server-client/tests/client.test.mjs"`
- [x] `npx vitest run "src/lib/governance/legacySurfaceCatalog.test.ts"`
- [x] `npm run check:protocol-types`
- [x] `node "scripts/check-app-server-client-contract.mjs"`
- [x] `npm run smoke:browser-runtime -- --remote-debugging-port 9333`（临时 headless Chrome，独立 user-data-dir；session / action / event / close 均通过）
- [x] `npx vitest run "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx"`
- [x] `npx eslint "src/components/agent/chat/workspace/workspaceBrowserSessionRef.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.ts" --max-warnings 0`
- [x] `npx vitest run "electron/embeddedBrowserHost.test.ts" "electron/ipcChannels.test.ts" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.test.tsx"`
- [x] `npx eslint "electron/embeddedBrowserHost.ts" "electron/embeddedBrowserHost.test.ts" "electron/ipcChannels.ts" "electron/ipcChannels.test.ts" "src/lib/api/embeddedBrowser.ts" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.test.tsx" --max-warnings 0`
- [x] `npm run typecheck:electron`
- [x] `npm run verify:gui-smoke`
- [x] `npx vitest run "electron/embeddedBrowserHost.test.ts" "electron/ipcChannels.test.ts" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.test.tsx"`（P2 title/favicon/progress/find/zoom）
- [x] `npx eslint "electron/embeddedBrowserHost.ts" "electron/embeddedBrowserHost.test.ts" "electron/ipcChannels.ts" "electron/ipcChannels.test.ts" "src/lib/api/embeddedBrowser.ts" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.test.tsx" --max-warnings 0`（P2 title/favicon/progress/find/zoom）
- [x] `npm run typecheck:electron`（P2 title/favicon/progress/find/zoom）
- [x] `npm run test:contracts`（P2 新增 Electron Host command 计数更新为 93）
- [x] `npm run verify:gui-smoke`（P2 右侧浏览器 chrome / Host bridge 触达 GUI 主路径）
- [x] `git diff --check`（P2 title/favicon/progress/find/zoom）
- [x] `npx vitest run "electron/embeddedBrowserHost.test.ts" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.test.tsx"`（P2 错误分类 / bounds visible）
- [x] `npx vitest run "electron/embeddedBrowserHost.test.ts" "electron/ipcChannels.test.ts" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"`（P2 错误分类 / 五语言文案 / bounds visible）
- [x] `npx eslint "electron/embeddedBrowserHost.ts" "electron/embeddedBrowserHost.test.ts" "src/lib/api/embeddedBrowser.ts" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.test.tsx" --max-warnings 0`（P2 错误分类 / bounds visible）
- [x] `npm run typecheck:electron`（P2 错误分类 / bounds visible）
- [x] `npm run test:contracts`（P2 错误分类 / bounds visible；Electron host command 计数保持 93，mock priority 为 0）
- [x] `npm run verify:gui-smoke`（P2 错误分类 / bounds visible；真实 Electron renderer、App Server、Claw shell 启动通过）
- [x] `npx vitest run "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts"`（P3 Browser Assist metadata -> `BrowserSessionRef`）
- [x] `npx eslint "src/components/agent/chat/workspace/workspaceBrowserSessionRef.ts" "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" --max-warnings 0`（P3 Browser Assist metadata -> `BrowserSessionRef`）
- [x] `npx vitest run "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts"`（P5 `@浏览器` visible session metadata / Browser Assist prime）
- [x] `npx eslint "src/components/agent/chat/workspace/browserControlLaunch.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/AgentChatWorkspace.tsx" "src/components/agent/chat/workspace/workspaceBrowserSessionRef.ts" "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" --max-warnings 0`（P5 `@浏览器` visible session metadata / Browser Assist prime）
- [x] `npx vitest run "src/components/agent/chat/utils/browserWorkbenchCommand.test.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/skill-selection/CharacterMention.test.tsx" "src/lib/api/skillCatalog.test.ts" "src/components/agent/chat/workspace/useWorkspaceBrowserAssistRuntime.test.tsx" "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts"`（P5 显式浏览器任务接线最低回归）
- [x] `npm run typecheck:electron`（P5 `@浏览器` visible session metadata / Browser Assist prime）
- [x] `npm run test:contracts`（P5 harness browser_assist session 投影扩展；Electron host command 计数保持 93，mock priority 为 0）
- [x] `npm run verify:gui-smoke`（P5 GUI 主路径；真实 Electron renderer、App Server、Claw shell 启动通过）
- [x] `npx vitest run "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/utils/browserAssistSession.test.ts" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.test.tsx"`（P5 `mcp__lime-browser__*` tool result -> `BrowserSessionRef` -> Right Surface browser facts）
- [x] `npx eslint "src/components/agent/chat/workspace/workspaceBrowserSessionRef.ts" "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.tsx" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.test.tsx" "src/components/agent/chat/AgentChatWorkspace.tsx" --max-warnings 0`（P5 第二刀窄写集）
- [x] `npx vitest run "src/components/agent/chat/utils/browserWorkbenchCommand.test.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/skill-selection/CharacterMention.test.tsx" "src/lib/api/skillCatalog.test.ts" "src/components/agent/chat/workspace/useWorkspaceBrowserAssistRuntime.test.tsx" "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.test.tsx"`（P5 显式浏览器任务、Browser Assist runtime、右栏 browser ref 回归）
- [x] `npm run typecheck:electron`（P5 第二刀）
- [x] `npm run verify:gui-smoke`（P5 第二刀 GUI 主路径；真实 Electron renderer、App Server、Claw shell、memory settings 启动通过）
- [x] `npm run test:contracts`（P5 第二刀；Electron host command 计数保持 93，mock priority 为 0）
- [x] `git diff --check -- "src/components/agent/chat/workspace/workspaceBrowserSessionRef.ts" "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.tsx" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.test.tsx" "src/components/agent/chat/AgentChatWorkspace.tsx" "internal/exec-plans/browser-runtime-right-surface-plan.md"`（P5 第二刀窄写集）
- [x] `npx vitest run "src/components/agent/chat/workspace/workspaceBrowserAssistControl.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceBrowserAssistRuntime.test.tsx" "src/components/agent/chat/workspace/workspaceBrowserRuntimeNavigation.unit.test.ts"`（P5 第三刀：navigate / observe 使用 current `BrowserSessionRef`）
- [x] `npx eslint "src/components/agent/chat/workspace/workspaceBrowserAssistControl.ts" "src/components/agent/chat/workspace/workspaceBrowserAssistControl.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceBrowserAssistRuntime.ts" "src/components/agent/chat/workspace/useWorkspaceBrowserAssistRuntime.test.tsx" "src/components/agent/chat/workspace/workspaceBrowserRuntimeNavigation.ts" "src/components/agent/chat/workspace/workspaceBrowserRuntimeNavigation.unit.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" --max-warnings 0`（P5 第三刀窄写集）
- [x] `npx vitest run "src/components/agent/chat/utils/browserWorkbenchCommand.test.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/skill-selection/CharacterMention.test.tsx" "src/lib/api/skillCatalog.test.ts" "src/components/agent/chat/workspace/useWorkspaceBrowserAssistRuntime.test.tsx" "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/workspaceBrowserAssistControl.unit.test.ts" "src/components/agent/chat/workspace/workspaceBrowserRuntimeNavigation.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.test.tsx"`（P5 第三刀扩展回归，192 tests passed）
- [x] `npm run typecheck:electron`（P5 第三刀）
- [x] `npm run test:contracts`（P5 第三刀；Electron host command 计数保持 93，mock priority 为 0）
- [x] `npm run electron:build:host`（P5 第三刀 dev-server GUI smoke 前置 host 构建）
- [x] `VITE_DEV_SERVER_URL="http://127.0.0.1:1420/" node "scripts/electron/smoke.mjs"`（P5 第三刀临时 GUI 证据；真实 Electron renderer、App Server、Claw shell、memory settings 启动通过）
- [x] `npm run verify:gui-smoke`（P5 第三刀标准入口 2026-06-25 重跑通过；renderer build、Electron host build、App Server sidecar、Claw shell、memory settings 均 ready）
- [x] `npx vitest run "src/components/agent/chat/workspace/workspaceBrowserControlMode.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.test.tsx"`（P5 人工接管 overlay / flags 定向回归）
- [x] `npx eslint "src/components/agent/chat/workspace/workspaceBrowserControlMode.ts" "src/components/agent/chat/workspace/workspaceBrowserControlMode.unit.test.ts" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.tsx" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.test.tsx" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" --max-warnings 0`（P5 人工接管 overlay / flags 窄写集）
- [x] `npx vitest run "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"`（P5 人工接管 overlay 五语言文案）
- [x] `npx vitest run "src/components/agent/chat/utils/browserWorkbenchCommand.test.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/skill-selection/CharacterMention.test.tsx" "src/lib/api/skillCatalog.test.ts" "src/components/agent/chat/workspace/useWorkspaceBrowserAssistRuntime.test.tsx" "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/workspaceBrowserAssistControl.unit.test.ts" "src/components/agent/chat/workspace/workspaceBrowserControlMode.unit.test.ts" "src/components/agent/chat/workspace/workspaceBrowserRuntimeNavigation.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.test.tsx"`（P5 人工接管 overlay / flags 扩展回归，196 tests passed）
- [x] `npm run typecheck:electron`（P5 人工接管 overlay / flags）
- [x] `npm run test:contracts`（P5 人工接管 overlay / flags；Electron host command 计数保持 93，mock priority 为 0）
- [x] `VITE_DEV_SERVER_URL="http://127.0.0.1:1420/" node "scripts/electron/smoke.mjs"`（P5 人工接管 overlay / flags 临时 GUI 证据；真实 Electron renderer、App Server、Claw shell、memory settings 启动通过）
- [x] `npx vitest run "src/components/agent/chat/workspace/workspaceBrowserAssistControl.unit.test.ts"`（P5 高风险动作 confirmation skeleton 定向回归，6 tests passed）
- [x] `npx eslint "src/components/agent/chat/workspace/workspaceBrowserAssistControl.ts" "src/components/agent/chat/workspace/workspaceBrowserAssistControl.unit.test.ts" --max-warnings 0`（P5 高风险动作 confirmation skeleton 窄写集）
- [x] `npx prettier --check "src/components/agent/chat/workspace/workspaceBrowserAssistControl.ts" "src/components/agent/chat/workspace/workspaceBrowserAssistControl.unit.test.ts" "internal/exec-plans/browser-runtime-right-surface-plan.md"`（P5 高风险动作 confirmation skeleton 格式检查）
- [x] `npx vitest run "src/components/agent/chat/utils/browserWorkbenchCommand.test.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/skill-selection/CharacterMention.test.tsx" "src/lib/api/skillCatalog.test.ts" "src/components/agent/chat/workspace/useWorkspaceBrowserAssistRuntime.test.tsx" "src/components/agent/chat/workspace/workspaceBrowserSessionRef.unit.test.ts" "src/components/agent/chat/workspace/workspaceBrowserAssistControl.unit.test.ts" "src/components/agent/chat/workspace/workspaceBrowserControlMode.unit.test.ts" "src/components/agent/chat/workspace/workspaceBrowserRuntimeNavigation.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceBrowserIntent.unit.test.ts" "src/components/agent/chat/workspace/right-surface/browser/RightSurfaceBrowserPanel.test.tsx"`（P5 高风险动作 confirmation skeleton 扩展回归，199 tests passed）
- [x] `npm run typecheck:electron`（P5 高风险动作 confirmation skeleton）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_exports`（P6 browser evidence 第一刀，11 tests passed）
- [x] `rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/evidence_provider.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports/browser.rs"`（P6 browser evidence 第一刀）
- [x] `git diff --check -- "lime-rs/crates/app-server/src/runtime/evidence_provider.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports/browser.rs"`（P6 browser evidence 第一刀）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server browser_session_action_result`（P6 BrowserActionTrace 第二刀，2 tests passed）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_exports`（P6 BrowserActionTrace 第二刀，11 tests passed）
- [x] `npx vitest run "src/components/agent/chat/components/harnessEvidenceViewModel.unit.test.ts"`（P6 BrowserActionTrace 第二刀，8 tests passed）
- [x] `rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/browser_session.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports/browser.rs"`（P6 BrowserActionTrace 第二刀）
- [x] `npx prettier --check "src/lib/api/agentRuntime/types.ts" "src/lib/api/agentRuntime/types.d.ts" "src/lib/api/agentRuntime/normalizers.ts" "src/components/agent/chat/components/harnessEvidenceViewModel.ts" "src/components/agent/chat/components/harnessEvidenceViewModel.unit.test.ts"`（P6 BrowserActionTrace 第二刀）
- [x] `git diff --check -- "lime-rs/crates/app-server/src/runtime/browser_session.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports/browser.rs" "src/lib/api/agentRuntime/types.ts" "src/lib/api/agentRuntime/types.d.ts" "src/lib/api/agentRuntime/normalizers.ts" "src/components/agent/chat/components/harnessEvidenceViewModel.ts" "src/components/agent/chat/components/harnessEvidenceViewModel.unit.test.ts"`（P6 BrowserActionTrace 第二刀）
- [x] `npm run test:contracts`（P6 BrowserActionTrace 第二刀；协议无漂移，Electron host command 计数保持 93，mock priority 为 0）
- [x] `npx vitest run "src/components/artifact/renderers/BrowserAssistRenderer.test.tsx"`（P6 replay 只读恢复第三刀，4 tests passed）
- [x] `npx vitest run "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"`（P6 replay 只读恢复第三刀，8 tests passed）
- [x] `npx eslint "src/components/artifact/renderers/BrowserAssistRenderer.tsx" "src/components/artifact/renderers/BrowserAssistRenderer.test.tsx" --max-warnings 0`（P6 replay 只读恢复第三刀）
- [x] `npx prettier --check "src/components/artifact/renderers/BrowserAssistRenderer.tsx" "src/components/artifact/renderers/BrowserAssistRenderer.test.tsx" "src/i18n/resources/zh-CN/workspace.json" "src/i18n/resources/zh-TW/workspace.json" "src/i18n/resources/en-US/workspace.json" "src/i18n/resources/ja-JP/workspace.json" "src/i18n/resources/ko-KR/workspace.json"`（P6 replay 只读恢复第三刀）
- [x] `git diff --check -- "src/components/artifact/renderers/BrowserAssistRenderer.tsx" "src/components/artifact/renderers/BrowserAssistRenderer.test.tsx" "src/i18n/resources/zh-CN/workspace.json" "src/i18n/resources/zh-TW/workspace.json" "src/i18n/resources/en-US/workspace.json" "src/i18n/resources/ja-JP/workspace.json" "src/i18n/resources/ko-KR/workspace.json"`（P6 replay 只读恢复第三刀）
- [x] `npx prettier --write "scripts/agent-runtime/claw-chat-current-fixture-right-surface-visual.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（P1/P2/P5 右侧 Browser 截图级验收）
- [x] `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（P1/P2/P5 右侧 Browser fixture guard，20 tests passed）
- [x] `npm run smoke:claw-chat-current-fixture -- --scenario right-surface-visual-matrix`（P1/P2/P5 真实 Electron GUI；`rightSurfaceVisualMatrix*` assertions 全部通过）
- [x] `git diff --check -- "scripts/agent-runtime/claw-chat-current-fixture-right-surface-visual.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（P1/P2/P5 右侧 Browser fixture guard）
- [x] `rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/evidence_provider/browser.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser/action_index.rs"`（P6 evidence provider action index 拆分）
- [x] `git diff --check -- "lime-rs/crates/app-server/src/runtime/evidence_provider/browser.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser/action_index.rs"`（P6 evidence provider action index 拆分）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_exports`（P6 evidence provider action index 拆分，11 tests passed）
- [x] `rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/evidence_provider.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser/action_index.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser/file_artifacts.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports/browser.rs"`（P6 browser file evidence）
- [x] `git diff --check -- "lime-rs/crates/app-server/src/runtime/evidence_provider.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser/action_index.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider/browser/file_artifacts.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports/browser.rs"`（P6 browser file evidence）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_exports`（P6 browser file evidence，11 tests passed；`lime-agent/request_tool_policy.rs` 仅剩 `unused import: uuid::Uuid` warning，未阻塞本轮）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-browser-runtime profile_scope`（P3 task scoped profile owner skeleton，2 tests passed）
- [x] `rustfmt --edition 2021 --check "lime-rs/crates/browser-runtime/src/manager.rs" "lime-rs/crates/browser-runtime/src/manager/session.rs" "lime-rs/crates/browser-runtime/src/manager/cdp_targets.rs" "lime-rs/crates/browser-runtime/src/lib.rs" "lime-rs/crates/browser-runtime/src/profile_scope.rs"`（BrowserRuntimeManager 拆分）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-browser-runtime`（BrowserRuntimeManager 拆分 / profile scope，8 tests passed）
- [x] `git diff --check -- "lime-rs/crates/browser-runtime/src/manager.rs" "lime-rs/crates/browser-runtime/src/manager/session.rs" "lime-rs/crates/browser-runtime/src/manager/cdp_targets.rs" "lime-rs/crates/browser-runtime/src/lib.rs" "lime-rs/crates/browser-runtime/src/profile_scope.rs"`（BrowserRuntimeManager 拆分）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_exports`（BrowserRuntimeManager 拆分下游回归，11 tests passed）
- [x] `rustfmt --edition 2021 --check "lime-rs/crates/browser-runtime/src/manager.rs" "lime-rs/crates/browser-runtime/src/manager/session.rs" "lime-rs/crates/browser-runtime/src/manager/session_events.rs" "lime-rs/crates/browser-runtime/src/manager/session_lifecycle.rs" "lime-rs/crates/browser-runtime/src/manager/session_reader.rs" "lime-rs/crates/browser-runtime/src/manager/session_stream.rs" "lime-rs/crates/browser-runtime/src/manager/cdp_targets.rs"`（BrowserRuntimeManager session 二次拆分）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-browser-runtime`（BrowserRuntimeManager session 二次拆分，12 tests passed）
- [x] `rustfmt --edition 2021 --check "lime-rs/crates/browser-runtime/src/action.rs" "lime-rs/crates/browser-runtime/src/evidence.rs" "lime-rs/crates/browser-runtime/src/lib.rs" "lime-rs/crates/app-server/src/runtime/browser_session.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports/browser.rs"`（P6 browser-runtime action result file evidence metadata）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-browser-runtime`（P6 browser-runtime action result file evidence metadata，12 tests passed）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server browser_session_action`（P6 action trace file evidence refs，3 tests passed）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_exports`（P6 action result -> evidence pack 回归，11 tests passed）
- [x] `node --check "scripts/browser-runtime-smoke.mjs"`（smoke action result metadata 断言）
- [x] `node "scripts/browser-runtime-smoke.mjs" --help`（smoke CLI 帮助路径）
- [x] `node "scripts/browser-runtime-smoke.mjs" --remote-debugging-port 9333`（临时 headless Chrome；断言 `browser_action_trace`、`browser_snapshot`、`browser_console_log`、`browser_network_log`、对应 `evidenceRefs`，`cleanup=pass`）
- [x] `rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime.rs" "lime-rs/crates/app-server/src/runtime/browser_session.rs"`（BrowserProfileScope App Server owner 生命周期）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server browser_profile`（BrowserProfileScope App Server owner 生命周期，2 tests passed）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server browser_session`（BrowserProfileScope close cleanup + browser action trace 回归，8 tests passed）
- [x] `node "scripts/browser-runtime-smoke.mjs" --remote-debugging-port 9333`（BrowserProfileScope close cleanup 真实 current 链路；临时 headless Chrome，`cleanup=pass`）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-browser-runtime`（DOM/accessibility file evidence metadata，14 tests passed）
- [x] `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_exports`（DOM/accessibility file evidence pack 导出，11 tests passed）
- [x] `node "scripts/browser-runtime-smoke.mjs" --remote-debugging-port 9333`（真实 CDP 断言 `browser_dom_snapshot` / `browser_accessibility_snapshot` metadata 与 `evidenceRefs`，`cleanup=pass`）
- [x] `npx vitest run "electron/embeddedBrowserHost.test.ts"`（完整产品 Host 右键菜单第一刀，12 tests passed）
- [x] `npx eslint "electron/embeddedBrowserContextMenu.ts" "electron/embeddedBrowserHost.ts" "electron/embeddedBrowserHost.test.ts" "electron/electronRuntime.ts" "electron/smokeMemorySettings.ts" --max-warnings 0`（完整产品 Host 右键菜单第一刀）
- [x] `npm run typecheck:electron`（完整产品 Host 右键菜单第一刀）
- [x] `npx prettier --check "electron/embeddedBrowserContextMenu.ts" "electron/embeddedBrowserHost.ts" "electron/embeddedBrowserHost.test.ts" "electron/electronRuntime.ts" "electron/smokeMemorySettings.ts" "internal/exec-plans/browser-runtime-right-surface-plan.md" "internal/roadmap/browser/README.md"`（完整产品 Host 右键菜单第一刀）
- [x] `node "scripts/check-command-contracts.mjs"`（完整产品 Host 右键菜单第一刀；Electron host command 计数保持 93，mock priority 为 0）
- [x] `git diff --check -- "electron/embeddedBrowserContextMenu.ts" "electron/embeddedBrowserHost.ts" "electron/embeddedBrowserHost.test.ts" "electron/electronRuntime.ts" "electron/smokeMemorySettings.ts" "internal/exec-plans/browser-runtime-right-surface-plan.md" "internal/roadmap/browser/README.md"`（完整产品 Host 右键菜单第一刀）
- [x] `npm run verify:gui-smoke`（完整产品 Host 右键菜单第一刀；renderer loaded、App Server initialized、Claw workbench shell ready、memory settings ready）
- [x] `npx vitest run "electron/embeddedBrowserHost.test.ts" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.test.tsx"`（完整产品 Host 下载第一刀，18 tests passed）
- [x] `npx eslint "electron/embeddedBrowserDownloads.ts" "electron/embeddedBrowserHost.ts" "electron/embeddedBrowserHost.test.ts" "src/lib/api/embeddedBrowser.ts" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserDownloadShelf.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserStatusOverlays.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.test.tsx" --max-warnings 0`（完整产品 Host 下载第一刀）
- [x] `npm run typecheck:electron`（完整产品 Host 下载第一刀）
- [x] `npx vitest run "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"`（完整产品 Host 下载第一刀五语言文案，8 tests passed）
- [x] `node "scripts/check-command-contracts.mjs"`（完整产品 Host 下载第一刀；Electron host command 计数保持 93，mock priority 为 0）
- [x] `npx prettier --check "electron/embeddedBrowserDownloads.ts" "electron/embeddedBrowserHost.ts" "electron/embeddedBrowserHost.test.ts" "src/lib/api/embeddedBrowser.ts" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserDownloadShelf.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserStatusOverlays.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.test.tsx" "src/i18n/resources/zh-CN/agent.json" "src/i18n/resources/zh-TW/agent.json" "src/i18n/resources/en-US/agent.json" "src/i18n/resources/ja-JP/agent.json" "src/i18n/resources/ko-KR/agent.json" "internal/roadmap/browser/README.md" "internal/exec-plans/browser-runtime-right-surface-plan.md"`（完整产品 Host 下载第一刀）
- [x] `git diff --check -- "electron/embeddedBrowserDownloads.ts" "electron/embeddedBrowserHost.ts" "electron/embeddedBrowserHost.test.ts" "src/lib/api/embeddedBrowser.ts" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserDownloadShelf.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserStatusOverlays.tsx" "src/components/agent/chat/components/canvas-workbench/browser/CanvasWorkbenchBrowserPanel.test.tsx" "src/i18n/resources/zh-CN/agent.json" "src/i18n/resources/zh-TW/agent.json" "src/i18n/resources/en-US/agent.json" "src/i18n/resources/ja-JP/agent.json" "src/i18n/resources/ko-KR/agent.json" "internal/roadmap/browser/README.md" "internal/exec-plans/browser-runtime-right-surface-plan.md"`（完整产品 Host 下载第一刀）
- [x] `npm run verify:gui-smoke`（完整产品 Host 下载第一刀；renderer loaded、App Server initialized、Claw workbench shell ready、memory settings ready）

## 6. 进度日志

- 2026-06-24：建立本执行计划，确认 skeleton-first 策略；P1 已有 Right Surface browser tab / Electron embedded browser 修复 / startup file URL 修复；本轮新增 browser pending intent 纯投影和 foreground 自动打开骨架，并通过 P1 定向 Vitest、ESLint、`typecheck:electron`、`verify:gui-smoke`、`test:contracts`、`git diff --check`。
- 2026-06-24：P4 skeleton-first 第一刀落地：新增 `browserSession/target/list|open|read|close|event/list|action/execute` App Server method，接入 `app-server-protocol`、`app-server` processor / RuntimeCore、Rust `app-server-client`、npm `packages/app-server-client`、前端 `src/lib/api/browserRuntime.ts` 和 `agentCommandCatalog`；新增 contract guard 防 `launch_browser_session / close_chrome_profile_session` 回流。定向 Rust / TS / contract 验证已过。
- 2026-06-24：P4 skeleton-first 第二刀落地：`scripts/browser-runtime-smoke.mjs` 改为 `app_server_handle_json_lines -> browserSession/*` current JSON-RPC flow，要求 `--remote-debugging-port` 或 `LIME_BROWSER_RUNTIME_REMOTE_DEBUGGING_PORT`，覆盖 `target/list -> open -> read -> action/execute(read_page|read_console_messages|read_network_requests) -> event/list -> close`；contract guard 已纳入该 smoke，并禁止旧 browser runtime command 回流。已用临时 headless Chrome `9333` 跑通真实 smoke：`session=6ca1c153-6449-4fdc-8edd-46a297ea6fac`、`networkEvents=2`、`browserEvents=15`、`cleanup=pass`。
- 2026-06-24：P3 skeleton-first 第一刀落地：新增 `workspaceBrowserSessionRef.ts`，定义最小 `BrowserSessionRef` 并提供 Right Surface intent / CDP session state projection；`WorkspaceRightSurfaceBrowserIntent` 现在带 `sessionRef`，不改变现有 browser surface 打开行为。定向 Vitest / ESLint 已过。
- 2026-06-24：P2 skeleton-first 第一刀落地：新增 `embedded_browser_view_stop` current Electron Host command，renderer API 增加 `stopLoadingEmbeddedBrowserView`，Browser chrome 在 loading 时将 refresh 按钮切换为 stop；五语言文案和组件/host/ipc 回归已补，`test:contracts` 通过且 Electron host command 计数更新为 90。
- 2026-06-24：P2 skeleton-first 第二刀落地：新增 `embedded_browser_view_find_in_page`、`embedded_browser_view_stop_find_in_page`、`embedded_browser_view_set_zoom` current Electron Host command；`EmbeddedBrowserViewState` 增加 `faviconUrl / loadProgress / zoomFactor / find`，Browser chrome 显示页面 title、favicon、加载进度条、页内查找和单标签缩放。五语言文案、Electron host/ipc/组件回归已补，定向 Vitest / ESLint / `typecheck:electron` 已过。
- 2026-06-24：P2 skeleton-first 第三刀落地：`embedded-browser-view-load-failed` 增加 `failureCategory=dns|tls|blocked|aborted|load_failed`，renderer API fail-closed 校验该字段，Browser 错误页按 DNS / TLS / blocked / generic 分类展示五语言文案；补 component 回归覆盖 overlay 隐藏、零尺寸收起、resize 恢复时的 `visible` 同步，避免右侧 view 下拉空白或错位。定向 Vitest / ESLint / `typecheck:electron` / `test:contracts` / `verify:gui-smoke` 已过。
- 2026-06-24：P3 skeleton-first 第二刀落地：`buildBrowserSessionRefFromBrowserAssistMetadata` 支持 `harness.browser_assist` / `harness.browserAssist` / `browser_assist` / `browserAssist` / `browser` 中的 snake/camel session、profile、url、title 和 adapter 字段；`WorkspaceRightSurfaceBrowserIntent` 复用该投影，把 Browser Assist metadata 归一到 `BrowserSessionRef`。显式未知 adapter 保持 `unknown`，避免将 extension / existing-session 类 metadata 错误声明为 CDP。定向 Vitest / ESLint 已过。
- 2026-06-24：P5 skeleton-first 第一刀落地：`@浏览器` / `@Browser Agent` / `@Mini Tester` 显式浏览器命令发送时以 `browserRequirementForSend` 统一驱动 metadata、关闭 WebSearch、禁用快速响应普通聊天路由，并在发送前调用 `ensureBrowserAssistCanvas(..., navigationMode=explicit-url|best-effort)` 触发右侧 browser surface prime；当前可见 Browser Assist session 会写入 `harness.browser_assist.session_id / profile_key / launch_url / title / target_id / transport_kind / lifecycle_state / control_mode`，后端和后续 Browser tools 可按该 visible session 继续接管。定向 Vitest / ESLint / `typecheck:electron` / `test:contracts` / `verify:gui-smoke` 已过。
- 2026-06-24：P5 skeleton-first 第二刀落地：新增 `buildBrowserSessionRefFromBrowserAssistSessionState`，把 `mcp__lime-browser__*` 工具结果提取出的 `BrowserAssistSessionState` 投影成 current `BrowserSessionRef`；Right Surface browser wrapper 接收并暴露 `sessionRef` facts，`AgentChatWorkspace` 在没有 pending browser intent 时回退使用当前 Browser Assist session ref 驱动右栏 browser 的 initialUrl / title / session facts。`cdp_frames` 映射为 CDP，`existing_session` 保持 `unknown`，避免误把 Chrome extension / attached session 声明为 CDP。定向 Vitest / ESLint / `typecheck:electron` / `test:contracts` / `verify:gui-smoke` 已过。
- 2026-06-24：P5 skeleton-first 第三刀落地：新增 `workspaceBrowserAssistControl.ts` 纯 planner，Browser Assist navigate / observe 统一以 `BrowserSessionRef` 做分流；CDP current session 调 App Server `browserSession/action/execute` 的 `navigate/read_page`，attached Chrome session 继续调用 extension bridge，embedded ref 明确不生成自动化控制计划。`useWorkspaceBrowserAssistRuntime` 在已有 session 且无新 URL 时会非阻塞 `read_page` 刷新当前页面状态；`resolveBrowserRuntimeNavigationFromBrowserAssist` 也优先使用同一份 `BrowserSessionRef`。定向 Vitest / ESLint 已过。
- 2026-06-24：P5 第三刀补验证：`typecheck:electron`、`test:contracts`、`electron:build:host` 和 dev-server 路径的真实 Electron smoke 已过；当日标准 `verify:gui-smoke` 曾因本机 `dist/` 目录 `EPERM` 未过，已登记为环境限制，后续于 2026-06-25 重跑通过。
- 2026-06-24：P5 第四刀落地：新增 `workspaceBrowserControlMode.ts`，把 `agent / human / shared` 以及兼容的 `human_takeover / waiting_for_human / inspect` 投影为 Right Surface browser runtime flags；`RightSurfaceBrowserPanel` 暴露 `data-browser-control-*` 和 `data-browser-human-takeover`，并在 `human/shared` 状态显示轻量 overlay。`WorkspaceRightSurfaceBrowserIntent` 同步解析 pending metadata 中的 `controlMode / lifecycleState`，`AgentChatWorkspace` 将 Browser Assist session 或 pending intent 的控制状态透传到右侧栏。五语言文案、定向 Vitest / ESLint / `typecheck:electron` / `test:contracts` / dev-server Electron smoke 已过。
- 2026-06-24：P5 第五刀落地：`workspaceBrowserAssistControl.ts` 增加 action policy skeleton，当前自动执行白名单只覆盖导航和读类动作；页面点击、输入、表单、脚本执行、下载/上传和未知动作统一生成 `tool_confirmation` confirmation request，并写入结构化 `permission_facts`，复用现有 `DecisionPanel` 风险、范围和一次性授权展示，不新增 browser 私有确认 UI 或 Electron/App Server 命令。定向 Vitest / ESLint / P5 扩展回归 / `typecheck:electron` 已过。
- 2026-06-24：P6 第一刀落地：新增 App Server basic evidence provider 的 `browser` 子模块，从 runtime events / artifact metadata 提取 `browser_session`、`browser_snapshot` 和 `browser_action_index`，并挂到 `observability_summary.modality_runtime_contracts.snapshot_index.browser_action_index`；`evidence/export` 现在可导出浏览器 session / snapshot artifact，不新增协议字段、不耦合 live `BrowserRuntimeManager`。定向 `app-server evidence_exports`、`rustfmt --check`、`git diff --check` 已过。首轮测试暴露 `tool.result` 顺序和 `result.data.browser_session` 深层候选缺口，已在测试和 parser 中收口。
- 2026-06-24：P6 第二刀落地：`browserSession/action/execute` 复用现有 `result: serde_json::Value` 扩展点，在 CDP action result 中附加 `browser_action_trace`，最小字段包含 `sessionId / tabId / actionId / action / status / success / evidenceRefs / profileKey / backend / lastUrl / title`；Evidence provider 可从 root / payload / result / result.data / item.payload.result.data 等候选路径抽取 trace，`browser_action_index.items` 同步输出 `action_id / tab_id / evidence_refs`；前端 `agentRuntime` normalizer 和 `buildBrowserReplayArtifact` 将这些 join keys 投影到 replay artifact meta。定向 Rust / Vitest / 格式 / contract 验证已过，未新增 App Server method 或 schema。
- 2026-06-24：P6 第三刀落地：复用现有 `HarnessEvidencePackCard -> buildBrowserReplayArtifact -> BrowserAssistRenderer` 链路打开历史 evidence replay，不新增第二套 viewer；`BrowserAssistRenderer` 现在解析并展示 `actionId / tabId / evidenceRefs`，并在 replay header 显示“只读复盘”标识，明确历史恢复只展示 `browser_snapshot / browser_action_index` 证据，不自动继续 click / type / javascript 等危险动作。五语言文案和 renderer / i18n 回归已过。
- 2026-06-24：P1/P2/P5 真实截图级 GUI 复测完成：扩展 `right-surface-visual-matrix` fixture，让 `workspaceRightSurface/request` 覆盖 `surfaceKind=browser`，summary 保留 browser request，并在 browser stable 后落专用截图 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-right-surface-browser.png`。最新真实 Electron fixture 通过，`rightSurfaceVisualMatrixRequestedThroughAppServer / BrowserSurfaceVisible / HostsFillRightSide / SurfacesMutuallyExclusive` 均为 true；browser root 位于 active pane `x=796 y=48 width=632 height=940`，`rootActivePaneHeightDelta=0`，`rootFillsSurfaceViewport=true`，`sessionId=fixture-browser-session`、`profileKey=fixture-profile`、`adapterKind=cdp`、`controlMode=inspect`、`controlOwner=shared` 可见。目视 PNG 显示浏览器 chrome、地址栏和页面在 Lime 右侧栏内，无系统浏览器弹出迹象，无下拉空白。
- 2026-06-24：P6 evidence provider 防膨胀拆分完成：`lime-rs/crates/app-server/src/runtime/evidence_provider/browser.rs` 从 788 行收敛为 20 行 facade，既有 browser action index / artifact extraction 逻辑移动到 `browser/action_index.rs`；`evidence_provider.rs` 对外函数名和 `evidence/export` JSON 行为不变。`rustfmt --check`、`git diff --check` 和 `cargo test -p app-server evidence_exports` 已过。
- 2026-06-24：P6 browser file evidence 落地：新增 `browser/file_artifacts.rs`，从 runtime events / artifact metadata 中识别 `browser_network_log`、`browser_console_log`、`browser_screenshot`，导出到 evidence pack artifacts，并在 `observability_summary.modality_runtime_contracts.file_evidence.browser_file_artifacts` 中输出 artifact / kind / session / tab / action / evidenceRefs 统计。测试覆盖 network、console 和 snapshot metadata 的 screenshot join；不新增 App Server protocol/schema，不引入 replay engine，也不触碰 Electron / GUI / mock fallback。`rustfmt --check`、`git diff --check` 和 `cargo test -p app-server evidence_exports` 已过。
- 2026-06-24：P3 / BrowserRuntimeManager 防膨胀拆分完成：新增 `profile_scope.rs`，用纯 Rust 数据结构定义 `BrowserProfileOwner`、`BrowserProfileScope` 和 owner cleanup plan，先只表达 task scoped profile owner / cleanup 语义，不新增 App Server method、UI 或完整 profile 中心；随后将 `manager.rs` 按职责拆为 facade + `manager/session.rs` + `manager/cdp_targets.rs`，保留 `manager::CdpSessionHandle`、`manager::fetch_cdp_targets`、`manager::is_cdp_endpoint_alive` 既有访问路径。`manager.rs` 从 `1216` 行降到 `339` 行，`session.rs` 为 `787` 行，低于 `800` 行预警线。`lime-browser-runtime` 全 crate 测试和 `app-server evidence_exports` 下游回归已过。
- 2026-06-24：BrowserRuntimeManager session 二次拆分完成：在不改变 `CdpSessionHandle` 对外 API 的前提下，将 `manager/session.rs` 从 `787` 行继续拆为 `session.rs` core、`session_reader.rs`、`session_events.rs`、`session_stream.rs`、`session_lifecycle.rs`；最大文件降为 `manager.rs` `344` 行 / `session_reader.rs` `267` 行。`rustfmt --check` 与 `cargo test -p lime-browser-runtime` 已过。
- 2026-06-24：P6 action result file evidence metadata 落地：新增 `lime-rs/crates/browser-runtime/src/evidence.rs`，`browser-runtime` action result 现在会生成稳定 `actionId`，并按当前 action event cursor 输出 `browser_network_log`、`browser_console_log`、`browser_screenshot` metadata；`read_network_requests` / `read_console_messages` 即使结果为空也会输出对应 log metadata，`navigate / read_page / get_page_info / get_page_text` 会 best-effort 尝试 `Page.captureScreenshot` 并输出 screenshot artifact metadata。App Server `attach_browser_action_trace` 会把 file evidence refs 合并进 `browser_action_trace.evidenceRefs`，`evidence_exports` 回归覆盖 action result 同级 metadata -> evidence pack artifacts / summary。未新增协议、UI 或完整录制回放引擎。
- 2026-06-24：`smoke:browser-runtime` action result metadata 断言补齐：`scripts/browser-runtime-smoke.mjs` 现在会验证 `read_page.result.browser_action_trace`、`browser_snapshot:{sessionId}:{actionId}`，并对 `browser_screenshot` 做 best-effort 合法性断言；`read_console_messages` / `read_network_requests` 强制验证 `browser_console_log` / `browser_network_log` metadata、artifact path、entryCount 和 file-level `evidenceRefs`。本机 DevBridge + 临时 headless Chrome `9333` 真实 smoke 已过，`session=cf882697-9e3d-41dc-9dd3-d3832aa6a8e9`，`readPageAction=browser-action-be9272f8-5ec2-40b7-9ec8-71bdb43b45fe`，`consoleAction=browser-action-869b9143-e92e-438f-baaa-4203cc26c26b`，`networkAction=browser-action-4fc68349-8302-407f-80f9-d792abc3b7fe`，`cleanup=pass`。
- 2026-06-25：BrowserProfileScope 接入 App Server current owner 生命周期：`RuntimeCoreState` 现在维护 `browser_profile_scopes`，`browserSession/open` 成功后按返回的 `sessionId/profileKey` 注册 task-scoped owner，`browserSession/close` 先生成 owner cleanup plan，再按 profileKey 关闭同 owner 会话并移除 scope；不新增 App Server protocol 字段、profile UI 或旧 Electron Host 命令。定向 `browser_profile`、`browser_session` Rust 回归和临时 headless Chrome `9333` 真实 `browser-runtime-smoke` 已过，最新 smoke `session=d347adb0-e60b-45f5-a8dc-e0e467b1dbd5`，`cleanup=pass`。
- 2026-06-25：标准 GUI smoke 环境限制关闭：`npm run verify:gui-smoke` 重新跑通，覆盖 renderer build、Electron host build、App Server sidecar、renderer loaded、App Server initialized、Claw workbench shell ready、memory settings ready；此前 `dist/` EPERM 未复现。
- 2026-06-25：DOM/accessibility facts 进入 Browser file evidence：`browser-runtime` 对 `navigate/read_page/get_page_info/get_page_text` best-effort 生成 `browser_dom_snapshot` 与 `browser_accessibility_snapshot` metadata，并把 `browser_dom:*` / `browser_accessibility:*` refs 合并进 `browser_action_trace.evidenceRefs`；App Server `browser/file_artifacts.rs` 会导出对应 EvidencePack artifacts 和 summary 计数。`lime-browser-runtime` 全 crate、`app-server evidence_exports` 和真实 DevBridge + headless Chrome `9333` smoke 已过，最新 smoke `session=52da1cf9-a867-4766-b2a6-5fddb520d6b4`，`cleanup=pass`。
- 2026-06-25：完整产品 Host 右键菜单第一刀落地：新增 `electron/embeddedBrowserContextMenu.ts`，`WebContentsView` 的 `context-menu` 事件现在生成受控菜单，覆盖链接在当前标签打开、系统浏览器打开、复制链接、复制图片、复制图片地址、图片另存为、页面后退/前进/刷新/复制当前页地址/系统浏览器打开当前页；editable 和选中文本继续走 Electron role，inspect 仍默认不开放。自定义 menu label 覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`，未新增 IPC command、App Server method、profile UI 或旧 Tauri 路径。定向 Vitest / ESLint / `typecheck:electron` / command contract / GUI smoke 已过。
- 2026-06-25：完整产品 Host 下载第一刀落地：新增 `electron/embeddedBrowserDownloads.ts`，监听 `persist:embedded-browser` session 的 `will-download`，按 `viewId` 发出 `embedded-browser-view-download` fact，字段仅包含 `downloadId / url / filename / mimeType / state / receivedBytes / totalBytes / canResume`，不向 Renderer / Agent 暴露本地保存路径；`src/lib/api/embeddedBrowser.ts` 增加 typed listener，Browser 面板显示最近下载的文件名、状态和进度条。下载 shelf 和状态 overlay 已拆到 `CanvasWorkbenchBrowserDownloadShelf.tsx` / `CanvasWorkbenchBrowserStatusOverlays.tsx`，`CanvasWorkbenchBrowserPanel.tsx` 降到 798 行。五语言文案、Host / 组件回归、ESLint、`typecheck:electron`、command contract、GUI smoke 已过；未新增 IPC command、App Server method、下载管理中心或 profile UI。
- 2026-06-25：完整产品 Host 权限请求第一刀落地：新增 `electron/embeddedBrowserPermissions.ts`，在 `persist:embedded-browser` session 上安装 `setPermissionRequestHandler`，对页面权限请求默认 `callback(false)` fail-closed，并按 `viewId` 发出 `embedded-browser-view-permission-request` fact，字段包含 `requestId / permission / url / requestingUrl / embeddingOrigin / decision=blocked`；Renderer 只通过 `src/lib/api/embeddedBrowser.ts` typed listener 消费，Browser 面板新增最小权限阻止提示，不新增 allow/deny command、完整权限中心、profile UI 或 App Server method。为守住体量边界，Host 维持 784 行，Browser 面板降到 771 行，错误展示 resolver 继续留在 `CanvasWorkbenchBrowserStatusDisplay.ts` 纯工具文件。定向 Host / 组件 Vitest、五语言 i18n、ESLint、`typecheck:electron`、command contract、`git diff --check`、标准 `verify:gui-smoke` 已过；完整 `test:contracts` 仍失败在既有 `request_tool_policy.rs` WebSearch preflight snippet 缺口，非本轮 Browser Host 权限链路引入。
- 2026-06-25：Browser action trace 查询面落地：复用现有 `evidence/export -> browser_action_index`，不新增 App Server method、schema 或 replay engine；`browser/action_index.rs` 现在从 `AgentEvent.thread_id / turn_id`、artifact metadata 和 browser action trace metadata 中抽取 `thread_id / turn_id / content_id / executor`，summary 输出 `thread_ids / turn_ids / content_ids / executor_counts`，每个 item 保留同样 join keys；前端 `agentRuntime` normalizer / types 同步这些字段，`buildBrowserReplayArtifact` 透传到 replay meta，并新增 `filterBrowserActionIndexItems` 纯函数支持按 `threadId / turnId / contentId / executor` 组合过滤。定向 `app-server evidence_exports`、`harnessEvidenceViewModel.unit.test.ts`、`rustfmt --check`、Prettier、ESLint、`typecheck:electron`、command contract 已过；全量 `npm run typecheck` 两次运行超过本轮等待窗口仍无输出，已中断并作为验证缺口记录。

当前非本轮阻塞：`npm run test:contracts` 仍会在 `scripts/check-app-server-client-contract.mjs` 阶段失败，失败项均指向 `lime-rs/crates/agent/src/request_tool_policy.rs` 的 WebSearch preflight contract snippet 缺口；本轮 Browser Host 右键菜单 / 下载没有修改该文件，也没有新增命令。Browser 相关命令边界已用 `node scripts/check-command-contracts.mjs` 单独验证通过。

## 7. 下一刀

1. 补高风险动作从 `action.required / confirmation skeleton` 到 human takeover 的闭环证据，仍不新增 browser 私有确认 UI。
2. Agent App Browser intent 授权：App 只提交 Browser intent，Host / Right Surface 负责权限提示和受控浏览，不复制浏览器 UI。
3. 若继续扩展 evidence / profile 维度，优先新增或拆分分域子模块，不回填 `manager.rs`、`manager/session.rs`、`browser/action_index.rs` 或 App Server protocol。
