# Lime 插件路线图

更新时间：2026-06-27
状态：Skeleton Implemented / Productization In Progress

## 1. 定位

Lime 的一级产品概念统一为 **插件**。插件负责安装、授权、发布、启用与分发；`工作台应用` 只作为插件中的一种能力形态，表示“带独立 UI 的工作台应用”。

```text
插件 = 分发与授权根对象
工作台应用 = 插件子类型
Right Surface = Host 管理的产物渲染工作区
```

这条路线参考上游插件与市场模型：插件使用 `<plugin>@<marketplace>` 稳定 ID，marketplace 下发 manifest 摘要、安装策略和认证策略，用户通过显式选择或 `@` 调用，而不是靠语义猜测。

服务端 marketplace 事实源在 LimeCore：

```text
LimeCore 外仓 plugin roadmap / control-plane 文档
GET /api/v1/public/tenants/{tenantId}/client/plugins/marketplace
```

Lime Desktop 只负责本地安装态、显式激活、Right Surface 渲染和 App Server prompt context；不在 Lime App Server 内新增 marketplace 服务端。

## 2. 文档索引

| 文档                                                                                                   | 用途                                                                           |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [`prd.md`](./prd.md)                                                                                   | 插件产品定义、背景、用户路径、需求、里程碑和验收。                             |
| [`architecture.md`](./architecture.md)                                                                 | 插件/工作台应用/Renderer/Claw/Right Surface 的分层架构。                       |
| [`technical-baseline.md`](./technical-baseline.md)                                                     | 插件运行的宿主基线、承载方式、current / deprecated / dead 分类。               |
| [`interface-contracts.md`](./interface-contracts.md)                                                   | 插件 manifest、激活上下文、renderer contract、surface action contract。        |
| [`implementation-plan.md`](./implementation-plan.md)                                                   | 插件中心、composer 激活、renderer host、迁移收口的实施顺序。                   |
| [`../../tech/plugin/README.md`](../../tech/plugin/README.md)                                           | Lime Plugin Package v1 技术标准：`plugin.json`、runtime/workbench、skills、worker 和验证口径。 |
| [`history-product-workspace.md`](./history-product-workspace.md)                                       | 历史对话、插件上下文和产物 tab 的恢复规则。                                    |
| [`user-operations-guide.md`](./user-operations-guide.md)                                               | 插件中心消费、授权、本地安装态、显式激活、Right Surface 和运营排查指南。       |
| [`e2e-evidence.md`](./e2e-evidence.md)                                                                 | 第二轮跨仓端到端证据包，串联 LimeCore 发布 / 审计与 Lime Desktop GUI fixture。 |
| [`evidence/plugin-productization-e2e-summary.json`](./evidence/plugin-productization-e2e-summary.json) | 本轮桌面 GUI fixture 的版本化精简 summary。                                    |
| [`prototype.html`](./prototype.html)                                                                   | 可直接打开的静态 HTML 原型。                                                   |
| [`prototype.md`](./prototype.md)                                                                       | 插件中心、插件详情、激活 strip、右侧 dock 的低保真原型。                       |

## 2.1 图表索引

| 图表                   | 位置                                                                      | 用途                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 跨仓职责图             | [`architecture.md`](./architecture.md#31-跨仓职责图)                      | 固定 LimeCore marketplace、Lime Desktop、本地 registry、App Server prompt context 与 Right Surface 的职责边界。 |
| 分层架构图             | [`architecture.md`](./architecture.md#4-分层架构)                         | 固定 Plugin Contract、Runtime、Session Plugin Workspace、Right Surface 的分层。                                 |
| 显式激活时序图         | [`architecture.md`](./architecture.md#显式激活时序图)                     | 描述 `@plugin` 从 composer 到 App Server prompt context 的时序。                                                |
| Marketplace 消费流程图 | [`architecture.md`](./architecture.md#marketplace-消费流程图)             | 描述客户端拉取 LimeCore marketplace、合并本地安装态和构造 activation metadata。                                 |
| 历史恢复拓扑           | [`architecture.md`](./architecture.md#8-历史恢复拓扑)                     | 描述历史会话、plugin workspace 和 Right Surface 恢复关系。                                                      |
| Surface Action 回流图  | [`architecture.md`](./architecture.md#9-surface-action-回流)              | 固定右侧 action 必须回流 runtime，不直连 provider 或文件系统。                                                  |
| 开发切片总览           | [`implementation-plan.md`](./implementation-plan.md#2-开发切片总览)       | 跟踪从文档 contract 到内容工厂 dogfood 的实施顺序。                                                             |
| 客户端消费流程图       | [`user-operations-guide.md`](./user-operations-guide.md#3-端到端消费流程) | 描述插件中心拉取、合并本地 registry、安装、上报和显式激活。                                                     |
| 显式激活时序图         | [`user-operations-guide.md`](./user-operations-guide.md#4-用户路径)       | 描述 `@插件` 从 UI 到 App Server current 运行链的时序。                                                         |
| 安装态与审计流程图     | [`user-operations-guide.md`](./user-operations-guide.md#7-安装态与审计)   | 描述本地 installed registry 与 LimeCore 审计之间的边界。                                                        |
| 跨仓证据流程图         | [`e2e-evidence.md`](./e2e-evidence.md#2-跨仓证据流程图)                   | 描述平台发布、客户端消费、安装态报告、显式激活、Right Surface 和审计证据。                                      |

## 3. 当前决策

| 决策               | 口径                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 根对象             | 插件是用户侧可安装、可授权、可发布的根对象。                                                                                                            |
| Marketplace 服务端 | `current` 在 LimeCore control-plane，不在 Lime App Server。                                                                                             |
| 工作台应用         | 降级为插件迁移输入 / 插件内独立 UI 能力；不再作为插件 marketplace 的设计模板。                                                                          |
| 右侧渲染           | Right Surface 继续作为 Host 的唯一物理右栏，插件只提供数据模型、视图与 action。                                                                         |
| 激活方式           | 不再在每次发送消息时全量读取插件列表做语义猜测；激活必须显式。                                                                                          |
| Renderer 输出合同  | manifest / marketplace summary 可以声明 `outputArtifactKind`、`paneKind` 和 action，但 runtime 当前只接管内容工厂 workspace patch，不开放任意插件执行。 |
| 内容工厂           | 内容工厂应作为插件重建，而不是复用旧 `旧内容工作台` 代码。                                                                                              |
| 现有路线上下文     | 现有 `rightsurface` 负责统一右侧 dock；plugin 路线只定义该 dock 如何承载插件产物。                                                                      |
| 旧插件中心命令     | 历史插件中心命令族继续按 `dead` 处理，不恢复为生产入口。                                                                                               |
| `@` 命令边界       | 平台 `@` 原子命令仍以 `SkillCatalog.entries.kind=command` 为事实源；插件只可贡献显式 activation command entry，并通过 `agentSession/turn/start` metadata 进入 current 主链。 |

## 4. 与现有路线图关系

| 路线图                                                                 | 关系                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`internal/roadmap/rightsurface/README.md`](../rightsurface/README.md) | 定义唯一右侧 dock、多 tab 和 pane 状态机；plugin 路线复用这层宿主。 |
| [`internal/roadmap/workbench/v4/README.md`](../workbench/v4/README.md) | 定义 工作台应用 在插件体系里的位置，以及内容工厂的工作台形态。      |
| [`internal/roadmap/workbench/v3/README.md`](../workbench/v3/README.md) | 作为历史参考，帮助理解从 Workbench Profile 过渡到插件分层的原因。   |

## 5. 开发者阅读顺序

1. 先读 [`prd.md`](./prd.md)。
2. 再读 [`architecture.md`](./architecture.md)。
3. 然后读 [`technical-baseline.md`](./technical-baseline.md) 了解宿主边界。
4. 对照 [`interface-contracts.md`](./interface-contracts.md) 固定 contract。
5. 落包结构、skills、worker 或 workbench 时，回到 [`../../tech/plugin/README.md`](../../tech/plugin/README.md) 作为技术事实源。
6. 按 [`implementation-plan.md`](./implementation-plan.md) 分阶段落地。
