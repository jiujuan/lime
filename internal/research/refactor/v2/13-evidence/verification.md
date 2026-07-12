# 验证与证据矩阵

> status: current verification contract
> owner: quality-workflow
> last_verified: 2026-07-12

## 风险到门禁

| 变更 | 最小验证 | 产品证据 |
| --- | --- | --- |
| protocol/method/schema/scope | `npm run test:contracts` + Rust protocol tests | schema fixture diff、typed client round trip |
| agent-runtime queue/turn/tool | Rust related + `npm run smoke:agent-runtime-current-fixture` | accepted/queued/completed/failed/interrupted/resume |
| Item/materialization/read model | projection unit + thread-store tests | create/update/remove/rollback/stale/pagination/repair |
| provider/capability/lowering | provider tests + contract tests | each protocol request/event/media/usage/error |
| MCP/skills/multi-agent | domain tests + current smoke | snapshot/approval/edge/mailbox/recovery |
| Renderer projection | Vitest + ESLint/typecheck | Gate A screenshot/state assertions |
| Electron/Workspace/bridge | `npm run verify:gui-smoke` | Gate B real Electron/preload/IPC/App Server/read model/UI |
| i18n | `npm run i18n:check:json` | five locale keys and visible states |
| legacy deletion | `npm run governance:legacy-report` | zero production references + negative guard |
| script/package boundary | `npm run governance:scripts` | no unregistered root script/package |

## Evidence record format

每个切片新增不可变记录：

```yaml
slice: S1
owner: agent-runtime
workspace_commit: <lime commit or working-tree digest>
codex_commit: 5c19155cbd93bfa099016e7487259f61669823ff
opencode_commit: 9976269ab1accfc9f9dc98a4a688c516934de422
commands:
  - npm run test:contracts
result: pass|fail|blocked
scope: <paths>
positive_cases: <fixture ids>
negative_cases: <guard ids>
gate_a: <evidence path or n/a>
gate_b: <evidence path or n/a>
deleted_surfaces: <paths>
remaining_blocker: <none or exact reason>
```

证据失败必须保留原始输出摘要和复现命令；不能覆盖为“后续已通过”的历史记录。当前状态由最新汇总表引用记录。

## Gate A/B 规则

- Gate A 只证明 browser/renderer projection，不能证明 Electron。
- Gate B 必须真实经过 Electron、preload/IPC、`app_server_handle_json_lines`、App Server JSON-RPC、runtime/read model 和可见 UI。
- 生产路径不允许 mock fallback；测试 fixture 的 mock 必须显式标注且仍经过 current bridge。

## 完成度口径

本次仅生成 v2 研究/执行文档，不宣称任何代码切片已完成。初始实现完成度为 `0%`；文档基线完成度以目录 manifest 和链接扫描为准。后续每个 S 切片只能在退出条件全部满足后增加百分比。
