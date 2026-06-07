# Lime Next 产品原型

> 状态：north-star prototype  
> 更新时间：2026-06-07  
> 目标：把 Lime Next 从架构文字推进到可讨论的产品界面原型，覆盖 Claw 桌面端、AgentRuntime 共享 UI、服务端控制台、移动 App、微信小程序和客户端 / 服务端基础设施边界。

依赖文档：

- [README.md](./README.md)
- [prd.md](./prd.md)
- [architecture.md](./architecture.md)
- [sandbox-and-permissions.md](./sandbox-and-permissions.md)
- [runtime-deployment-surfaces.md](./runtime-deployment-surfaces.md)
- [client-server-infrastructure.md](./client-server-infrastructure.md)
- [frontend-runtime-ui-sharing.md](./frontend-runtime-ui-sharing.md)

可打开原型：

- [prototype.html](./prototype.html)

## 1. 原型结论

Lime Next 的产品原型不是一个新首页，也不是营销页。它是一套多端工作面：

1. **Claw 桌面工作台**：旗舰体验，承载完整 Agent turn、工具、审批、artifact、evidence 和工作区上下文。
2. **共享 AgentRuntime UI**：只共享 projection / ViewModel / primitives，不共享 Claw 整页 shell。
3. **Sandbox 控制台**：面向 permission profile、sandbox profile、approval、exec policy、worker 承载、事件存储和审计。
4. **移动 App**：轻量查看、审批、继续任务和 artifact preview。
5. **微信小程序**：任务提醒、预定义 capability、审批和安全预览。
6. **Sandbox 与基础设施边界面**：让实现者和平台维护者明确 RuntimeCore、Sandbox Manager、ports、client adapters、server adapters 的依赖方向。

## 2. 成套原型契约

```text
目标用户：
Claw 重度用户、Agent App 开发者、服务端平台维护者、移动审批用户、微信轻入口用户。

用户目标：
用同一条 Runtime facts 完成桌面复杂工作、服务端长任务、多端审批和安全预览。

主页面骨架：
桌面端保留 Lime 左侧导航 + 顶部上下文 + 主工作区 + 右侧详情栏。
服务端控制台使用 Sandbox / Approval / Worker / Event Audit 分栏，队列和基础设施只作为支撑信息。
移动端和小程序是轻壳，不复制桌面工作台。

核心对象：
会话、运行、事件、审批、权限配置、Sandbox 画像、产物、证据、能力、服务端任务、基础设施端口、适配器。

统一词表：
Runtime 会话、当前运行、等待确认、权限画像、Sandbox 边界、产物预览、证据包、能力、服务端任务、基础设施端口、客户端适配器、服务端适配器。

禁用词表：
默认 UI 不暴露 Redis key、S3 key、K8s job name、Secret ARN、本地绝对路径、provider secret、Electron IPC、safeInvoke、legacy command、mock fallback。

状态模型：
可开始、运行中、等待确认、需要补充、已取消、失败、已完成、可恢复。

用户旅程：
总览 -> Claw 发起真实 turn -> 权限画像与本地 sandbox 生效 -> 服务端长任务进入 sandbox worker -> 移动端审批 action -> 小程序查看安全预览 -> Sandbox 与基础设施边界确认实现落层。

视觉锚点：
浅色桌面工作台，深蓝主按钮，浅青绿选中态，柔和绿色表示健康，琥珀表示待确认，红色表示问题态。
```

## 3. 信息架构

```text
Lime Next Runtime Cockpit
  -> 总览
     -> 当前运行形态
     -> 多端入口
     -> 下一刀
  -> Claw 工作台
     -> Runtime timeline
     -> Action approval
     -> Artifact preview
     -> Evidence summary
  -> 服务端控制台
     -> Remote Runtime Gateway
     -> Sandbox Profile
     -> Approval / Exec Policy
     -> Queue / Worker Carrier
     -> Event Store / Audit
  -> 移动审批
     -> Session status
     -> Pending action
     -> Artifact preview
  -> 微信轻入口
     -> Capability list
     -> Task reminder
     -> Approval / summary
  -> 基础设施边界
     -> RuntimeCore facts
     -> Sandbox Manager
     -> Infrastructure ports
     -> Client adapters
     -> Server adapters
```

## 4. 帧序列

### 4.1 总览帧

目标：让团队一眼看到 Lime Next 是一条 Runtime、多端入口、两类 adapters。

关键内容：

1. 中心是 RuntimeCore facts。
2. 上游是 Claw、Agent Apps、移动 App、小程序、Server Console。
3. 执行边界是 permission profile / sandbox manager。
4. 下游才是 ports / adapters。
5. 明确下一刀：真实 turn lifecycle、projection 标准化、Sandbox / Permissions PRD、Remote Gateway PRD。

### 4.2 Claw 桌面工作台帧

目标：证明 Claw 仍是旗舰体验，但 runtime 事实来自 App Server current 主链。

低保真结构：

```text
┌────────────────────────────────────────────────────────────────────┐
│ Lime Next · Claw 工作台                         [发送] [导出证据] │
├──────────────┬───────────────────────────────────┬────────────────┤
│ 左侧导航      │ Runtime Timeline                  │ 运行详情         │
│ Claw         │ - user turn                        │ Projection      │
│ Agent Apps   │ - assistant stream                 │ Action          │
│ 服务端任务    │ - sandboxed tool step              │ Sandbox         │
│ 权限边界      │ - permission profile               │ Artifact        │
│ 基础设施      │ - pending action                   │ Evidence        │
└──────────────┴───────────────────────────────────┴────────────────┘
```

固定规则：

1. Timeline 不直接调用 host / bridge。
2. 右侧详情只展示 projection 和 refs。
3. 终态由 Runtime facts 推导，不由 UI 猜测。
4. 本地工具执行必须展示 active permission profile 的摘要和审批状态。

### 4.3 服务端控制台帧

目标：把服务端模式表达成受控执行面，而不是本地 sidecar 云部署。

低保真结构：

```text
┌────────────────────────────────────────────────────────────────────┐
│ Server Sandbox Console                  tenant: default · healthy  │
├───────────────┬───────────────┬───────────────┬──────────────────┤
│ Gateway       │ Sandbox       │ Worker Carrier│ Event / Audit     │
│ auth / tenant │ profile       │ running jobs  │ Postgres / OTel   │
│ capability    │ FS / network  │ container/K8s │ evidence refs     │
└───────────────┴───────────────┴───────────────┴──────────────────┘
```

固定规则：

1. Gateway 只映射 Runtime 语义，不重造 facts。
2. Sandbox profile、approval、exec policy 是服务端控制台的第一优先级。
3. Redis / Postgres / S3 / K8s 只在 server adapters 或 worker carrier 区域出现。
4. Worker 状态不能变成 UI 终态事实源。

### 4.4 移动 App 帧

目标：移动端只做轻任务，不复制 Claw。

低保真结构：

```text
┌────────────────────────────┐
│ Lime Mobile                │
├────────────────────────────┤
│ 当前任务：内容发布检查       │
│ 状态：等待确认              │
│                            │
│ 需要确认：是否写入工作区？   │
│ [拒绝] [批准]               │
│                            │
│ 产物预览：publish-plan.md   │
└────────────────────────────┘
```

固定规则：

1. 不持有 provider secret。
2. 不运行完整 ToolRuntime。
3. action respond 必须经 Remote Gateway 做身份、approval scope 和幂等校验。

### 4.5 微信小程序帧

目标：小程序作为微信生态轻入口。

低保真结构：

```text
┌────────────────────────────┐
│ Lime 任务                  │
├────────────────────────────┤
│ 任务提醒：公众号草稿检查     │
│ 能力：生成发布清单           │
│ 状态：运行中                │
│                            │
│ [查看摘要] [确认继续]        │
└────────────────────────────┘
```

固定规则：

1. 小程序只通过 HTTPS Remote Runtime Gateway。
2. OpenID / unionId 只作为 gateway context。
3. 不显示 S3 key、Redis key、secret 或本地路径。

### 4.6 基础设施边界帧

目标：让后续实现前先判断能力落层。

低保真结构：

```text
┌────────────────────────────────────────────────────────────────────┐
│ RuntimeCore facts                                                  │
│ Session / Turn / Event / Action / Artifact / Evidence              │
├────────────────────────────────────────────────────────────────────┤
│ Sandbox Boundary                                                   │
│ PermissionProfile / SandboxManager / Approval / ExecPolicy / Audit │
├────────────────────────────────────────────────────────────────────┤
│ Infrastructure Ports                                               │
│ Cache / Workspace / Database / ObjectStore / Queue / Secret / OTel  │
├───────────────────────────────┬────────────────────────────────────┤
│ Client Adapters               │ Server Adapters                    │
│ Memory / FS / SQLite / Keychain│ Redis / Postgres / S3 / K8s / KMS  │
└───────────────────────────────┴────────────────────────────────────┘
```

固定规则：

1. RuntimeCore 不 import Redis / S3 / Postgres / Docker / Kubernetes SDK。
2. ToolRuntime / ExecutionBackend 不绕过 Sandbox Manager。
3. Docker / Kubernetes 不是 permission model。
4. 端侧 UI 不消费基础设施对象。
5. Artifact / Evidence 只暴露 ref、preview、summary、contentStatus。

## 5. 交互规则

1. 桌面原型的 Tab 切换只改变视图，不改变事实源。
2. 移动和小程序原型只展示 gateway projection，不展示底层 infra。
3. 服务端原型的运行状态来自 runtime event / sandbox audit / queue projection，不成为第二套 Runtime facts。
4. Sandbox 与基础设施原型用于实现前判断，不面向普通用户直接展示。
5. 所有失败、等待确认、需要补充状态都必须给出下一步动作。

## 6. Prototype HTML 说明

[prototype.html](./prototype.html) 是自包含静态文件，可以直接用浏览器打开。它包含 6 个视图：

1. 总览。
2. Claw 工作台。
3. Sandbox 控制台。
4. 移动审批。
5. 微信轻入口。
6. Sandbox 与基础设施边界。

该 HTML 不是生产 UI，也不是组件实现。它的用途是让下一步 PRD / 设计 / 实现讨论拥有共同参照。

## 7. 验收口径

这套原型合格的标准：

1. 能看出 Claw、服务端、移动 App、小程序都消费同一组 Runtime facts。
2. 能看出前端共享只共享 projection / primitives，不共享 Claw shell。
3. 能看出服务端和客户端基础设施不同。
4. 能看出 Remote Gateway 是移动端和小程序的唯一 runtime 入口。
5. 能看出客户端和服务端都有 sandbox / permissions。
6. 能看出 RuntimeCore 不直接依赖 Redis、S3、Postgres、Docker、Kubernetes。
7. 能看出 Docker / Kubernetes 只是 worker 承载选项。
8. 能作为后续 Sandbox / Permissions PRD、Remote Gateway PRD、Infrastructure Ports PRD 和 UI primitives 拆分的输入。
