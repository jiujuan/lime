# AgentRuntime Surface 后端 Facade 计划

> 状态：in progress（P1/P2 最小 facade 已落地，P3 snapshot event projection、AgentRuntime profile / high-value runtime event 主动 projection、Harness export projection、runtime event listen、Host Bridge task subscription、终态 artifact replay 与跨刷新 task state 恢复第一刀已落地，P4 capability catalog service、多能力 workflow metadata 与 manifest allowlist gate 第一刀已落地，P5 App 写回第一刀已落地）
> 更新时间：2026-05-16
> 作用：定义如何把 Chat / Claw / Agent App / Automation 收敛到同一个后端 AgentRuntime Surface，并记录当前最小实现边界。

## 1. 目标

当前 `agent_runtime_submit_turn` 已经能进入 Aster / lime_agent 主链，但它的调用形态和事件消费更贴近 Chat / Claw。Agent App 需要完整 Agent 能力时，不应直接调用 Chat 专用命令，也不应新建平行 runtime；应新增后端 facade，把 App task 映射到同一 AgentRuntime control plane。

目标结构：

```text
Chat / Claw command
Agent App runtime command
Automation job command
  -> AgentRuntimeSurfaceService
  -> RuntimeCommandContext
  -> build_queued_turn_task
  -> submit_runtime_turn
  -> lime_agent::AgentEvent
  -> surface-specific projection
```

## 2. 建议代码落点

| 路径 | 责任 |
| --- | --- |
| `src-tauri/src/commands/agent_app_runtime_cmd.rs` | Agent App runtime Tauri command 外壳，只做参数反序列化和 state 注入。 |
| `src-tauri/src/services/agent_app_runtime_service.rs` | App task facade：校验 appId / entryKey / manifest capability / provenance，组装 surface request。 |
| `src-tauri/src/services/agent_runtime_surface_service.rs` | 多 surface 共享入口：把 Chat、Claw、Agent App、Automation 输入转换成 runtime turn。 |
| `src-tauri/src/services/agent_app_runtime_capability_catalog_service.rs` | Agent App -> Claw capability catalog 第一刀：声明 capabilityId / alias / launch metadata contract，并由 runtime facade 复用。 |
| `src-tauri/src/services/agent_runtime_capability_catalog_service.rs` | 后续多 surface capability catalog：声明 capabilityId、metadata contract、tool surface、artifact/evidence policy。 |

`agent_app_runtime_cmd.rs` 已作为 P1/P2 最小 facade 落地；首批 capability hint -> Claw skill launch metadata 映射已从 command 文件拆到 `agent_app_runtime_capability_catalog_service.rs`。Host Bridge subscription 已补 runtime event listen 和终态 artifact replay 短轮询：订阅 `lime.agent` task 时会监听 `agent_app_runtime:{appId}:{taskId}`，把 Tauri / DevBridge runtime event 推回 iframe，同时继续用 `getTask` 轮询兜底 snapshot / artifact replay。AgentRuntime profile event 现在会在同名 event bus 主动追加 `agent_app_runtime:profileProjection` payload，把 `turn.* / tool.* / action.* / routing.* / model.*` 投影成 App canonical `taskEvents`；高价值 `RuntimeAgentEvent` 也会追加 `agent_app_runtime:runtimeEventProjection`，其中 artifact 事件可直接携带 workspace patch，runtime event / timeline metadata 中显式存在的 `evidenceRefs / verificationOutcomes` 会通过 `runtime_evidence_projection_service` 主动投影为 `evidence:recorded / evidence:verified`。前端 Host facade 也能从 `threadRead.artifacts` 补投 `artifact:created` payload；Host dispatcher 已补 high-level manifest capability gate，未声明 `lime.agent` 等 Host capability 会被拒绝。Claw capability hint 会进一步校验 App manifest 的 `toolRefs[].capabilities` allowlist，避免只声明 catalog tool 后任意启动 Claw 能力。Rust facade 现在会把多个 capability hint 去重后写入 `agent_app_runtime.capability_workflow` 与 `harness.agent_app_runtime_capability_workflow`；内容工厂这类带 output contract 的复合任务使用 `metadata_only`，不会被强行改写成单一 `research_skill_launch` 或 `image_skill_launch`。本轮已补 Evidence Pack / analysis / review / save review 导出结果的后端主动 translator：导出成功后会基于 `runtime_summary.surface=agent_app` 和 `appId/taskId` emit `agent_app_runtime:harnessExportProjection`。后续仍要补后端/cross-surface capability policy owner、真正的多能力执行编排，以及跨 surface catalog 合并。实现时必须同步命令治理四侧：前端 gateway、Rust handler、`agentCommandCatalog`、mock / DevBridge。

## 3. 最小命令语义

首批 Agent App runtime command：

| 命令 | 作用 |
| --- | --- |
| `agent_app_runtime_start_task` | 从 App task request 启动一个 AgentRuntime turn / workflow，并返回 `taskId`、`traceId`、`sessionId`、`turnId`。 |
| `agent_app_runtime_cancel_task` | 取消 App task 对应的 runtime turn，必须回写 cancelled / interrupted fact。 |
| `agent_app_runtime_get_task` | 读取 App task snapshot，不从 UI 本地状态反推。 |
| `agent_app_runtime_submit_host_response` | 响应 human review、permission approval、missing context、secret binding 等 Host -> App request。 |

首批不新增 `content_factory_*` 专用命令。内容工厂业务只通过 taskKind / workflowKind / capabilityId 表达。

## 4. Surface Request

建议统一输入结构：

```text
AgentRuntimeSurfaceRequest {
  surface: chat | claw | agent_app | automation
  sourceId
  appId?
  entryKey?
  workflowRunId?
  taskKind
  idempotencyKey
  userInputRef
  input
  expectedOutput?
  requiredCapabilities[]
  capabilityHints[]
  knowledgeBindings[]
  artifactPolicy?
  evidencePolicy?
  humanReview?
  eventSink
}
```

`eventSink` 只描述事件投影目标，不改变底层 runtime facts：

```text
chat -> conversation stream
agent_app -> AgentAppTaskStreamEvent / Host Bridge notification
automation -> job item event
```

## 5. Runtime Metadata 投影

Agent App task 进入现有 runtime 时，需要形成可审计 metadata，而不是靠 prompt 字符串隐式表达：

```text
lime_runtime = {
  surface: "agent_app",
  app_id: "content-factory-app",
  entry_key: "content_factory",
  workflow_run_id: "...",
  app_task_id: "...",
  task_kind: "content_factory.copy.generate",
  capability_hints: ["lime.capability.research.search", "lime.capability.image.generate"],
  artifact_policy_ref: "...",
  evidence_policy_ref: "..."
}
```

后端可以继续复用现有 `request_metadata` 读取逻辑，但语义 owner 要迁到 capability catalog / surface request。

## 6. 事件转译

底层事实源：

```text
lime_agent::AgentEvent
AgentRuntimeProfileEvent
AgentRuntimeThreadReadModel
EvidencePack
```

Surface projection：

| 底层事件 | Chat projection | Agent App projection | Automation projection |
| --- | --- | --- | --- |
| runtime status | 状态卡 / timeline | `task:progress` | job progress |
| model delta | assistant message | 可选 partial text | log / summary |
| tool start/end | tool timeline | `task:toolCall` | job item tool event |
| permission/action required | approval UI | Host -> App request | paused job action |
| artifact changed | artifact card | `artifact:created` | artifact ref |
| evidence changed | evidence panel | `evidence:recorded` | evidence ref |
| turn completed | assistant completion | `task:completed` | job item completed |
| turn failed | error card | `task:error` | job item failed |

lossless 事件：

1. started / completed / failed / cancelled
2. permission blocked / approval requested / action resolved
3. artifact created / evidence recorded
4. human review requested
5. missing context requested

best-effort 事件：

1. token delta
2. keepalive
3. 高频 progress
4. reasoning delta

## 7. 后端边界

### `agent_app_cmd.rs`

继续负责：

1. package inspect / fetch / cache / installed state
2. UI runtime start / stop / status
3. scoped runtime token / model env 注入

不继续扩展为完整 AgentRuntime owner。

### `agent_app_runtime_cmd.rs`

负责 Agent App 的运行时任务 facade，但不实现 Agent loop。

### `aster_agent_cmd`

继续承载 current AgentRuntime command 和 Aster 集成，但逐步把 Chat 专用输入外壳与共享 runtime submit 分离。

## 8. 实施阶段

| 阶段 | 目标 | 退出条件 |
| --- | --- | --- |
| P0 | 文档冻结和 owner 边界确认 | 本文件、App surface、Claw sharing 文档都接入 README |
| P1 | 新增 Agent App runtime command shell | 已完成：四侧命令治理同步，浏览器桥接模式 fail-closed，普通 mock 只服务离线测试 |
| P2 | Surface facade 复用 `submit_runtime_turn` | 已完成最小版：App task 可创建 / 复用 runtime session，并提交真实 runtime turn |
| P3 | Event translator | 已完成 first-cut：`agent_app_runtime_get_task` 返回 `taskStatus` 与 `taskEvents`，可从 `AgentRuntimeThreadReadModel` 投影 queued / progress / missing context / host request / tool call / artifact created / evidence / outcome / incident；AgentRuntime profile event 生成处会主动 emit `agent_app_runtime:profileProjection`，把 `turn.* / tool.* / action.* / routing.* / model.*` 转成 App canonical `taskEvents`；高价值 `RuntimeAgentEvent` 会主动 emit `agent_app_runtime:runtimeEventProjection`，其中 `RuntimeStatus / ToolStart / ToolEnd / ActionRequired / ArtifactSnapshot / FileArtifact / Done / Error` 会被转成 App task event，artifact projection 可直接带 workspace patch；`runtime_evidence_projection_service` 会把 runtime event / timeline metadata 中显式存在的 `evidenceRefs / verificationOutcomes` 投影为 `evidence:recorded / evidence:verified`；`AgentAppRuntimePage` 已通过 `AgentRuntimeCapabilityHost` 把 Host Bridge 的 `lime.agent.startTask / streamTask / getTask / cancelTask / retryTask / submitHostResponse / listTasks` 接到 `agent_app_runtime_*` facade，不再只走本地 in-memory adapter；已完成跨刷新第一刀：runtime task state 写入 Agent App storage，Host 重建后可恢复 `sessionId / turnId` 并继续读取和响应；Host Bridge 已支持 `capability:subscribe / capability:unsubscribe / capability:event`，会监听 `agent_app_runtime:{appId}:{taskId}` Tauri / DevBridge runtime event 并转发给 iframe，同时用 Host 侧轮询 `getTask` 兜底 task snapshot / artifact replay。已完成 Harness export projection first-cut：Evidence Pack / analysis / review / save review 导出结果会主动进入 `agent_app_runtime:{appId}:{taskId}`，继续减少对 Host 轮询 replay 的依赖。未完成：后端/cross-surface capability policy owner、真正多能力执行编排和重启后真实业务流覆盖 |
| P4 | Capability catalog 首批能力 | 已完成第一刀：`agent_app_runtime_start_task` 可把 `lime.capability.image.generate` / `cover.generate` / `research.search` / `report.generate` / `pdf.read` / `summary.generate` 等 hint 映射到现有 `*_skill_launch` metadata；映射已收敛到 `agent_app_runtime_capability_catalog_service.rs` 并覆盖 alias / unknown / 多能力去重单测；Rust metadata 会写入 `agent_app_runtime.capability_workflow` 与 `harness.agent_app_runtime_capability_workflow`，区分 `single_capability`、`multi_capability` 与 `composite_output_contract`；Host dispatcher 已有 high-level manifest capability gate，并用 `toolRefs[].capabilities` 做 Claw capability allowlist。未完成：后端/cross-surface capability policy owner、真正多能力执行编排、跨 surface catalog 合并 |
| P5 | Evidence / Artifact write-back | 已完成 App 包第一刀：`/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 的场景、文案、重写、脚本和确认链会在 Host Bridge 内把结果写回 `lime.storage / lime.artifacts / lime.evidence`，并只使用 manifest 已声明的 artifact/evidence kind；已完成 AgentRuntime `FileArtifact -> artifact:created` 专用投影；内容工厂 App 已能消费 `workspacePatch` / `contentFactoryWorkspacePatch` 并优先物化 workspace；后端 projection 已能把 artifact metadata、artifactDocument blocks 和 artifact runtime event 中的 patch 透传为 App event payload；`agent_app_runtime_start_task` 已把内容工厂 producer contract 写入 runtime message 与 `harness.agent_app_runtime_output_contract`，并把复合 capability hints 记录为 `metadata_only` workflow；Playwright 真实宿主已验证 hidden session 完成后通过 Host Bridge artifact replay 回写到 iframe。已完成 Harness export projection first-cut：Evidence Pack / analysis / review / save review 导出结果会主动投影为 `evidence:recorded`、`evidence:verified` 或 `artifact:created`。未完成：后端/cross-surface capability policy owner、真正多能力执行编排仍未完成，且该 Rust projection 仍需重启后 Playwright 真实业务流覆盖 |

## 9. 验收与守卫

实现本计划时必须验证：

1. `agent_app_runtime_*` 命令同步 `safeInvoke`、Rust handler、DevBridge、catalog、mock。
2. 新增 App task 不绕过 `agent_runtime_submit_turn` / shared surface service。
3. 搜索不到 `content_factory_*` 专用后端命令作为 Agent 能力入口。
4. 首批 capability 的 Chat 和 App 两个入口能指向同一个 capabilityId。
5. Evidence Pack 可通过 `session/thread/turn/task` 关联到 App provenance。

最小检查：

```bash
npm run test:contracts
npm run governance:legacy-report
```

如果内容工厂 GUI 主链变更，再补：

```bash
npm run verify:gui-smoke
```
