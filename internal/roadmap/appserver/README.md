# App Server 路线图

> 状态：current planning source
> 更新时间：2026-06-04
> Owner：Lime Runtime / App Server / 独立 App 集成

## 1. 定位

本目录定义 App Server 的产品、架构、协议和迁移路线。

App Server 是 Lime AI Agent Runtime 的服务化边界。它不是把现有 `aster_agent_cmd` 原样包一层，而是先把可复用公共部分抽成 host-agnostic `RuntimeCore`，再把 Aster、未来更多执行后端、桌面壳和独立 App 都接到这条公共服务层上。

目标形态：

```text
Lime Desktop
Content Studio
更多独立 App
  -> App Server Client
  -> App Server
  -> Lime RuntimeCore
  -> ExecutionBackend Adapter
  -> Tool / Skill / Workspace / Artifact / Evidence / Policy
```

## 2. 事实源声明

从本路线图起，跨 App 的 Agent 执行能力只允许向下面的事实源收敛：

```text
App Server + JSON-RPC Protocol + RuntimeCore + ExecutionBackend Adapters
```

分类：

| 分类 | 对象 | 说明 |
| --- | --- | --- |
| `current` | `internal/roadmap/appserver/*` | App Server 路线图、PRD、架构和协议规划。 |
| `current target` | `RuntimeCore` | 跨 App、跨执行后端复用的公共 runtime service 层。 |
| `current target` | `ExecutionBackend` | Aster 和未来更多执行后端的适配接口。 |
| `current reference` | `lime-rs/crates/agent` | 当前最接近 runtime core 的 crate，后续继续拆公共模型与服务。 |
| `current reference` | `lime-rs/src/commands/aster_agent_cmd/runtime_turn.rs` 及相邻 service 逻辑 | Aster backend 的现有实现参考；不能继续被当作公共 runtime core。 |
| `current client` | Lime Desktop / content-studio / 更多独立 App 的 app-server client | 独立 App 只通过协议消费 runtime，不直接 import Lime 内部实现。 |
| `compat` | Tauri command 层 | 迁移期继续服务 Lime Desktop，但只能委托 App Server service，不继续拥有独立 runtime 事实。 |
| `deprecated` | 壳层内直接拼接 runtime 业务逻辑 | 只允许迁移和下线，不允许新增能力。 |
| `dead` | 新独立 App 自建完整 Agent runtime | 不再作为 Lime 生态扩展方向。 |

## 3. 文档索引

| 文档 | 作用 |
| --- | --- |
| [prd.md](./prd.md) | 产品目标、用户故事、非目标、验收口径。 |
| [architecture.md](./architecture.md) | App Server 总体架构、分层、事实源、服务抽象和部署形态。 |
| [protocol.md](./protocol.md) | JSON-RPC 协议、方法命名、对象模型、事件和错误规范。 |
| [service-extraction.md](./service-extraction.md) | 从现有 Lime runtime 抽服务的边界、迁移映射和退场条件。 |
| [consumer-integration.md](./consumer-integration.md) | content-studio 和未来独立 App 如何消费 App Server、TS client、sidecar binary 与 release manifest。 |
| [frontend-electron-migration.md](./frontend-electron-migration.md) | Lime 前端从 Tauri webview 切换到 Electron 的边界、改动点、阶段顺序与验收口径。 |
| [sequences.md](./sequences.md) | 初始化、会话、工具审批、事件流、独立 App 集成等时序图。 |
| [flowcharts.md](./flowcharts.md) | 从用户输入到 runtime 执行、服务抽取、迁移替换和多 App 复用流程图。 |
| [implementation-plan.md](./implementation-plan.md) | 分阶段实施计划、退出条件、验证和治理守卫。 |

## 4. 主目标

1. 把 Lime 的 AI Agent Rust runtime 抽成可复用本地 app-server。
2. 为 Lime Desktop 和独立 App 提供统一 JSON-RPC 服务边界。
3. 让 content-studio 成为第一批复用方，但不把方案绑定到单一 App。
4. 逐步把 Tauri command glue 退回 thin adapter。
5. 统一 session / thread / turn / task / tool / action / artifact / evidence facts。
6. 让未来 App 只接入 App Server Client 和 Capability SDK，不复制 runtime 逻辑。
7. 让 Aster 作为第一个 `ExecutionBackend` 接入，为后续更多执行后端留出清晰接口。

## 5. 非目标

本路线图不做：

1. 不重写 Lime Desktop 壳层。
2. 不把 App Server 设计成云端多租户服务。
3. 不让独立 App 直接调用 Lime 内部 Rust 模块。
4. 不新增第二套 tool runtime、skill runtime、workspace runtime。
5. 不在 App 侧用 UI-only state 模拟 Agent 执行成功。
6. 不一次性迁完所有 Tauri commands；先迁 Agent runtime 主链。
7. 不把 `Aster`、`runtime_turn.rs` 或 Tauri command DTO 直接定义成公共协议。

## 6. 当前执行顺序

```text
P0 路线图与公共边界冻结
-> P1 Codex-style app-server crate 家族骨架
-> P2 RuntimeCore / ExecutionBackend 接口
-> P3 AsterBackend adapter
-> P4 App Server 接入 RuntimeCore
-> P5 Lime Desktop command thin adapter
-> P6 content-studio app-server client
-> P7 Tool / Action / Artifact / Evidence 事件闭环
-> P8 多独立 App 复用和能力发现
-> P9 Tauri runtime glue 退场审计
```

## 7. 下一刀

下一刀固定为：

**先建立 Codex-style app-server crate 家族和公共 runtime 边界，不先把 Aster 直接塞进协议。**

原因：

1. crate 边界先稳定，后续公共代码才不会继续散在壳层。
2. `RuntimeCore / ExecutionBackend` 先定义清楚，Aster 才能作为 adapter 接入，而不是绑死公共层。
3. 协议只暴露 session / turn / event / action / artifact / evidence 等稳定事实，不暴露具体 backend。
4. 完整 tool / artifact / evidence 迁移应跟随 runtime core facts，而不是先做壳层包装。
