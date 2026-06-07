# Runtime 部署形态与端侧矩阵

> 状态：north-star planning source
> 更新时间：2026-06-07

## 1. 结论

Lime Next 不只服务桌面端。目标形态必须同时容纳：

1. 本地 sidecar：Lime Desktop、Claw、content-studio、独立 Electron App。
2. 服务端运行形态：受控 server mode / remote runtime gateway / worker。
3. 移动 App：iOS / Android 原生或跨端壳。
4. 微信小程序：受微信运行环境限制的轻端。
5. 消息渠道和浏览器连接器：远程入口与控制面。

但当前执行顺序仍应保持清晰：近期先完成本地 App Server current 主链；服务端、移动 App、微信小程序是北极星目标和协议约束输入，不应倒逼当前阶段重写成云端多租户系统。

## 2. 部署形态矩阵

| 形态 | 定位 | Runtime 位置 | UI 位置 | 当前分类 | 关键约束 |
| --- | --- | --- | --- | --- | --- |
| Lime Desktop / Claw | 旗舰桌面工作台 | 本地 App Server sidecar / in-process bridge | Electron renderer | `current shell` | 真实 GUI E2E 必须证明 turn lifecycle。 |
| content-studio | 首批独立业务 App | 打包 app-server sidecar，后续可切 remote gateway | Electron renderer | `current target` | 只通过 app-server-client 和 businessObjectRef 接入。 |
| Agent App | 垂直任务 App | Lime Runtime / App Server | iframe / standalone shell | `current target` | UI runtime 不等于对话 runtime；turn 必须走 `agentSession/*`。 |
| 独立桌面 App | 第三方或内部垂直桌面产品 | 本地 sidecar 或 remote gateway | 自有桌面壳 | `current target` | 不链接 Lime Rust workspace，不 copy Claw shell。 |
| 移动 App | 轻量任务、审批、查看、继续会话 | 优先 remote gateway，少量离线 projection | 原生 / 跨端 UI | `current target` | 不在手机端运行完整 ToolRuntime。 |
| 微信小程序 | 微信生态轻入口、审批、查看、触发任务 | 只能通过服务端 gateway | 小程序页面 | `current target` | 不持有 secret，不直接访问本地 sidecar，不自建 runtime。 |
| 服务端 / Worker | 长任务、后台执行、多端同步 | Server Mode RuntimeCore / ExecutionBackend | 无 UI 或管理台 | `future current target` | 需要认证、租户隔离、sandbox profile、队列、审计、配额和策略。 |
| 消息渠道 Runtime | IM 远程入口 | 本地 control plane / 后续 gateway | Telegram / 飞书 / Discord / WeChat 等 | `current remote ingress` | 按 `internal/aiprompts/remote-runtime.md` 收敛。 |
| 浏览器连接器 / ChromeBridge | 浏览器侧远程 transport | 本地 browser runtime / control plane | Browser extension / connector | `current remote ingress` | 不新增第三条 remote runtime。 |

## 3. 客户端与服务端基础设施差异

服务端模式不是把客户端 sidecar 部署到云上。两者复用 runtime facts，但基础设施实现不同。完整 port / adapter 边界见 [client-server-infrastructure.md](./client-server-infrastructure.md)。

| 能力 | 客户端 / 本地 sidecar | 服务端 / Server Mode | 架构规则 |
| --- | --- | --- | --- |
| 缓存 | memory、IndexedDB、local cache | Redis / distributed cache | RuntimeCore 只依赖 Cache Port。 |
| 权限 / sandbox | 本机 permission profile、本地 OS sandbox、approval | tenant / app / user scoped sandbox profile、server worker sandbox | ToolRuntime / ExecutionBackend 必须经 Sandbox Manager。 |
| 文件 / workspace | 本地 FS、App data、用户选择的 workspace root | workspace volume、sandbox mount、object refs | 文件权限、路径解析和拒读策略必须走 permission profile / Workspace Port。 |
| 数据库 | SQLite、local store、timeline 本地表 | Postgres / managed DB | session / event 持久化走 Database Port。 |
| Artifact 对象 | 本地文件、App data artifact | S3 / OSS / compatible object storage | ArtifactService 只写 ref / summary / contentStatus。 |
| 队列 / 调度 | 进程内队列、sidecar lifecycle | queue、workflow engine、cron、K8s job | turn enqueue / cancel / resume 走 Queue Port。 |
| Worker 承载 | 本地进程、sidecar lifecycle | container / namespace / VM / microVM / K8s job | Docker / Kubernetes 只是承载选项，不是 permission 模型。 |
| 密钥 | OS Keychain、本地 credential resolver | Secret Manager / KMS / vault | 端侧永不持有 provider secret 明文。 |
| 观测 | local logs、stderr、dev trace | OpenTelemetry、metrics、traces、audit log | RuntimeEvent 与 audit log 分层。 |
| 网络入口 | Electron IPC、stdio、local socket | HTTPS、SSE、WebSocket、push、webhook | Gateway 映射协议语义，不重造 facts。 |

## 4. 本地 Sidecar 与服务端模式

### 4.1 本地 Sidecar

近期 current 主链：

```text
Product Shell
  -> app-server-client / Desktop Host Bridge
  -> local app-server sidecar
  -> RuntimeCore
  -> ExecutionBackend
```

适用：

1. Lime Desktop。
2. Claw。
3. content-studio Electron。
4. 内部独立桌面 App。

优势：

1. 不需要云端账号即可本地执行。
2. 文件系统、workspace、工具权限容易落到本机 policy。
3. 与当前 `internal/roadmap/appserver/` 一致。

### 4.2 服务端模式

远期目标：

```text
Mobile / Mini Program / Web / Message Channel
  -> Remote Runtime Gateway
  -> Auth / Tenant / Sandbox Profile / Policy / Approval / Queue
  -> Server Mode RuntimeCore
  -> Sandbox Manager
  -> Sandboxed ExecutionBackend / Worker
  -> Event Stream / Projection API
```

服务端模式新增要求：

1. 认证与租户隔离。
2. tenant / app / user scoped sandbox profile。
3. 用户、workspace、App、businessObjectRef 的访问控制。
4. filesystem / network / approval / exec policy。
5. server-side queue、retry、cancel、resume。
6. 长任务事件持久化和多端订阅。
7. secret ref 和 provider key 托管，不向端侧泄露。
8. webhook / message channel 回调审计。
9. 配额、限流、成本、日志和合规审计。
10. Redis / Postgres / S3 / queue / Docker / Kubernetes / Secret Manager / OpenTelemetry 等基础设施只能出现在 server-side adapters 或 worker 承载层。

服务端模式不是把当前 Electron host 搬到云上；它只能复用 RuntimeCore facts、协议语义、projection 合同和能力治理。

## 5. 移动 App 边界

移动 App 应该是轻壳：

```text
Mobile UI
  -> Remote Runtime Gateway
  -> session / turn / action / artifact / evidence APIs
  -> AgentRuntime projection
  -> Native UI primitives
```

移动端适合：

1. 查看会话状态。
2. 接收 task / action 通知。
3. approve / deny / 输入补充信息。
4. 查看 artifact preview 和 evidence summary。
5. 发起轻量任务或继续已有任务。

移动端不适合：

1. 本机运行完整 ToolRuntime。
2. 直接访问用户桌面文件系统。
3. 持有 provider secret 明文。
4. 复制 Claw 全量工作台。
5. 执行复杂本地 workspace 写操作，除非通过受控 remote worker。

## 6. 微信小程序边界

微信小程序是最受限端侧，默认只作为轻入口：

```text
WeChat Mini Program
  -> HTTPS Remote Runtime Gateway
  -> Auth / OpenID binding / Tenant policy
  -> Agent session / action / artifact projection
```

适合：

1. 任务提醒。
2. 审批确认。
3. 轻量输入。
4. 查看摘要、草稿、进度。
5. 触发预定义 capability。
6. 打开 artifact / evidence 的安全预览。

禁止：

1. 小程序直接连接本地 sidecar。
2. 小程序持有模型 provider key 或第三方 secret。
3. 小程序执行本地文件系统工具。
4. 小程序自建 AgentRuntime 或 mock 完成态。
5. 小程序绕过服务端 policy 调工具。

## 7. 端侧共享 UI 策略

跨端共享不等于共享 React DOM 组件。

| 层 | 桌面 | 移动 App | 微信小程序 | 是否共享 |
| --- | --- | --- | --- | --- |
| Protocol facts | JSON-RPC / schema | HTTPS / stream / schema | HTTPS / schema | 共享语义 |
| Headless projection | TypeScript | TypeScript / native port | 小程序 TS port | 共享模型 |
| UI primitives | React | Native components | 小程序组件 | 共享设计合同，不强共享代码 |
| Shell | Electron | Mobile shell | Mini Program shell | 不共享 |

原则：

1. 共享 view model，不强行共享组件实现。
2. 桌面可以使用 React primitives。
3. 移动和小程序应复用字段、状态机、设计 token 和文案 key，而不是复用 DOM。
4. 小程序需要单独考虑包体、网络、授权、后台限制和安全域名。

## 8. 服务端 API 形态

远期 remote gateway 可以不是 JSON-RPC wire 原样暴露，但语义必须映射到同一 facts：

| App Server 语义 | 服务端 API 语义 |
| --- | --- |
| `initialize` | client / app / user handshake |
| `agentSession/start` | create or bind session |
| `agentSession/read` | read session projection |
| `agentSession/turn/start` | enqueue / start turn |
| `agentSession/turn/cancel` | cancel turn |
| `agentSession/action/respond` | respond action |
| `agentSession/event` | SSE / WebSocket / push / polling event |
| `artifact/read` | read artifact preview/content |
| `evidence/export` | export evidence pack |
| `capability/list` | list tenant/app visible capabilities |

服务端可以有 REST / SSE / WebSocket / GraphQL gateway，但不能发明第二套 runtime facts。

## 9. 服务端基础设施端口

服务端基础设施端口不替代 sandbox / permissions。进入这些 ports 前，turn / tool attempt 已经必须解析 active permission profile，并由 Sandbox Manager 选择本地或服务端 sandbox backend。

服务端实现前必须先定义 ports，再选具体基础设施：

| Port | 服务端 adapter 示例 | 客户端 adapter 示例 |
| --- | --- | --- |
| `CachePort` | Redis | Memory / local cache |
| `DatabasePort` | Postgres / managed DB | SQLite / local store |
| `ObjectStorePort` | S3 / OSS | Local artifact directory |
| `QueuePort` | Redis queue / workflow engine / K8s job | In-process queue |
| `WorkspacePort` | Workspace volume / sandbox / object ref | Local FS / App data |
| `SecretPort` | Secret Manager / KMS | OS Keychain |
| `ObservabilityPort` | OpenTelemetry / audit log | Local logs / stderr |

规则：

1. RuntimeCore 不能直接 import Redis、Postgres、S3、Docker、Kubernetes 或具体云 SDK。
2. ExecutionBackend 不能绕过 Sandbox Manager，也不能直接承担服务端队列、租户、密钥或观测职责。
3. Docker / Kubernetes 只能作为 worker isolation / scheduling backend。
4. Remote Runtime Gateway 不能把端侧 token、push token、OpenID 当 runtime facts。
5. Artifact / Evidence 在服务端必须以 object ref 和 access policy 暴露，不直接暴露存储路径。

## 10. 与 remote-runtime 文档的关系

现有远程入口以 `internal/aiprompts/remote-runtime.md` 为 current 分类：

1. 消息渠道 runtime 是 IM 远程入口主链。
2. 浏览器连接器 / ChromeBridge 是浏览器侧远程 transport 主链。
3. DevBridge 是 debug-only compat。
4. 旧单通道 Telegram 入口是 deprecated。

Lime Next 服务端模式应吸收这套分类，不新增平级 remote runtime。未来如果引入 Server Mode Gateway，它应成为这些入口的上游控制面或受控替代，而不是第三套入口命名。

## 11. 分阶段落地

| 阶段 | 目标 |
| --- | --- |
| S0 | 保持本地 App Server current 主链，协议语义预留 remote 映射。 |
| S1 | 为 AgentRuntime projection 增加端无关 ViewModel。 |
| S2 | 定义 Sandbox / Permissions PRD：permission profile、FS / network policy、approval、exec policy、client/server sandbox backend。 |
| S3 | 定义 Remote Runtime Gateway PRD：认证、租户、sandbox profile、队列、事件、多端订阅。 |
| S4 | 定义服务端 infrastructure ports：Cache / DB / ObjectStore / Queue / Secret / Observability。 |
| S5 | 移动 App 原型：查看会话、审批 action、artifact preview。 |
| S6 | 微信小程序原型：任务提醒、审批、轻量输入、预定义 capability 触发。 |
| S7 | 服务端 Worker 原型：sandboxed 长任务、事件持久化、evidence export。 |

## 12. 验收口径

服务端 / 移动 / 小程序进入实现前，必须先回答：

1. 该端是否只消费 RuntimeCore facts？
2. 该端如何认证用户和 App？
3. 该端如何选择 permission profile / sandbox profile？
4. tool attempt 是否经 Sandbox Manager？
5. 该端是否可能接触 secret？如果是，secret ref 如何隔离？
6. 事件如何订阅、断线如何恢复？
7. action 审批如何保证幂等？
8. artifact / evidence 如何安全预览？
9. 是否复用了 headless projection？
10. 是否避免了复制 Claw shell 或自建 runtime？
11. cache / file / database / object store / queue / secret / observability 是否都通过 port 接入？
12. 是否避免 RuntimeCore 直接依赖 Redis / S3 / Postgres / Docker / Kubernetes？
