# S5 Task Index And Review Dialog I18n

## 结论

`HarnessTaskIndexSection` 与 `RuntimeReviewDecisionDialog` 的用户可见文案已收敛到五语言
`agent`/`common` namespace。任务索引 31 个 key、审核弹窗 44 个 key，共 75 个 key 在
`zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR` 中保持同构且非空。

协议与 evidence fact 不参与翻译：`user_locked_capability_gap`、`capabilityGap=`、
`request_id=` 继续以 raw 值展示。审核阻断、任务过滤和保存 payload 均未改变。

`check-modality-runtime-contracts.mjs` 的任务索引 guard 同步改为检查 i18n key，防止旧中文
literal 被当作 current 合同恢复。

## 分类

- `current`：五语言 resource、两个 GUI presentation consumer、modality task-index guard。
- `dead / forbidden-to-restore`：组件内硬编码用户可见文案。
- `compat / deprecated`：无。

## 验证

- targeted hardcoded scan：`64 -> 0`。
- 五语言 parity：每种语言 75 个目标 key，empty `0`。
- `npm run i18n:check`：coverage `100.0%`，missing/extra `0/0`。
- `npm run i18n:unused -- --check`：unused `0`。
- focused component tests：3 files / `7/7`。
- fresh `npm run verify:local`：版本、i18n、lint、hardcoded scan、typecheck 与前端
  110/110 batches 通过；changed-Rust 被并行 App Server MCP stdio test stack overflow 阻断，
  与本 slice 无关。
- fresh `npm run verify:gui-smoke`：真实 Electron renderer、preload、App Server sidecar、
  Claw workbench 与 memory settings 通过。
- fresh `npm run governance:legacy-report`：zero-reference/classification-drift/boundary
  violations = `0/0/0`。
- ESLint、Prettier、typecheck 与 claimed diff check：通过。

## 并行边界

本 slice 未触碰 active S2o Rust、App Server/protocol、Electron、中央执行计划或其它 S5
owner。全量门禁验证的是共享工作树，不代表其它 diff 归本 slice。
