# S7ae Content Factory Synthetic Contract Probe Retirement

## 结论

Content Factory Article Workspace Electron 场景已删除额外制造的 contract-mismatch
Turn。该 Turn 不来自 GUI 用户动作，只用于在产品闭环尾部重复验证 plugin worker output
contract；继续保留会把 Rust 运行时规则变成 Content Factory E2E 的人工支线。

删除后，Content Factory Gate B 只保留真实成功 worker、既有失败 worker evidence、
Article Editor、artifact read、编辑恢复、workflow read/cancel/retry 与无 pending action 时隐藏
respond 的产品主链。Plugin worker contract mismatch/missing kind 继续由 App Server focused Rust
测试 fail closed；通用 `runtime.error -> articleWorkspace.workerEvidence` 由独立 read-model
测试承接。

## 删除范围

- 删除 `runRuntimeContractRejectionProbe` 与专用 read-model waiter/summary。
- 删除 `contract-reject` Turn ID、错误码常量、scenario summary 字段和 assertion key。
- 删除 domain guard 对 synthetic probe 符号的正向要求。
- 删除 no-synthetic-action regression 中仅为该 probe 存在的 `runtimeRequest` 正向文本断言。
- 保留并继续验证禁止 synthetic `action.required`、无 continuation `workflow/respond` 的负向守卫。

## 分类

- `current`：plugin worker output contract validator、typed runtime request、RuntimeCore
  fail-closed、通用 worker failure projection、canonical workflow respond filter。
- `test-only`：受控 external Content Factory backend、合法 worker dogfood、既有
  `worker_invalid_json_output` failure evidence、Electron Gate B。
- `dead / deleted / forbidden-to-restore`：contract-mismatch product Turn、专用 waiter、
  summary、常量、assertion 与 domain guard token。
- `compat / deprecated`：无新增。

## Gate B

命令：

```bash
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs \
  --scenario content-factory-article-workspace \
  --timeout-ms 300000 \
  --evidence-dir .lime/qc \
  --prefix s7ae-content-factory-without-contract-probe
```

结果：

- proof level：`Gate B controlled fixture`。
- Electron、preload、Electron IPC、`app_server_handle_json_lines`、App Server JSON-RPC、
  RuntimeCore/worker、read model 与 Article Editor GUI 全链通过。
- `53/53` assertions 为 true，其中 `23/23` 为 Content Factory scenario assertions。
- worker evidence 共 `5` 条，真实 worker dogfood completed，既有 invalid JSON worker
  failure 仍投影为 failed。
- `workflow/read.respondAction = null`，没有调用 `workflow/respond`。
- actionable console error 为 `0`。
- summary 与请求中 `contract-reject`、`contract_mismatch`、
  `PLUGIN_WORKER_CONTRACT_UNSUPPORTED` 和旧 summary/assertion 字段均为 `0`。

证据：`.lime/qc/s7ae-content-factory-without-contract-probe-summary.json`。

## 定向验证

- Node syntax：5 个 claimed MJS 文件通过。
- fixture guards：`current-fixture-regression-smoke.test.mjs` `16/16`，
  `claw-chat-current-fixture-smoke.test.mjs` `55/55`。
- App Server worker/read model focused：`article_workspace_worker` `9/9`。
- runtime contract boundary：
  `defers_pane_action_output_artifact_kind_validation_to_runtime_contract` `1/1`。
- `npm run governance:scripts`：通过，retired/untracked root 与 directory 均为 `0`。
- claimed scripts Prettier、Rust test `rustfmt --check`、claimed diff check：通过。

`npm run smoke:agent-runtime-current-fixture` 中，focused TS/guard 与两个 Claw 首页 Electron
场景通过；后序独立 Coding Workbench Electron 场景因 latest Turn 停在 `accepted` 失败，尽管
artifact、tool timeline 与 coding projection 已持久化。该失败不经过本 slice 的 Content
Factory 文件或 assertion，已作为共享 current 主链问题独立审计，不冒充 S7ae 失败或绿色。

## 架构确认

架构影响：非重大。该切片只从测试旁路做减法，并把 contract 规则留在既有 App Server
owner；未改变 Electron/App Server 协议、runtime owner、Thread/Turn/Item schema、Renderer
生产代码、mock policy 或 GUI 产品结构，因此不需要修改架构图。

并行施工期间 S7ad 正在拆分 `read_model.rs` 的 workflow owner；S7ae 未修改该 facade、
workflow 子模块或 S7ad evidence，只共享读取当前工作树验证结果。
