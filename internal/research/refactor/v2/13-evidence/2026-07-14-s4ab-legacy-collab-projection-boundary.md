# S4ab Legacy collab projection boundary evidence

日期：2026-07-14

## 结论

Multi-Agent projection 的唯一 current taxonomy 已收敛为六个 AgentControl V2 名称：

- `spawn_agent`
- `send_message`
- `followup_task`
- `wait_agent`
- `interrupt_agent`
- `list_agents`

裸 `send_input`、`resume_agent`、`wait`、`close_agent` 不再映射为 V2 工具，统一以 `legacy_tool_name` fail closed。visual snapshot 不再把 `followup_task` / `interrupt_agent` 反向显示为 V1 名称；`wait_agent` 与 `list_agents` 不再要求不存在的 receiver lineage。

## 分类

- `current`：六个 V2 AgentControl schema、taxonomy 与 visual tool 名称。
- `deprecated / historical-read-only`：Rust `CollabAgentOperation::{Resume, Close}`、`SubAgentActivityKind::{Resumed, Closed}` 及其 canonical SQLite history decode/display consumer。
- `dead`：把裸 V1 名称提升为 V2 coverage、或把 V2 visual row 降回 V1 名称的 projection alias。

历史 enum、conversation import、materializer、evidence consumer、App Server schema 与 generated TypeScript 均未修改。canonical `item_json -> ThreadItem` 的历史可读性保持不变。

## 实现与守卫

- `multiAgentToolSchema.ts` 将四个裸 V1 名称加入 legacy 集合。
- `multiAgentItemTaxonomy.ts` 删除四个 V1 到 V2 的正向 alias。
- `multiAgentVisualSnapshot.ts` 复用六工具类型并保持 V2 名称，receiver lineage 只约束 `send_message`、`followup_task`、`interrupt_agent`。
- package 回归测试固定 V1 fail-closed、V1 不计入 coverage、V2 visual name 保真，以及 wait/list 无 receiver 的合法行为。

## 验证

- `npm --prefix packages/agent-runtime-projection test`：298/298 通过。
- `npm --prefix packages/agent-runtime-projection run typecheck`：通过。
- `npm run test:contracts`：通过；protocol types 无漂移，App Server client contract 290 checks 通过。
- `npm run governance:legacy-report`：通过；零引用候选 0、分类漂移候选 0、边界违规 0。
- exact write set `git diff --check`：通过。

## 范围

本 slice 只收紧共享 projection boundary，不新增 JSON-RPC、Electron、GUI 产品面或兼容层。S4z 继续证明 RuntimeCore restart-on-demand；S4aa 继续承接 terminal child activity durable mailbox。完整 Multi-Agent GUI Gate B 仍属于后续主链。
