# v2 执行切片

> status: implementation-ready plan
> owner: runtime-architecture
> last_verified: 2026-07-12
> execution_record: `internal/exec-plans/refactor-v2-implementation.md`
> research_record: `internal/exec-plans/refactor-v2-research.md`

每个切片只认领窄写集；切片之间不以 compat wrapper 传递状态。`copy` 先于 `delete`，但复制后的 current owner 一旦通过最小验证，旧实现必须在同一切片或紧随其后的清理切片删除。

## S0：事实冻结

**写集**：`v2/01-current-facts/**`、链接/快照检查。

**动作**：`copy` 不涉及；`delete` 仅删除 v2 断链引用。

**退出条件**：source commit、行数、current/compat/dead、v1 失效链接都能由命令复核；`npm run governance:legacy-report` 结果已记录。

**验证**：链接扫描、`git diff --check`、治理报告。

## S1：Codex protocol/runtime copy spike

**写集**：`app-server-protocol` domain declarations、`agent-protocol`、`agent-runtime` queue/task/lifecycle、定向 fixtures。

**动作**：复制 `common.rs`/v2 Thread/Turn/Item、`core/tasks`/input queue 结构；将旧 `agentSession` 调用一次性迁移并删除。

**退出条件**：method/schema/client/scope 单一声明源；正常/queue/interrupt/fail/resume fixture 通过；旧命令无生产引用。

**验证**：`npm run test:contracts`、`npm run test:rust:related -- lime-rs/crates/app-server-protocol lime-rs/crates/agent-runtime`、runtime smoke。

## S2：materialization/read model copy

**写集**：App Server `thread_item_projection/**`、`read_model/**`、`thread-store`、projection tests。

**动作**：复制 Codex change set/coalesce/rollback/pagination/ordinal/repair 语义；删除重复 transcript/read path。

**退出条件**：Item 族、稳定 ID、sequence、分页、repair、replay 有 Rust/TS 双侧证据；Evidence/GUI 只消费一个 read model。

**验证**：Rust related、projection unit、agent runtime smoke、import/replay fixture。

## S3：provider lowering 收口

**写集**：`runtime-core/src/llm_protocol`、`model-provider/**`、provider fixtures、capability projection。

**动作**：复制 OpenCode ContentPart/LLMEvent/options/lowering 语义；把 wire mapper 从 runtime-core 迁到 model-provider。S3c 再迁移 media-runtime、agent-runtime 和 App Server consumer 后，删除旧 mapper 和 GUI body builder；S3 spike 单独不算完成。

**退出条件**：每个已支持 protocol 有 production-wired canonical request/event、unsupported 显式失败、media reference-only、GUI/runtime gate 一致；S3c consumer handoff 与旧 mapper 删除证明齐全。

**验证**：provider 定向测试、`npm run test:contracts`、media GUI smoke。

## S4：tool/MCP/skills/multi-agent 清场

**写集**：`tool-runtime`、`mcp`、`skills`、agent graph/store、approval projection。

**动作**：复制 Codex ToolSpec/Executor/Emitter、MCP manager、skills metadata、AgentControl/graph；删除 renderer tool registry、旧 approval loop、旧 Team board runtime。

**退出条件**：权限/执行/显示三层分离；parent-child edge、mailbox、MCP snapshot、skill policy 有恢复测试。

**验证**：MCP current smoke、runtime fixture、GUI Gate B。

## S5：GUI/Electron 拆分

**写集**：`AgentChatWorkspace.tsx` 相邻 command/projection/scene 文件、`src/lib/api/**`、Electron host 只读边界。

**动作**：吸收 TUI facade 纪律，不复制 TUI UI；拆 workspace orchestration，删除重复 hook 状态机和 direct bridge 调用。

**退出条件**：Workspace < 800 行或有明确生成/退出记录；组件只消费 projection；Gate B 通过五语言主路径。

**验证**：定向 Vitest/ESLint、`npm run verify:gui-smoke`、Playwright Gate B。

## S6：删除与守卫

**写集**：legacy catalog、command policy、mock priority、旧 fixture、旧文档链接、`legacySurfaceCatalog`。

**动作**：直接删除所有零引用 dead/deprecated surface；保留负向 guard；不新增 compat。

**退出条件**：生产构建图无旧入口；治理报告无新回流；文档链接全通。

**验证**：`npm run governance:legacy-report`、`npm run test:contracts`、`npm run governance:scripts`。

## S7：收口

**写集**：执行计划、evidence index、current architecture confirmation。

**动作**：更新 `internal/aiprompts/architecture.md` 和执行证据（若切片改变依赖方向）；归档 v1 失效索引。

**退出条件**：每个切片 owner/contract/positive-negative/Gate A-B/删除证明齐全；实现完成度由 evidence 汇总，不以文档存在代替代码完成。

**验证**：`npm run verify:local`，按风险补全 Rust/GUI smoke。

## 依赖顺序

```text
S0 -> S1 -> S2 -> S4 --\
          \-> S3 -> S3c +-> S5 -> S6 -> S7
```

S2 与 S3 在 S1 contract 冻结后可并行施工；S4 的 Item/approval/agent edge 写入等待 S2 handoff。S5 等待 S2 read model、S3 provider capability 和 S4 tool display contract，未满足依赖时只允许只读审计 GUI。
