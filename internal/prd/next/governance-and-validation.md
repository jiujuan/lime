# Lime Next 治理与验证

> 状态：north-star planning source
> 更新时间：2026-06-07

## 1. 治理原则

1. 代码仓库是唯一记录系统；影响下一步开发的判断必须写入 repo。
2. App Server current 主链优先于 legacy command 和 mock。
3. 新 Agent 能力默认进入 RuntimeCore / ExecutionBackend / App Server protocol。
4. 新 Agent UI 默认先做 projection / ViewModel，再做组件。
5. 新工具执行默认先进入 Permission / Sandbox Control Plane，不允许 ToolRuntime / ExecutionBackend 绕过 Sandbox Manager。
6. 服务端基础设施默认通过 ports / adapters 接入，不允许 RuntimeCore 直接绑定 Redis、S3、Postgres、Docker、Kubernetes 或具体云 SDK。
7. 清理必须服务主线，不能用治理减法替代交付。

## 2. 分类规则

| 分类 | 判断标准 | 允许动作 |
| --- | --- | --- |
| `current` | 当前事实源，新增能力默认进入 | 扩展、测试、文档化 |
| `current target` | 目标形态，还在迁移中 | 按路线图推进 |
| `compat` | 迁移期兼容入口，只能委托 current | 保留、薄适配、写退出条件 |
| `deprecated` | 旧路径仍可能被引用，但不应新增能力 | 迁移、加 guard、准备删除 |
| `dead` | 不再作为产品方向 | 删除或禁止新增 |

## 3. Current 主链

后端：

```text
app-server-protocol
  -> app-server
  -> RuntimeCore
  -> Permission / Sandbox Control Plane
  -> ExecutionBackend
  -> RuntimeEvent
  -> agentSession/event / read model
```

前端：

```text
src/lib/api/appServer.ts / app-server-client
  -> agentSession/* current method
  -> headless projection
  -> UI primitives
  -> shell adapter
```

服务端：

```text
Remote Runtime Gateway
  -> Auth / Tenant / SandboxProfile / Policy
  -> Server Mode Control Plane
  -> Sandbox Manager
  -> RuntimeCore facts
  -> Infrastructure Ports
  -> Redis / Postgres / S3 / Queue / Docker / Kubernetes / Secret Manager / OpenTelemetry adapters
```

## 4. Compat 边界

允许保留：

1. legacy desktop facade：只委托 App Server / RuntimeCore。
2. `src/lib/api/agentRuntime/*`：只作为旧 UI 形状投影，不作为后端事实源。
3. Claw shell：作为 Lime Desktop 旗舰壳，不作为共享组件包。

禁止：

1. 在 compat 层新增 runtime 业务逻辑。
2. 用 compat command 作为新功能验收证据。
3. 用 mock-only 测试证明生产路径。
4. 让独立 App 依赖 compat facade。
5. 让移动 App / 小程序依赖本地 sidecar 或 Electron bridge。

## 5. Deprecated / Dead 规则

标记为 `deprecated` 的典型对象：

1. UI 组件直接发 `safeInvoke` 获取 runtime facts。
2. React 挂载测试里塞复杂状态机，而不是抽 view model。
3. App 专用 runtime glue。
4. 仍能被用户路径触发但已有 current 替代计划的 legacy command。
5. RuntimeCore 直接 import Redis、S3、Postgres、Docker、Kubernetes 或具体云 SDK。
6. ToolRuntime / ExecutionBackend 绕过 Sandbox Manager 直接执行工具或 shell。
7. 把 Docker / Kubernetes 当作 permission model。

标记为 `dead` 的典型对象：

1. 独立 App copy Claw 整页。
2. 独立 App 自建完整 Agent runtime。
3. 生产 mock fallback。
4. UI-only state 标记 Agent 执行成功。
5. 移动 App / 微信小程序自建 AgentRuntime。
6. 小程序持有 provider secret 或绕过服务端 policy 调工具。
7. 服务端 worker 无 tenant scoped sandbox profile 即执行工具。

## 6. 文档守卫

新增或修改下一阶段规划时：

1. 产品方向写入 `internal/prd/next/`。
2. App Server 具体实现路线写入 `internal/roadmap/appserver/`。
3. 长任务执行计划写入 `internal/exec-plans/`。
4. 涉及工具执行、shell、文件系统、网络、approval、secret 或 sandbox backend 时，先对齐 [sandbox-and-permissions.md](./sandbox-and-permissions.md)。
5. 涉及 Redis、Postgres、S3、Docker、Kubernetes、Secret Manager、OpenTelemetry、本地 FS、SQLite、OS Keychain 或缓存时，先对齐 [client-server-infrastructure.md](./client-server-infrastructure.md)。
6. 如果规则可机械验证，应补脚本或测试，而不是只写散文。

## 7. 代码守卫建议

后续实现应逐步补：

1. 扫描共享 UI primitive，禁止 import `safeInvoke`、Electron bridge、legacy command。
2. 扫描 production path，禁止 mock fallback。
3. 扫描 Agent lifecycle，禁止 `agent_runtime_submit_turn` / `interrupt` / `respond_action` 回流为正向路径。
4. 扫描 App Server protocol method 字符串，优先使用 `packages/app-server-client/src/protocol.ts` 常量。
5. 结构测试：service crate 不依赖 retired desktop host。
6. Projection 单测：终态、action、artifact、evidence、tool event 都可回放。
7. 结构测试：RuntimeCore 不得依赖 Redis、S3、Postgres、Docker、Kubernetes 或具体云 SDK。
8. 结构测试：ToolRuntime / ExecutionBackend 不得绕过 Sandbox Manager。
9. 结构测试：服务端 worker 必须携带 sandbox profile。
10. 服务端 adapter 测试：Cache / DB / ObjectStore / Queue / Secret / Observability port 行为可替换。
11. Gateway 测试：移动 App / 小程序 action respond 幂等、鉴权、租户隔离、sandbox profile 和 artifact 安全预览。
12. UI / projection 测试：端侧不得消费 Redis key、S3 key、K8s job、Secret ARN 或本地绝对路径作为 Runtime facts。

## 8. 验证入口

文档-only 变更：

```bash
find "internal/prd/next" -type f -name "*.md" -print
```

协议 / App Server / client 变更：

```bash
npm run test:contracts
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server
```

前端 AgentRuntime UI 变更：

```bash
npm run test:contracts
npm run verify:gui-smoke
```

服务端 / Remote Gateway 变更：

```bash
npm run test:contracts
npm run governance:legacy-report
```

后续补齐服务端 crate / package 后，应增加定向测试覆盖 sandbox profile、permission policy、Sandbox Manager、infrastructure ports、gateway auth、queue、object store 和 observability adapters。

Electron Host / sidecar / package 变更：

```bash
npm run typecheck:electron
npm run electron:verify:package
```

真实 Claw 主路径：

```bash
npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000
```

要求：该脚本本身就是用户显式发起的 Claw live Provider / WebSearch-WebFetch E2E 入口，不再要求 `--allow-live-provider` 二次授权。默认 fixture、GUI smoke 和批量回归仍不得调用正式 Provider。

## 9. PR / 收尾检查

每次涉及 Lime Next 主线的变更，收尾必须说明：

1. 本轮落在哪条主链：App Server、RuntimeCore、ExecutionBackend、Projection、UI Primitive、Shell Adapter、Remote Gateway、Infrastructure Port、Adapter。
2. 涉及哪些事实源。
3. 是否新增或延长 compat。
4. 是否有 deprecated / dead 路径未收。
5. 跑了哪些验证。
6. 主线完成度和剩余下一刀。

## 10. 风险清单

| 风险 | 表现 | 缓解 |
| --- | --- | --- |
| 抽象过早 | 没有第二消费者就发布 UI 包 | 先内部模块化，等真实复用再包化。 |
| 共享过度 | Claw shell 被其他 App 强依赖 | 只共享 projection / primitives。 |
| Runtime 分裂 | Agent App 自建 turn loop | 强制走 `agentSession/*`。 |
| 服务端分裂 | Server Mode 重造 session / turn / event 模型 | Gateway 只能映射 App Server 语义。 |
| Sandbox 旁路 | ToolRuntime / ExecutionBackend 直接执行命令 | Sandbox Manager 结构测试和执行审计。 |
| 容器误用 | 把 Docker / Kubernetes 当成 sandbox 本身 | permission profile 才是事实源，容器只做 worker 承载。 |
| 基础设施污染 | RuntimeCore 直接依赖 Redis / S3 / Postgres / k8s | ports / adapters 分层和结构测试。 |
| 端侧泄密 | 移动端或小程序持有 provider secret | Secret ref 只在 gateway / server adapter 解析。 |
| 事件漂移 | UI 各自解释 backend event | RuntimeEvent -> projection 单一入口。 |
| mock 假成功 | 生产路径缺 bridge 时仍显示成功 | fail closed，mock 只在测试夹具。 |
| 终态误判 | `turn.completed` 被当作最终输出完成 | projection 统一终态规则并测试。 |

## 11. 当前状态判断

截至 2026-06-07：

1. App Server 路线图和 crate 家族已有基础。
2. Claw shell / composer ready smoke 已有，但完整 streaming GUI E2E 仍是关键缺口。
3. Agent App UI runtime 生命周期已有证据，但对话 turn 复用仍需继续证明。
4. 前端共享已有 `@limecloud/agent-app-runtime` / projection 雏形，但 Claw UI primitives 尚未系统抽边界。
5. 服务端 / 移动 App / 微信小程序已进入北极星范围，但还没有 Sandbox / Permissions、Remote Gateway / infrastructure ports 的执行级 PRD。
6. 当前最值得继续的一刀仍是 App Server 真实 turn lifecycle 和 headless projection 标准化；服务端方向的下一刀是 Sandbox / Permissions PRD，再进入 Remote Gateway PRD 与 infrastructure ports。
