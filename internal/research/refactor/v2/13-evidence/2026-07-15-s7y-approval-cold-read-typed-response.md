# S7y Approval Cold Read Typed Response

## 结论

Approval 的历史事实源继续由 canonical `ThreadItemPayload::Approval` 与 ThreadStore 持有。
App Server cold read 现在与 live projector 一致：pending 不输出 `response`，terminal 输出
`{ decision, decision_scope, reason_code }`。wire decision 保留
`approved / approvedForSession / denied / timedOut / abort`；只有 GUI view-model 才映射为
`allow_once / allow_for_session / decline / expired / cancel`。

本切片没有新增 Approval JSON-RPC method、Electron IPC、mock、兼容 parser 或第二响应 owner。
GUI 仍通过 `agentSession/action/respond` 提交用户决定。

## 分类

- `current`：canonical Approval Item、ThreadStore、App Server typed read response、live canonical
  projector、`agentSession/action/respond` 与 GUI view-model lowering。
- `compat`：`agentSession/read` 的 Renderer presentation adapter；只负责把 current read model
  投影给 GUI，不拥有 Approval 决策语义。
- `deprecated`：无。
- `dead / deleted / forbidden-to-restore`：cold read scalar `response`、重复顶层
  `reason_code`、把 `cancel` 等 GUI 值写回 canonical wire，以及新增 legacy alias parser。

## 验证

- Rust focused：`cargo test --manifest-path lime-rs/Cargo.toml -p app-server read_model --lib`，
  `47/47` 通过。
- Renderer focused：3 files / `52/52` 通过，覆盖 cold/live projector、session client 和五种
  canonical decision 的 GUI lowering。
- `npm run check:protocol-types`：698 个 v0 类型生成无漂移。
- `npm run typecheck`：通过。
- `npm run test:contracts`：通过；app-server client contract `288` checks、命令契约、脚本治理
  与 docs boundary 全部通过。
- `npm run governance:legacy-report`：零引用候选 `0`、分类漂移候选 `0`、边界违规 `0`。
- exact rustfmt、ESLint、Prettier 与 claimed diff check：通过。

## Gate B

`approval-request-resume` 真实 Electron fixture 通过，证据为
`.lime/refactor-v2/evidence/s7y-approval-request-resume-summary.json` 和对应截图。

- `proofLevel = Gate B controlled fixture`，`ok = true`。
- Electron preload、App Server JSON-RPC、current session start/read/list 与
  `agentSession/action/respond` assertions 全部为 true。
- pending read model 为 `waitingAction` 且只有一个 request；terminal read model
  `pendingRequestCount = 0`、turn `completed`。
- GUI 显示单个紧凑“本会话允许”记录；第二次 browser 请求命中 session approval cache，
  不再产生 pending Approval。
- production mock 与 live provider 均未作为成功路径。

## 并行边界

S7y 只修改 App Server read model、canonical Approval projector、GUI Approval view-model 与紧邻
测试。并行 S5h 只迁移 TypeScript type import owner，不改变 Approval、协议、Electron 或 GUI 行为。

## 下一刀

继续按 current owner 清理 Agent Chat 对 `@/lib/api/agentRuntime` compat 根 barrel 的剩余
production consumer；每个 slice 只迁移同一 owner，并用 boundary guard 防止回流。
