# Lime Next 北极星

> 状态：north-star planning source
> 更新时间：2026-06-07
> Owner：Lime Runtime / App Server / Claw / Plugins / 独立 App 集成

## 1. 定位

本目录定义 Lime 下一阶段的北极星：把 Lime 从单一桌面产品内的 Agent 工作台，升级为以 `lime-rs` App Server 为底座、以 Claw 为旗舰体验、以 Plugins、独立 App、移动 App、微信小程序和服务端运行形态为扩展面的多端 Agent 平台。

本目录不是替代 `internal/roadmap/appserver/` 的执行路线图，而是上层产品与架构对齐文档。具体 App Server current 实施仍以 `internal/roadmap/appserver/` 为准。

## 2. 一句话方向

Lime Next 要把 `lime-rs` 抽成可被 Lime Desktop、Claw、Plugins、content-studio、移动 App、微信小程序、未来独立 App 和受控服务端运行形态复用的 Agent Runtime 服务底座；安全模型采用 sandbox-first，客户端和服务端都必须通过 permission profile、sandbox manager、approval / escalation 和 audit 执行工具；前端复用以 headless projection 和 UI primitives 为核心，不复制 Claw 整页产品壳。

## 3. 事实源声明

后续新增 Agent 能力默认只允许收敛到：

```text
App Server JSON-RPC
  -> RuntimeCore
  -> ExecutionBackend
  -> Tool / Skill / Workspace / Memory / Policy / Artifact / Evidence
  -> Permission Profile / Sandbox Manager / Approval / Audit
  -> AgentRuntime Projection
  -> Host-specific Shell
```

分类：

| 分类 | 对象 | 说明 |
| --- | --- | --- |
| `current` | `internal/prd/next/*` | Lime Next 北极星、产品目标、共享边界和验收原则。 |
| `current` | `internal/roadmap/appserver/*` | App Server current 执行路线图和协议事实源。 |
| `current target` | `lime-rs` App Server / RuntimeCore / ExecutionBackend | 跨 App 复用的服务端底座。 |
| `current target` | AgentRuntime headless projection | 把 `agentSession/event`、read model、artifact、evidence、action 投影为 UI view model。 |
| `current target` | AgentRuntime UI primitives | 可共享的 message、timeline、tool step、artifact、action、runtime status 展示组件。 |
| `current target` | Server Mode / Remote Runtime Gateway | 远期服务端运行形态；通过受控 gateway、认证、租户隔离和策略消费同一 runtime facts。 |
| `current target` | Sandbox / Permissions Control Plane | 客户端与服务端共同执行边界；permission profile、FS / network policy、approval、exec policy、audit 是主轴。 |
| `current target` | Mobile App / 微信小程序 | 端侧轻壳；只消费服务端或本地 gateway 的 projection / action / artifact，不自建 runtime。 |
| `current shell` | Claw / Lime Desktop | 旗舰 Agent 工作台和多 App 桌面壳。 |
| `current shell` | content-studio / Plugin shell | 通过 client、projection 和 UI primitives 消费 runtime 的独立业务壳。 |
| `compat` | `src/lib/api/agentRuntime/*` 旧 UI 形状投影 | 迁移期保留，只允许委托 App Server current 主链。 |
| `compat` | legacy desktop facade | 迁移期保留，只允许委托 RuntimeCore / App Server。 |
| `deprecated` | UI 组件内直接绑定 Electron / `safeInvoke` / legacy command 的 Agent 逻辑 | 只允许迁移和下线，不允许新增。 |
| `dead` | 独立 App copy Claw 整页 UI 或自建完整 Agent runtime | 不再作为 Lime 生态扩展方向。 |

## 4. 文档索引

| 文档 | 作用 |
| --- | --- |
| [background.md](./background.md) | 背景、Codex-rs 借鉴、Lime 当前问题和战略判断。 |
| [prd.md](./prd.md) | 产品目标、用户故事、范围、非目标、验收和成功指标。 |
| [architecture.md](./architecture.md) | 总体架构、分层职责、数据事实源、前后端共享边界。 |
| [sandbox-and-permissions.md](./sandbox-and-permissions.md) | Codex 架构借鉴、客户端 / 服务端 sandbox、permission profile、approval、exec policy 和平台 sandbox backend。 |
| [flowcharts.md](./flowcharts.md) | 用户路径、技术主链、UI 共享、迁移和治理流程图。 |
| [sequences.md](./sequences.md) | 初始化、Claw、Plugin、content-studio、projection、artifact/evidence 时序图。 |
| [frontend-runtime-ui-sharing.md](./frontend-runtime-ui-sharing.md) | Claw AgentRuntime UI 可共享边界、组件规范和禁止路径。 |
| [runtime-deployment-surfaces.md](./runtime-deployment-surfaces.md) | 本地 sidecar、服务端运行形态、移动 App、微信小程序和远程入口矩阵。 |
| [client-server-infrastructure.md](./client-server-infrastructure.md) | 客户端与服务端缓存、文件、数据库、对象存储、队列、密钥、观测的 ports / adapters 边界。 |
| [prototype.md](./prototype.md) / [prototype.html](./prototype.html) | Lime Next 多端产品原型、交互契约和可打开的静态可视化原型。 |
| [implementation-roadmap.md](./implementation-roadmap.md) | 分阶段实施路线、下一刀排序和完成判定。 |
| [governance-and-validation.md](./governance-and-validation.md) | current / compat / deprecated / dead 治理规则、验证入口和守卫。 |

## 5. 开发者阅读顺序

1. 先读 [background.md](./background.md)，确认为什么 Lime Next 必须服务化和组件化。
2. 再读 [prd.md](./prd.md)，确认产品目标、用户故事和非目标。
3. 实现前读 [architecture.md](./architecture.md)，确认代码应该落在哪一层。
4. 涉及工具执行、审批、网络、文件、secret、服务端 worker 或客户端本地执行时读 [sandbox-and-permissions.md](./sandbox-and-permissions.md)。
5. 涉及前端复用时读 [frontend-runtime-ui-sharing.md](./frontend-runtime-ui-sharing.md)。
6. 涉及服务端、移动 App、微信小程序或远程入口时读 [runtime-deployment-surfaces.md](./runtime-deployment-surfaces.md)。
7. 涉及缓存、文件、数据库、S3、Redis、Docker、Kubernetes、密钥或观测时读 [client-server-infrastructure.md](./client-server-infrastructure.md)。
8. 需要讨论产品界面或跨端体验时读 [prototype.md](./prototype.md)，并打开 [prototype.html](./prototype.html)。
9. 切任务时读 [implementation-roadmap.md](./implementation-roadmap.md) 和 `internal/roadmap/appserver/implementation-plan.md`。
10. 收尾前读 [governance-and-validation.md](./governance-and-validation.md)，确认验证和治理口径。

## 6. 当前主线收益

这条北极星直接推进三件事：

1. `lime-rs` 从桌面内部实现升级为跨 App、跨端、可服务端化的 Runtime 底座。
2. Claw 从单一页面升级为 Lime AgentRuntime 的旗舰体验和共享组件来源。
3. 客户端和服务端执行安全统一到 permission profile、sandbox manager、approval / escalation 与 audit，而不是散落在各端。
4. Plugins / content-studio / 移动 App / 微信小程序 / 未来独立 App 不再复制 runtime，而是复用协议、client、projection、远程 gateway 和可组合 UI。

## 7. 下一刀

下一刀不是立刻拆包，而是先把新增 AgentRuntime 前端代码按三层规范写：

```text
App Server facts
  -> headless projection / view model
  -> UI primitives
  -> Claw / Plugin / content-studio shell adapters
```

只有当第二个真实消费者开始接入共享组件时，才把内部模块物理抽成独立 npm 包。
