# AgentRuntime 前端共享规范

> 状态：north-star planning source
> 更新时间：2026-06-07

## 1. 结论

Claw AgentRuntime UI 可以共享，但共享对象不是整页工作台，而是：

```text
runtime facts
  -> headless projection / ViewModel
  -> UI primitives
  -> shell adapter
```

Claw 整页 shell 继续留在 Lime Desktop；Plugins、content-studio、未来独立 App、移动 App 和微信小程序只复用 projection、状态机、设计合同和可组合 UI。移动 App 与小程序不强行复用 React DOM 组件。

## 2. 可共享与不可共享

| 对象 | 结论 | 原因 |
| --- | --- | --- |
| `agentSession/*` 协议、TS client、schema | 必须共享 | 这是跨 App runtime 合同。 |
| `AgentEvent/readModel -> ViewModel` projection | 必须共享 | 防止每个 App 重新解释 runtime facts。 |
| message / timeline / tool / action / artifact / evidence UI primitives | 可以共享 | 只要只吃 props 和 callbacks。 |
| Runtime status / sandbox / approval / terminal state 展示 | 可以共享 | 只能共享用户可见摘要，状态来自 runtime facts 和 sandbox audit。 |
| Claw workspace shell / sidebar / model selector / settings entry | 不共享 | 绑定 Lime Desktop 产品壳和导航。 |
| Electron bridge / `safeInvoke` / legacy command | 不共享 | 属于宿主适配层，不是 UI primitive。 |
| 业务对象面板 | 不共享 | content-studio / Plugins 各自拥有业务语义。 |
| 移动端 / 小程序 UI 组件实现 | 不强共享 | 共享 ViewModel、状态机和设计 token，不共享 DOM。 |
| Permission profile 原始对象 / sandbox backend 实例 | 不共享给前端 | 前端只展示 profile 摘要、审批状态、失败原因和审计 ref。 |
| 服务端基础设施 adapter | 不共享给前端 | Redis / Postgres / S3 / Queue / K8s 等只属于 server-side adapters。 |

## 3. 三层组件规范

### 3.1 Projection / ViewModel

要求：

1. 纯函数或可测试 reducer。
2. 输入只允许 runtime facts、read model、artifact/evidence summary、sandbox / approval 摘要、shell business ref。
3. 输出稳定 ViewModel，不直接返回 React 节点。
4. 不 import `safeInvoke`、App Server client、Electron bridge、store。
5. 每个复杂分支有 `*.unit.test.ts`。

示例形态：

```text
buildAgentRuntimeViewModel({
  session,
  turns,
  events,
  artifacts,
  evidence,
  sandboxSummary,
  pendingActions,
  shellContext,
})
```

### 3.2 UI Primitives

要求：

1. 只接收 props 和 callbacks。
2. 不发起 runtime 请求。
3. 不读取全局 store。
4. 不依赖 Claw 路由、workspace、Electron 或 Desktop Host。
5. 必须覆盖 loading / empty / running / waitingAction / failed / canceled / completed。
6. 用户可见文案必须本地化；若作为 package 输出，应提供 label override 或资源 key。

候选组件：

1. `AgentRuntimeStatusStrip`
2. `AgentTimeline`
3. `AgentMessageList`
4. `ToolProcessStep`
5. `ActionRequestCard`
6. `ArtifactPreviewCard`
7. `EvidenceSummaryCard`
8. `RuntimeTaskCard`
9. `StreamingTextRenderer`
10. `SandboxSummaryBadge`
11. `ApprovalAuditStrip`

### 3.3 Shell Adapter

每个产品壳自己实现：

1. session 创建 / 恢复策略。
2. businessObjectRef 绑定。
3. workspace / project / document 上下文。
4. provider / model 选择。
5. route / sidebar / window / iframe / preload。
6. callbacks：send、cancel、respondAction、openArtifact、exportEvidence。
7. 移动端 push / deep link / offline resume。
8. 小程序 OpenID 绑定、授权、分享和安全域名。

## 4. 跨端共享策略

桌面、移动 App、微信小程序的 UI 技术栈不同，共享目标应是“同一 ViewModel 和交互合同”，不是同一 React 组件。

| 层 | 桌面 | 移动 App | 微信小程序 | 共享方式 |
| --- | --- | --- | --- | --- |
| AgentRuntime facts | App Server JSON-RPC | Remote Gateway | Remote Gateway | 共享语义 |
| Projection | TypeScript | TypeScript / native port | 小程序 TypeScript port | 共享状态机和测试 fixture |
| UI primitives | React | Native / cross-platform component | 小程序 component | 共享设计合同 |
| Shell | Electron / iframe | Mobile navigation | Mini Program pages | 不共享 |

跨端必须统一：

1. status 枚举。
2. action lifecycle。
3. artifact preview 状态。
4. evidence summary 形状。
5. sandbox / approval 摘要字段。
6. terminal state 判定。
7. i18n key 或 label contract。

## 5. Props 合同原则

共享 UI primitive props 应该表达用户可见状态，而不是后端私有 DTO。

推荐：

```text
status: "idle" | "running" | "waitingAction" | "failed" | "canceled" | "completed"
parts: AgentRuntimePartViewModel[]
actions: AgentRuntimeActionViewModel[]
artifacts: AgentRuntimeArtifactViewModel[]
evidence: AgentRuntimeEvidenceViewModel | null
sandboxSummary: AgentRuntimeSandboxSummaryViewModel | null
onCancel()
onRespondAction(actionId, response)
onOpenArtifact(artifactRef)
```

避免：

```text
raw Agent DTO
legacy command payload
Electron IPC response
runtimeOptions.runtimeRequest
workspace store object
raw permission profile
sandbox backend object
secret ref resolver
Redis / S3 / Postgres response
Docker / Kubernetes job object
```

## 6. 终态判定

共享 projection 必须统一终态规则：

1. `turn.completed` 不能单独代表用户可见完成。
2. assistant 最终正文、`final_done`、失败或取消才可驱动明确终态。
3. 首 token 前仍处于 thinking / waiting output 时，任务卡和输入栏应显示 running。
4. 本地 UI 不能用 timeout 或 optimistic state 伪造完成。
5. 终态必须可从 RuntimeCore facts 或 read model 回放。

## 7. Artifact / Evidence 规则

1. artifact preview 只展示 runtime 返回的 refs / summary / contentStatus。
2. 缺少 sessionId 或 App Server 无 content 时 fail closed。
3. 不从文件系统旁路读取 artifact 来伪造 preview。
4. evidence export 只走 `evidence/export` 或 current 等价 method。
5. evidence UI 可以共享 summary 展示，但导出入口由 shell 提供。
6. 服务端 artifact 只能以 object ref / signed preview / contentStatus 暴露给端侧，不能泄露 S3 key、bucket policy 或内部存储路径。

## 8. Action 规则

1. action card 只展示 pending action。
2. approve / deny / input response 通过 callback 回到 shell adapter。
3. shell adapter 统一调用 `agentSession/action/respond`。
4. UI primitive 不直接调用 App Server。
5. action id、scope、type 必须保持稳定，不由 UI 重新生成。
6. 移动端和小程序 action respond 必须经 Remote Runtime Gateway 做身份、租户、approval scope 和幂等校验。

## 8.1 Sandbox / Approval 展示规则

1. UI 可以展示 sandbox 摘要，例如 `workspace`、`network restricted`、`approval pending`、`denied by policy`。
2. UI 不能展示或消费 permission profile 原始对象。
3. UI 不能持有 sandbox backend 实例、secret resolver、worker handle 或本地绝对路径。
4. approval UI 只响应 runtime 提供的 action id / scope，不自行扩权。
5. sandbox 失败必须来自 RuntimeCore facts 或 sandbox audit，不由 UI 猜测。
6. 服务端 worker carrier、K8s job、Redis key、S3 key 只能在运维视图中以安全摘要出现，不进入通用 UI primitive props。

## 9. 包化时机

现在先不急着抽 npm 包。

抽包条件：

1. 至少两个真实消费者使用同一 projection。
2. 至少一组 UI primitives 被两个 shell 复用。
3. props 合同稳定并有测试覆盖。
4. 没有直接 host 依赖。
5. 本地化和主题 token 有稳定策略。

在条件满足前，共享代码可以留在仓库内部模块，但必须按 public contract 写。

## 10. 禁止路径

1. 新组件直接 `safeInvoke(...)`。
2. 新组件直接 import `src/lib/api/agentRuntime/*` client。
3. UI primitive 读取 Electron / window 私有能力。
4. 独立 App copy `src/components/agent/chat/AgentChatWorkspace.tsx`。
5. Plugin UI runtime start/status/stop 被当作对话 runtime。
6. 测试 mock 被作为生产 fallback。
7. 移动 App / 小程序直接连接本地 sidecar。
8. 小程序持有 secret 或自建 runtime。
9. 前端组件直接消费 Redis / S3 / Postgres / Docker / Kubernetes 对象。
10. 前端组件直接消费 raw permission profile、sandbox backend 或 secret resolver。

## 11. 验收

新增或迁移 AgentRuntime UI 时，至少回答：

1. 这个逻辑属于 projection、UI primitive 还是 shell adapter？
2. 是否依赖 host / bridge / store / legacy command？
3. 是否有纯函数或 view-model 单测？
4. 是否能由 `agentSession/event` 和 `agentSession/read` 回放？
5. 第二个 App 复用时是否只需要替换 shell adapter？
6. 移动端或小程序复用时是否只需要替换组件实现，而不是重写 runtime facts？
7. sandbox / approval 是否只以安全摘要进入 ViewModel？
8. 服务端基础设施对象是否被隔离在 adapter 层，没有泄露进 UI props？
