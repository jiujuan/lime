# AgentRuntime 与相邻标准边界

> 状态：implementation-audited
> 更新时间：2026-05-12
> 作用：把 `agentruntime`、`agentcontext`、`agentevidence`、`agentpolicy` 与 `agentui` 的 owner 边界写清楚，避免 Lime 把标准协议继续叠成多条事实源。

## 1. 标准来源

| 标准项目 | 本地路径 | Lime 使用方式 |
| --- | --- | --- |
| AgentRuntime | `/Users/coso/Documents/dev/ai/limecloud/agentruntime` | runtime facts 主链，拥有 session/thread/turn/task/event/snapshot/control-plane。 |
| AgentContext | `/Users/coso/Documents/dev/ai/limecloud/agentcontext` | context envelope、context item、source ref、selection、budget、assembly、injection、compaction 与 missing context 的 owner。 |
| AgentEvidence | `/Users/coso/Documents/dev/ai/limecloud/agentevidence` | evidence pack、claim/source/support/provenance、verification、review、replay、redaction 与 completeness 的 owner。 |
| AgentPolicy | `/Users/coso/Documents/dev/ai/limecloud/agentpolicy` | policy decision、risk scope、approval request、permission grant、redaction/retention obligation、waiver 与 policy trace 的 owner。 |
| AgentUI | `/Users/coso/Documents/dev/ai/limecloud/agentui` | runtime-first projection surface，只读 runtime/context/policy/evidence/artifact facts，通过受控动作写回 owner。 |

2026-05-11 已补读：

- `/Users/coso/Documents/dev/ai/limecloud/agentcontext/docs/zh/specification.md`
- `/Users/coso/Documents/dev/ai/limecloud/agentcontext/docs/zh/authoring/runtime-profile-test-cases.md`
- `/Users/coso/Documents/dev/ai/limecloud/agentevidence/docs/zh/specification.md`
- `/Users/coso/Documents/dev/ai/limecloud/agentevidence/docs/zh/authoring/runtime-profile-test-cases.md`
- `/Users/coso/Documents/dev/ai/limecloud/agentpolicy/docs/zh/specification.md`
- `/Users/coso/Documents/dev/ai/limecloud/agentpolicy/docs/zh/authoring/runtime-profile-test-cases.md`

一句话边界：

```text
AgentRuntime 说明什么时候发生了什么；AgentContext 说明当时看见了什么上下文；AgentPolicy 说明为什么允许、拒绝或需要问人；AgentEvidence 说明结果由什么支撑、能否回放和评审；AgentUI 只把这些事实投影给用户。
```

## 2. Owner 矩阵

| 事实 | Owner | Runtime 中的引用方式 | UI 是否能写 |
| --- | --- | --- | --- |
| `sessionId/threadId/turnId/taskId/runId/stepId` | AgentRuntime | 事件 envelope 必带或按适用场景携带 | 否，只能通过 submit/interrupt/respond 等受控命令触发 |
| `contextId/itemRefs/sourceRefs/selectionRefs/budgetRef/assemblyRefs/injectionRefs` | AgentContext | `context.resolved`、`context.compaction.*`、`context.missing.*` payload/refs | 否，UI 只能发起选择、补充或确认动作 |
| `decisionId/approvalRequestId/grantId/riskScope/reasonCodes/obligations` | AgentPolicy | `permission.evaluated`、`action.required`、`action.resolved`、`sandbox.applied` payload/refs | 否，UI 只能通过 action response 提交用户决定 |
| `evidencePackId/claimId/sourceId/verificationId/reviewId/replayId/exportId` | AgentEvidence | `evidence.changed` payload/refs，或 evidence export scope | 否，UI 只能触发 export/review/request fix |
| `artifactId/versionId/readRef/diffRef/exportRef` | AgentArtifact / Artifact service | `artifact.changed` payload/refs | 只能走 artifact service |
| `projectionId/visibleWindow/collapsedSections/localDraft/focusedArtifact` | AgentUI | 不进入 runtime facts | 可以，仅限 UI-only state |

## 3. 四条连接合同

### 3.1 Context -> Runtime

AgentContext 不决定 turn 是否完成，只提供执行前后的上下文事实。

AgentContext 规范要求实现为重要 turn、task、tool call 与 handoff 导出 context envelope，并保留 selected、omitted、budget、assembly、injection、compaction、missing context 事实。Lime read model 只能保留 refs/summary，不能把大 context item content 复制进 runtime snapshot。

最小合同：

```text
context.resolved
  payload.contextId
  payload.scope = turn | task | tool_invocation | review | handoff
  payload.selectedItemRefs[]
  payload.omittedItemRefs[]
  payload.budgetRef?
  payload.missingContextRefs?
  refs.contextEnvelopeRef?
```

Lime 当前 P1 只要求 runtime event 保留 `session/thread/turn` correlation；P2/P4 再把 memory budget、missing context、compaction summary 接入 read model。

### 3.2 Policy -> Runtime

AgentPolicy 不执行工具，只决定候选动作的结果与义务；Runtime 根据结果继续、暂停或阻断。

AgentPolicy 的 result 必须映射为 runtime 行为：`allow` 只能在 constraints/obligations 下继续，`deny` 必须阻断，`ask` 必须暂停并创建或链接 approval request，`defer/escalate` 不能被 UI 当作已允许，`waive` 必须在 scope 内才有效，`not_applicable` 需要其他默认策略允许，`indeterminate` 默认 fail closed。

最小合同：

```text
permission.evaluated
  payload.decisionId
  payload.result = allow | deny | ask | defer | escalate | waive | not_applicable | indeterminate
  payload.riskLevel
  payload.reasonCodes[]
  payload.obligations[]?

action.required
  actionId
  payload.approvalRequestId
  payload.decisionId
  payload.actionType
  payload.scope
```

`ask` 必须转成 `action.required`；`deny` 必须转成 blocked/failed fact；`indeterminate` 默认 fail closed，不允许 UI 自己解释为可继续。

### 3.3 Runtime -> Evidence

AgentEvidence 不重建第二条 timeline，只消费 Runtime events、snapshots、artifacts、telemetry refs 与 policy/context refs。

AgentEvidence 规范要求 completeness 按 `runtime/telemetry/sources/claims/artifacts/verification/privacy/replay` 分类声明；缺失事实必须表示为 `unknown/unavailable/redacted/expired/not_applicable/not_collected` 等，不允许由 exporter 推断为 success。

最小合同：

```text
agent_runtime_export_evidence_pack(scope)
  -> evidence_pack.scope.runtimeRefs
  -> evidence_pack.provenance.runtimeTimelineRefs
  -> evidence_pack.completeness.runtime
  -> evidence_pack.replayCases[]
  -> evidence_pack.reviews[]
```

无 `session/thread/turn` 匹配的 request telemetry 只能导出为空或 `unavailable`，不能生成伪 `unlinked` 会话证据。

### 3.4 Runtime -> AgentUI

AgentUI 可以消费 raw stream event、profile event、snapshot 和 read model，但只能产生 projection state。

最小合同：

```text
RuntimeEvent / AgentRuntimeProfileEvent
  -> ThreadReadModel / TaskSnapshot / EvidenceSummary
  -> Agent UI envelope projection
  -> Workspace / Harness / Timeline / Task Capsule / Team Workbench
```

P1 允许 AgentUI 对 `schemaVersion = lime-profile-0.4.0` 的 dotted profile event 静默保持 stream 活跃；P2 开始必须把这些 facts 归入 `ThreadReadModel`，再由 AgentUI 只读展示。

## 4. Current / compat / deprecated / dead

### current

1. `agent_runtime_submit_turn -> runtime_turn -> AgentRuntimeProfileEvent -> ThreadReadModel -> AgentUI projection`。
2. `agent_runtime_export_evidence_pack` 作为 evidence/replay/review 同源导出入口。
3. AgentContext / AgentPolicy facts 以 refs 或 typed payload 进入 Runtime events。
4. AgentUI 只消费 read model、summary 和 owner refs。

### compat

1. 旧 `turn_context`、`runtime_status.metadata`、`context_trace` 可暂时映射为 AgentContext/AgentPolicy refs。
2. 旧 evidence/replay/review helper 可暂时委托 `agent_runtime_export_*`。
3. AgentUI 对 P1 profile event 静默兼容，但不把它当 UI-owned truth。

退出条件：P2/P3/P4 的 read model、evidence pack、policy/action facts 完成后，删除对应字段级推断。

### deprecated

1. GUI 从消息正文推断 permission、tool success、artifact saved、evidence pass。
2. review/analysis 各自重新拼 runtime observability summary。
3. context compaction 静默替换 source context，不写 compaction refs 和 loss notes。
4. policy deny/ask 只作为中文文案进入 timeline，不形成 machine-readable action/policy refs。

### dead

1. 新增 `agentcontext_runtime_state` 或 `agentpolicy_runtime_state` 作为 runtime 平行事实源。
2. 新增 `agentevidence_timeline_v2` 绕过 AgentRuntime events。
3. 新增 `agentui_profile_store` 保存执行真相。
4. 将 AgentContext / AgentEvidence / AgentPolicy 合并进 AgentRuntime 大一统 schema。

## 5. 落地顺序

| 阶段 | 相邻标准目标 | Lime 最小产物 |
| --- | --- | --- |
| P1 | Runtime event envelope 可被 AgentUI 安全接收 | `lime-profile-0.4.0` stream event 静默兼容与结构测试 |
| P2 | AgentUI 只读 read model，Context facts 可见 | `ThreadReadModel.contextSummary/missingContext/compaction` 或等价 summary |
| P3 | AgentEvidence 同源导出 | evidence pack 带 runtime correlation spine、context/policy refs、completeness |
| P4 | AgentPolicy 决策进入 action/tool facts | `permission.evaluated/action.required/action.resolved/tool.failed` fixture |
| P5 | 子代理、job、remote channel 带上下文、策略、证据 lineage | parent-child graph、handoff context boundary、review/evidence refs |

## 6. 必补测试

| 测试 | 断言 |
| --- | --- |
| Runtime/Profile fixture | `schemaVersion=lime-profile-0.4.0`、核心 ids、sequence 单调。 |
| Context linkage | `context.resolved` 只引用 context owner refs，不复制大 payload。 |
| Policy linkage | `ask/deny/indeterminate` 能转成 runtime action/blocked facts。 |
| Evidence linkage | evidence pack 的 runtime completeness 不伪造缺失 telemetry。 |
| AgentUI projection | UI 对 profile event 不告警、不伪造状态，P2 后从 read model 展示。 |
| Governance | 搜索不到新增 UI-only、evidence-only、context-only 的 runtime truth builder。 |
