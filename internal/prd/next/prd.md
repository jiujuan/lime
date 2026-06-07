# Lime Next PRD

> 状态：north-star planning source
> 更新时间：2026-06-07
> Owner：Lime Runtime / App Server / Claw / Agent Apps

## 1. 一句话目标

把 Lime 打造成以 App Server / RuntimeCore 为底座、以 sandbox-first 权限模型为执行安全主轴、以 Claw 为旗舰体验、以共享 AgentRuntime projection 和 UI primitives 为端侧复用层、可演进到服务端运行形态和移动 / 小程序入口的多端 Agent 平台。

## 2. 产品目标

1. 让 Lime Desktop / Claw 继续承载最完整的 Agent 工作台体验。
2. 让 content-studio 和未来独立 App 不需要自建 AgentRuntime，就能获得会话、turn、工具、审批、artifact、evidence 和事件流能力。
3. 让 Agent Apps 既可以在 Lime Desktop 中运行，也可以向独立壳演进，但 runtime 能力仍受 Lime App Server 治理。
4. 让移动 App 和微信小程序成为轻量入口：查看、审批、触发、继续任务，但不自建 runtime。
5. 让服务端模式成为长任务、多端同步、消息渠道和小程序的受控执行底座。
6. 让客户端和服务端都通过 permission profile、filesystem / network policy、sandbox manager、approval / escalation、exec policy 和 audit 执行工具。
7. 让服务端基础设施能力通过 ports / adapters 接入 Redis、Postgres、S3 / OSS、Queue、Docker / Kubernetes、Secret Manager 和 OpenTelemetry，而不是污染 RuntimeCore。
8. 让前端共享不再靠复制页面，而是复用 projection、ViewModel 和 UI primitives。
9. 让 legacy command glue 和 mock fallback 不再承接新增业务。

## 3. 用户与角色

| 角色 | 需要完成的事 | Lime Next 提供的能力 |
| --- | --- | --- |
| Claw 用户 | 在桌面工作台中完成复杂 Agent 协作 | 完整 Claw shell、流式 timeline、工具审批、本地 sandbox、artifact/evidence、工作区上下文。 |
| content-studio 用户 | 在内容业务对象内直接使用 Agent | App Server session 绑定业务对象，事件投影到内容工作台。 |
| Agent App 用户 | 使用垂直 Agent App 完成具体任务 | 复用 RuntimeCore、capability、artifact、evidence 和默认 UI primitives。 |
| 独立 App 开发者 | 快速接入 Lime Agent 能力 | TypeScript client、protocol schema、projection SDK 和可选 UI 组件。 |
| 移动 App 用户 | 随时查看任务、审批 action、继续轻量会话 | Remote Runtime Gateway、推送、轻量 projection、移动端 UI primitives。 |
| 微信小程序用户 | 在微信内触发任务、审批、看摘要 | HTTPS gateway、OpenID 绑定、预定义 capability、受控 artifact preview。 |
| 服务端平台维护者 | 支撑长任务、多端同步、后台 worker | Server Mode RuntimeCore、tenant scoped sandbox、Redis、Postgres、S3、Queue、Docker / Kubernetes、Secret Manager、OpenTelemetry。 |
| Runtime 维护者 | 只维护一条执行主链 | RuntimeCore / ExecutionBackend / App Server current 主链。 |
| 前端维护者 | 不重复实现 Agent UI | Headless projection + UI primitives + shell adapter 分层。 |

## 4. 用户故事

### 4.1 Claw 用户：旗舰工作台不退化

作为 Claw 用户，
当 Lime 把底层迁到 App Server 时，
我希望发送、流式输出、工具审批、取消、artifact、evidence 和历史恢复保持稳定，
这样我不会因为架构升级感到功能倒退。

验收：

1. Claw 发送路径进入 `agentSession/turn/start`。
2. 取消进入 `agentSession/turn/cancel`。
3. 审批进入 `agentSession/action/respond`。
4. `agentSession/event` 能驱动 timeline append 或 read model refresh。
5. 本地工具执行必须携带 active permission profile，并经 local sandbox backend 执行。
6. 真实 GUI smoke / E2E 能覆盖发送、streaming、event refresh 和 read model 回流。

### 4.2 content-studio 用户：在业务对象内用 Agent

作为 content-studio 用户，
当我在草稿、素材、栏目或发布任务中使用 Agent 时，
我希望 Agent 的会话、事件和产物绑定当前业务对象，
这样我不用离开内容工作台。

验收：

1. Electron main 通过 `app-server-client` 启动或连接 App Server。
2. session 带 `businessObjectRef`。
3. renderer 只消费业务投影，不直接操作 runtime。
4. artifact / evidence 能回到业务对象上下文。

### 4.3 Agent App 开发者：不用复制 Claw

作为 Agent App 开发者，
当我要做一个垂直 Agent App 时，
我希望可以复用默认 AgentRuntime projection 和 UI primitives，
但仍能保留自己的业务页面和交互。

验收：

1. App 使用 `app-server-client` 或 Host Bridge 调用 runtime。
2. App 使用 headless projection 生成 view model。
3. App 可以选择默认 UI primitives 或自定义渲染。
4. App 不 import Claw shell、Electron 私有 bridge 或 legacy command。

### 4.4 平台维护者：新增能力不分裂

作为平台维护者，
当新增 tool、skill、artifact、evidence、action 或 model 能力时，
我希望只在 App Server / RuntimeCore / protocol current 主链补能力，
这样所有 App 都能获得一致行为。

验收：

1. 新能力有协议或 capability 表达。
2. 前端 gateway 只走 App Server current method。
3. mock 只存在于测试夹具。
4. contract / governance guard 能发现 legacy 回流。

### 4.5 移动用户：我想在手机上处理关键 Agent 任务

作为移动 App 用户，
当 Agent 任务等待我确认、补充输入或查看结果时，
我希望在手机上完成轻量操作，
这样不必一直打开桌面端。

验收：

1. 移动端通过 Remote Runtime Gateway 读取 session projection。
2. action approve / deny 具备幂等性和审计。
3. artifact / evidence 只展示安全预览。
4. 移动端不持有 provider secret，不直接运行完整 ToolRuntime。

### 4.6 微信小程序用户：我想在微信里处理轻任务

作为微信小程序用户，
当我需要触发预定义任务、审批执行或查看摘要时，
我希望直接在微信内完成，
这样 Agent 能嵌入我的日常协作入口。

验收：

1. 小程序只通过 HTTPS Remote Runtime Gateway 调用。
2. 用户身份通过微信 OpenID / unionId 与 Lime 账号或租户绑定。
3. capability 只能使用服务端允许的预定义集合。
4. 小程序不直接连接本地 sidecar、不保存 secret、不自建 runtime。

### 4.7 服务端运维者：我想支撑后台长任务和多端同步

作为服务端运维者，
当任务需要在用户离线后继续运行，或需要服务移动端 / 小程序 / 消息渠道时，
我希望 RuntimeCore 能以服务端模式运行，
这样多端可以订阅同一任务事实和 evidence。

验收：

1. Server Mode 有认证、租户隔离、sandbox profile、队列、取消、恢复和审计。
2. 事件可通过 SSE / WebSocket / push / polling 映射到 `agentSession/event` 语义。
3. secret 以 ref 方式托管，不下发端侧。
4. 每个服务端 worker turn 都必须解析 tenant / app / user scoped permission profile，并由 sandbox manager 选择 worker sandbox backend。
5. Redis / Postgres / S3 / Queue / Docker / Kubernetes / Secret Manager / OpenTelemetry 都只在 server-side adapters 中出现。
6. 服务端不复用 Electron Host 作为业务后端。

## 5. 核心需求

### 5.1 Runtime 服务化

必须满足：

1. App Server 是 Agent session / turn / event / action / artifact / evidence 的默认入口。
2. RuntimeCore 是公共 runtime facts 的 owner。
3. ExecutionBackend 负责 Aster 和未来执行引擎适配。
4. legacy desktop facade 只做 compat 委托。
5. 独立 App 不直接链接 Lime Rust workspace。

### 5.2 前端共享

必须满足：

1. `AgentEvent/readModel -> AgentRuntimeViewModel` 是 headless projection。
2. UI primitives 不直接调用 `safeInvoke`、Electron bridge、App Server client 或 store。
3. Claw shell 只负责旗舰布局、导航、工作区、模型选择和宿主能力。
4. content-studio / Agent Apps 通过自己的 shell adapter 消费同一 projection。
5. 共享组件必须覆盖加载、空态、运行中、等待 action、失败、取消、完成等状态。

### 5.3 多 App 能力发现

必须满足：

1. `capability/list` 能按 appId、policy、workspace 过滤。
2. capability 不暴露 Rust 模块路径或 legacy command 名。
3. App 通过 capabilityId 发起 turn。
4. tool / skill / permission / evidence 由 runtime 决定，不由 App UI 猜测。

### 5.4 证据链路

必须满足：

1. artifact 和 evidence 从 RuntimeCore facts 派生。
2. App 只读取 refs、summary、preview 或导出结果。
3. UI 不能用本地状态伪造完成态。
4. evidence export 能跨 Claw、Agent App、content-studio 复用。

### 5.5 服务端 / 移动 / 小程序入口

必须满足：

1. 服务端模式复用 RuntimeCore facts，不发明第二套 session / turn / event 语义。
2. 移动 App 和微信小程序只消费 projection / action / artifact / evidence API。
3. 远程入口必须有认证、租户隔离、capability policy、sandbox profile 选择和审计。
4. 事件订阅必须支持断线恢复。
5. 端侧不持有 provider secret 明文。
6. 小程序只能通过 HTTPS gateway 访问，不能直接连本地 sidecar。

### 5.6 Sandbox / Permissions

必须满足：

1. 每个 session / turn / tool attempt 都能追溯 active permission profile。
2. Permission profile 必须覆盖 filesystem policy、network policy、approval policy、exec policy 和 secret scope。
3. 客户端本地执行必须经 local sandbox backend：macOS Seatbelt、Linux bubblewrap / Landlock / seccomp、Windows restricted token 或等价实现。
4. 服务端执行必须经 server worker sandbox backend：container / namespace / VM / microVM / gVisor / Firecracker / Kubernetes policy 等承载选项之一，但不能把承载选项当作 permission 模型。
5. denied-read、protected metadata、secret ref 和 network deny 必须 fail closed。
6. Approval 只处理越界授权，不扩大默认 sandbox 边界。
7. 审计必须记录 permission profile、approval decision、sandbox attempt、网络 policy decision 和 artifact / evidence ref。

### 5.7 服务端基础设施

必须满足：

1. Cache 通过 port 接入，服务端 adapter 可用 Redis，客户端 adapter 可用 memory / local cache。
2. Database 通过 port 接入，服务端 adapter 可用 Postgres，客户端 adapter 可用 SQLite / local store。
3. Object Store 通过 port 接入，服务端 adapter 可用 S3 / OSS，客户端 adapter 可用本地 artifact directory。
4. Queue / Scheduler 通过 port 接入，服务端 adapter 可用 queue / workflow engine / Kubernetes job，客户端 adapter 可用进程内队列。
5. Secret 通过 port 接入，服务端 adapter 可用 Secret Manager / KMS，客户端 adapter 可用 OS Keychain。
6. Observability 通过 port 接入，服务端 adapter 可用 OpenTelemetry / audit log，客户端 adapter 可用 local logs / stderr。
7. RuntimeCore 不直接 import Redis、S3、Postgres、Docker、Kubernetes 或具体云 SDK。

## 6. 非目标

本阶段不做：

1. 近期不把本地 App Server current 实施重写为云端多租户系统；服务端模式作为北极星和后续路线单独推进。
2. 不复制 ChatGPT 或 Codex App 的闭源产品实现。
3. 不把 Claw 整页作为共享 UI 包发布。
4. 不让独立 App 直接 import Lime Rust crate 或 Claw 内部组件树。
5. 不为每个 App 定制一套 runtime。
6. 不用 mock backend 或 UI state 证明生产可交付。
7. 不一次性迁完所有 legacy desktop commands。
8. 不让移动 App / 小程序运行完整桌面 ToolRuntime。
9. 不让 RuntimeCore 直接依赖 Redis、S3、Postgres、Docker、Kubernetes 或具体云 SDK。
10. 不绕过 sandbox manager 直接执行工具或 shell 命令。
11. 不把 Docker / Kubernetes 当成 sandbox 本身。

## 7. 成功指标

| 指标 | 目标 |
| --- | --- |
| Runtime 复用 | 第二个真实 App 接入 Agent turn 时不新增 runtime 实现。 |
| 前端复用 | 第二个真实 App 复用同一 headless projection。 |
| 组件复用 | timeline / action / artifact / runtime status 至少一组 UI primitives 被两个 shell 使用。 |
| 多端复用 | 移动 App 或小程序原型能通过 Remote Runtime Gateway 读取 session、响应 action、展示 artifact preview。 |
| 服务端化 | Server Mode 原型能复用 RuntimeCore facts 跑长任务并输出可订阅事件。 |
| Sandbox 安全闭环 | 客户端和服务端 turn 都能证明 permission profile、sandbox backend、approval / escalation 和 audit。 |
| 基础设施分层 | 服务端 Redis / Postgres / S3 / Queue / Docker / K8s / Secret / OTel 只在 adapters 层出现。 |
| Legacy 退场 | 新 Agent lifecycle 不再回流 `agent_runtime_*` 正向路径。 |
| GUI 证据 | Claw 完整 streaming GUI E2E 能证明真实发送、事件刷新和 read model 回流。 |
| 协议稳定 | App Server fixture / schema / TS client contract 可阻止漂移。 |

## 8. MVP 范围

MVP 只认一条竖切：

```text
Claw 或 Agent App 发起真实 turn
  -> App Server agentSession/turn/start
  -> RuntimeCore
  -> ExecutionBackend
  -> agentSession/event
  -> headless projection
  -> UI primitives / Claw timeline
  -> agentSession/read refresh
  -> evidence/export
```

MVP 不要求所有 UI 组件抽包，也不要求所有旧命令退场。
