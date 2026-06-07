# P18.4-H AgentRuntime Handoff Gate

更新时间：2026-05-16

状态：已完成 Agent App 消费侧 handoff gate；允许进入 P18.5 内容工厂 SDK 化回归。本文不声明 AgentRuntime 全部产品化完成。

## 目标

P18.4-H 的目标不是继续实现 AgentRuntime，而是把隔壁 AgentRuntime current MVP 作为 Agent App P18 的消费侧事实输入，形成可复核的 prompt-to-artifact checklist：哪些能力已经能被 SDK / Host Bridge 消费，哪些仍归 AgentRuntime owner 收口，哪些不能由 Agent App SDK 伪造完成。

## 成功标准

1. `lime.agent` 的 SDK facade 与 Host Bridge / AgentRuntime facade 方法一一对应。
2. task event、artifact refs、evidence refs、workspace patch、Host response、retry / cancel / list 语义都有具体代码或测试证据。
3. 已知缺口必须明确 owner 和退出条件，不能被 P18 SDK mock 当作生产完成。
4. 本 gate 不修改 `lime-rs/*`、`src/lib/api/agentAppRuntime.ts`、`agentRuntimeCapabilityHost*` 实现逻辑、GUI smoke 脚本或运行中 DevBridge / Tauri / Vite 进程。

## Prompt-to-artifact checklist

| 要求 | Agent App P18 证据 | AgentRuntime 证据 | 判定 |
|---|---|---|---|
| `startTask / streamTask / getTask / cancelTask / retryTask / submitHostResponse / listTasks` 被公开 SDK facade 覆盖。 | `src/features/agent-app/sdk/capabilityAdapters.ts` 的 `LimeAgentCapabilityAdapter`；`src/features/agent-app/sdk/capabilityAdapters.test.ts` 的 P18.4 adapter fixture。 | `src/features/agent-app/runtime/agentRuntimeCapabilityHost.ts` 暴露同名 `sdk.agent` 方法并接到 runtime api；`src/lib/api/agentAppRuntime.ts` 维护 `agent_app_runtime_*` gateway。 | 通过；P18 消费侧不再要求 App 手写私有 bridge。 |
| task request options `queueIfBusy / skipPreSubmitResume / runStartHooks` 不丢失。 | `src/features/agent-app/types.ts`、`src/features/agent-app/sdk/capabilityAdapters.test.ts`。 | `src/features/agent-app/runtime/agentRuntimeCapabilityHost.ts` 透传到 api；`lime-rs/src/commands/agent_app_runtime_cmd.rs` 有同名 serde 字段。 | 通过；仍由 AgentRuntime 决定队列执行事实。 |
| task event union 覆盖 queued / progress / missing context / review / tool call / artifact / evidence / completed / incident。 | `src/features/agent-app/types.ts` 的 `AgentAppTaskEventType`；`src/features/agent-app/sdk/capabilityAdapters.test.ts` 固定 SDK fixture。 | `src/features/agent-app/runtime/agentRuntimeCapabilityHost.test.ts` 覆盖 missing context、artifact、evidence、workspace patch；`lime-rs/src/commands/agent_app_runtime_cmd.rs` 的 `test_agent_app_runtime_task_events_project_thread_read_facts` 覆盖 artifact/evidence 投影。 | 通过 first-cut；后端主动 push subscribe 仍未完成。 |
| Host response 可带 session / turn / request scope 回写。 | SDK `submitHostResponse` facade 和 P18.4 test。 | `src/features/agent-app/runtime/agentRuntimeCapabilityHost.test.ts` 验证 `agent_runtime_respond_action` 形态的 `session_id / turn_id / request_id`；`src/lib/api/agentAppRuntime.ts` 暴露 submit gateway。 | 通过；真实权限/询问策略仍由 AgentRuntime owner 管。 |
| Artifact / Evidence refs 可回投到 App event。 | P18.4 SDK fixture 固定 `refs` 和 `payload` 不丢失。 | `src/features/agent-app/runtime/agentRuntimeCapabilityHost.test.ts` 验证 `artifact:created` 与 `evidence:recorded` refs；`lime-rs/src/commands/agent_app_runtime_cmd.rs` 构造 `artifact:created / evidence:recorded / evidence:verified` events。 | 通过 first-cut。 |
| workspace patch / contentFactoryWorkspacePatch 不被 SDK 私造。 | SDK fixture 只保留 typed payload，不声明生产成功。 | `lime-rs/src/commands/agent_app_runtime_cmd.rs` 已有 `contentFactoryWorkspacePatch / workspacePatch` metadata extract 与 output contract；`agent-app-runtime-completion-audit.md` 明确真实 Skill / Agent 端到端产出仍是缺口。 | handoff 通过；真实 producer 仍归 AgentRuntime / Skill owner。 |
| task state 跨刷新恢复。 | P18 不复制 read model，只消费 `getTask / listTasks`。 | `src/features/agent-app/runtime/agentRuntimeCapabilityHost.test.ts` 的“从 Agent App storage 恢复 runtime task state”覆盖恢复、list 和 Host response。 | 通过 first-cut。 |
| Agent App 不退化成模型 API / 通用 Chat 包装壳。 | P18 docs 固定 SDK / Host Bridge 边界；feature island 扫描要求无 direct `safeInvoke / invoke / raw Worker`。 | `internal/roadmap/agentruntime/app-surface-runtime.md` 固定 Agent App 是 business surface，AgentRuntime 是事实主链。 | 通过当前边界；后续 P18.5 用内容工厂包验证。 |
| 与隔壁任务不打架。 | 本 gate 只新增/更新 `internal/roadmap/agentapp/*` handoff artifact，不改 runtime owner 文件。 | 隔壁继续维护 `lime-rs/*`、`src/lib/api/agentAppRuntime.ts`、`agentRuntimeCapabilityHost*`、GUI smoke 脚本。 | 通过。 |

## 已知缺口与 owner

| 缺口 | 现状 | Owner | P18 处理方式 | 退出条件 |
|---|---|---|---|---|
| 后端 push subscribe / runtime event 主动推送。 | 当前 App 可通过 `streamTask / getTask` 轮询更新；还不是 Tauri event / runtime bus 主动推送。 | AgentRuntime / Host Bridge owner。 | P18 不写轮询 read model；只在 SDK 中保留 stream/get facade。 | Host Bridge 或 `agent_app_runtime_*` facade 提供可订阅事件通道，并有前后端测试。 |
| 真实 Skill / Agent 端到端写出 workspace patch artifact。 | runtime message 和 output contract 已能要求 patch，projection 能透传 artifact metadata；未证明真实模型/Skill 端到端产出。 | AgentRuntime + 内容工厂 Skill / prompt owner。 | P18.5 只消费现有 content-factory package，不能伪造生产 patch。 | 真实任务或 fixture 产出 `contentFactoryWorkspacePatch / workspacePatch` artifact，并被 App consumer 回放。 |
| 独立 capability catalog service。 | 首批 capability hints 可映射 Claw metadata；catalog 仍内置在 facade 最小实现。 | AgentRuntime capability catalog owner。 | P18 只保留 typed `lime.tools / lime.knowledge / lime.agent` 能力声明。 | `agent_runtime_capability_catalog_service` 拆出，并接 manifest capability 校验。 |
| 真实桌面 GUI smoke。 | P17.5 formal entry smoke 已通过；AgentRuntime audit 有 MCP first-cut 证据；本 gate未抢运行中 GUI 任务。 | AgentRuntime / GUI smoke owner。 | P18.4-H 不启动 Tauri / Vite / DevBridge；P18.5 若改内容工厂 SDK 回归，再评估是否需要 smoke。 | 由 owner 输出可复核 GUI summary，并证明 App 内 task / write-back 主路径。 |

## 判定

- P18.4-H 对 Agent App P18 的消费侧 handoff gate 已通过：SDK facade、task event、Host response、artifact/evidence refs、workspace patch payload、跨刷新恢复和 no-private-bridge 边界都有可追踪证据。
- 允许进入 P18.5：用现有 content-factory package 验证 App 内只依赖 SDK facade 的业务闭环。
- 不能标记整体目标 100%：push subscribe、真实 Skill / Agent patch producer、独立 capability catalog service、真实桌面 GUI smoke 仍是 AgentRuntime / GUI owner 缺口。

## 最小验证命令

```bash
nice -n 10 npm test -- src/features/agent-app/sdk/capabilityAdapters.test.ts src/features/agent-app/sdk/capabilityContract.test.ts src/features/agent-app/sdk/MockCapabilityHost.test.ts src/features/agent-app/runtime/hostBridge.test.ts src/features/agent-app/runtime/capabilityDispatcher.test.ts src/features/agent-app/runtime/agentRuntimeCapabilityHost.test.ts src/features/agent-app/ui/AgentAppRuntimePage.test.tsx
nice -n 10 npm run typecheck -- --pretty false
nice -n 10 npm run test:contracts
git diff --check -- internal/roadmap/agentapp src/features/agent-app/sdk src/features/agent-app/index.ts
rg -n "SceneApp|contentEngineering|sceneapp_|safeInvoke|invoke\\(|new Worker|Worker\\(" src/features/agent-app || true
```

如果要把 AgentRuntime owner 缺口也判为完成，还必须追加 Rust 定向测试、真实 runtime / GUI 证据和对应 owner 文档更新；这些不由 P18.4-H 消费侧 gate 代替。
