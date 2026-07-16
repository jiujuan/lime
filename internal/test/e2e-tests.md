# Lime E2E、Gate A 与 Gate B

> status: current / Refactor v2
> detailed_playbook: `internal/aiprompts/playwright-e2e.md`

## 1. 当前事实源

### current

- `npm run electron:dev`：启动当前 Electron GUI 开发链。
- `npm run smoke:electron`：Electron GUI 最小 smoke。
- `npm run verify:gui-smoke`：GUI 主路径最低聚合门禁。
- `npm run test:contracts`：Electron/App Server/typed client 边界校验。
- `npm run smoke:agent-runtime-current-fixture`：Agent runtime current fixture。
- `npm run smoke:agent-session-history-electron-fixture`、`npm run smoke:code-artifact-workbench-electron-fixture` 等真实 Electron 专项 Gate B。
- `internal/aiprompts/playwright-e2e.md`：真实点击、截图、控制台和续测细则。

### supplement

- `npm run test:e2e`：Vitest e2e layer，可能覆盖多模块流程，但不自动证明 Electron/preload/IPC。
- 普通 Chrome/browser mirror：只作为 Gate A。
- CDP attach：观察通道；只有接入真实 Electron 且满足 Gate B 断言时才算 Gate B。
- live provider smoke：只证明声明的 provider/model/config，不替代 deterministic fixture。

## 2. Gate A

Gate A 验证 Renderer projection、DOM、交互、文案、错误状态和五语言。可以使用显式 fixture/event replay，但必须标记 `test-only`。

Gate A 至少记录：

- route/page 与 candidate；
- fixture/backend mode；
- 用户动作与稳定 DOM 断言；
- console/page error；
- screenshot 或结构化 snapshot；
- 对应场景 ID。

Gate A 不能证明 Electron main、preload、IPC、sidecar 或 packaged app。

## 3. Gate B

Gate B 必须真实经过：

```text
Electron Desktop Host
  -> preload/contextBridge
  -> Electron IPC
  -> app_server_handle_json_lines
  -> App Server JSON-RPC
  -> RuntimeCore/read model
  -> visible GUI
```

硬断言：

1. 页面运行在真实 Electron，不是 browser mirror。
2. IPC trace 命中 `app_server_handle_json_lines` 和场景声明的 current method。
3. GUI 与 read model 的 thread/turn/item identity 一致。
4. console/page/invoke error 为零，或有精确 owner/退出条件。
5. legacy command 和 production mock fallback 命中为零。
6. 场景以真实 terminal 或明确 pending 状态结束。

External/unavailable fixture 可以证明桌面/current bridge，但不证明 live provider。报告必须写明 backend mode。

## 4. 选择入口

| 风险 | 最低入口 |
| --- | --- |
| 纯 Renderer projection | related component/unit + Gate A |
| Workspace/GUI 主路径 | `verify:gui-smoke` + Gate A |
| App Server/bridge | contracts + current fixture；有可见状态时加 Gate B |
| history/recovery | `smoke:agent-session-history-electron-fixture` 或对应 Gate B |
| artifact/workbench | `smoke:code-artifact-workbench-electron-fixture` 或对应 Gate B |
| Claw chat/stream | current runtime fixture + `smoke:claw-chat-current-fixture` |
| packaged/platform | 实际 packaged app + macOS/Windows evidence |

## 5. Fixture 规则

- 使用临时 userData/appData/workspace，不读取真实用户目录。
- fixture backend 必须显式传入，生产路径不存在自动 mock fallback。
- 不用固定 sleep 判断 stream/turn 完成；等待 terminal event 与 DOM 状态。
- screenshot、trace、read model 和 run context 属于同一 candidate/run ID。
- 不保存 secret、完整 system prompt、真实用户正文或敏感本地路径。

## 6. 完成结论

有效 E2E 报告必须写清 proof level：`vitest-e2e`、`gate-a`、`gate-b-fixture`、`gate-b-runtime`、`gate-b-live` 或 `packaged-platform`。只写“页面能打开”“smoke 通过”不足以判定产品可交付。
