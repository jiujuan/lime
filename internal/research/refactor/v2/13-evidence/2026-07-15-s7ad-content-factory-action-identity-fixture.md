# S7ad Content Factory Action Identity Fixture

## 结论

Content Factory Article Workspace fixture 不再制造没有 RuntimeCore continuation 的
`action.required`，也不再调用注定 `action_not_found` 的 `workflow/respond`。App Server
`workflow/read` 只保留同时匹配 workflow step、canonical pending action identity 与
WaitingAction Turn 的 respond action；缺失或错配继续 fail closed。

首次修正后 Gate B 越过原 `action_not_found`，暴露后序 contract-rejection probe 把 metadata
错误放在 `runtimeOptions.metadata`。协议唯一 owner 是
`runtimeOptions.runtimeRequest.metadata`；修正后 plugin worker contract mismatch 正确进入
read model failed evidence，没有增加 metadata 兼容读取。

## 分类

- `current`：canonical pending action identity、typed `RuntimeOptions.runtime_request`、
  workflow/read fail-closed projection。
- `test-only`：Content Factory controlled external fixture 与 no-synthetic-action guard。
- `dead / forbidden-to-restore`：fixture synthetic `action.required`、无 continuation 的
  `workflow/respond`、顶层 `runtimeOptions.metadata`。
- `compat / deprecated`：无新增。

## Gate B

`node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario
content-factory-article-workspace --timeout-ms 300000 --evidence-dir .lime/qc --prefix
s7ad-content-factory-runtime-request-metadata` 通过：

- proof level：`Gate B controlled fixture`；
- Electron preload、Electron IPC、App Server JSON-RPC、current session start/read/list 全部命中；
- `workflowRead.respondAction` 为 `null`，未调用 `workflow/respond`；
- workflow cancel/retry、Article Editor、artifact read、编辑后恢复与 worker projection 全部通过；
- contract mismatch 进入 read model `failed`，错误码
  `PLUGIN_WORKER_CONTRACT_UNSUPPORTED`，failure category 为 `configuration`；
- common assertions 与 24 个 scenario assertions 全部为 true；
- actionable console errors 为 `0`。

通过 summary：`.lime/qc/s7ad-content-factory-runtime-request-metadata-summary.json`。
失败基线保留在
`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。

## 验证

- focused App Server pending-action filter：`1/1`。
- focused current fixture regression guard：`16/16`。
- `npm run governance:scripts`：通过。
- claimed fixture files Prettier 与 `git diff --check`：通过。
- Content Factory Article Workspace Electron Gate B：通过。

## 并行边界

本 slice 没有修改共享 backend script、App Server protocol/client、Renderer production code
或外部 Content Factory repository。S2t-S2v canonical persistence 与 S4j1 ToolSearch 已由各自
owner 独立释放，不归 S7ad 所有。
