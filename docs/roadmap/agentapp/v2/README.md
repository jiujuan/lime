# Agent App v2 路线图

更新时间：2026-05-18

## 定位

v2 聚焦 **独立安装与 Runtime 底座拆分**：Agent App 是用户直接感知的产品，Lime Runtime 是受治理的能力底座，Lime Desktop 是多 App 工作台，Lime App Shell 是单 App 独立安装壳。

本目录只承载 Lime Desktop / Lime 客户端侧 v2 规划，不承载 Agent App 标准仓库的规范文本，也不承载 Lime Cloud / LimeCore 服务端实现计划。

## 文档索引

| 文档 | 用途 |
| --- | --- |
| [`prd.md`](./prd.md) | v2 产品需求文档，定义目标、范围、用户路径、能力边界、里程碑和验收标准。 |
| [`architecture.md`](./architecture.md) | v2 模块化架构、隔离模型、依赖方向、扩展升级策略和设计模式约束。 |
| [`interface-contracts.md`](./interface-contracts.md) | v2 接口契约、port 设计、扩展升级剧本、隔离平面和 stable error 约束。 |
| [`code-plan.md`](./code-plan.md) | v2 代码落地规划、目录演进、ports、services、测试与 DoD。 |
| [`implementation-plan.md`](./implementation-plan.md) | v2 可执行开发切片、文件级写集、验收、测试命令和 PR 切分建议。 |
| [`completion-audit.md`](./completion-audit.md) | 当前目标完成度审计，把用户要求逐项映射到代码、文档、命令和 evidence。 |

## 当前决策

- 用户不应为了使用某个 Agent App 被迫下载完整 Lime Desktop。
- 独立安装不是绕过治理；Standalone / Runtime-backed App 仍必须通过 `@lime/app-sdk` 与 `lime.*` capability 调用 Lime Runtime。
- Lime Desktop 继续作为 App Center、开发调试、团队工作台和多 App 管理入口。
- v2 不把业务 App 写进 Lime Core；内容工厂仅作为首个 dogfood App。
- 源码不新增 `agent-app-v2` 平级运行时；只在 current Agent App 模块补 install-mode、runtime-profile、shell 和 packaging seam。
- 模块化、扩展升级、隔离和解耦以 [`interface-contracts.md`](./interface-contracts.md) 为开发契约；代码执行顺序以 [`implementation-plan.md`](./implementation-plan.md) 为准。
- macOS standalone App 必须使用独立 Bundle ID / App ID；Lime 官方分发可复用同一 Team 的 Developer ID Application 证书，不能复用 Lime Desktop 的 Bundle ID。

## 四个硬目标

| 目标 | 开发含义 | 不合格信号 |
| --- | --- | --- |
| 模块化 | 代码必须按 Contract、Domain、Application Service、Port、Adapter、Presentation 分层；每层只暴露少量 public API。 | UI 直接解析 manifest、拼 descriptor、读 Tauri payload，或 domain 依赖 shell 实现。 |
| 可扩展升级 | 新 manifest 版本走 normalizer，新 install mode 走 strategy，新 shell 走 adapter，新 capability 走 catalog / dispatcher。 | 在 UI、runtime、Tauri command 中横向堆 `if mode/version/shellKind`。 |
| 隔离 | App package 只读，用户数据命名空间隔离，secrets 只传 ref，工具副作用和 evidence 只由 Runtime 处理。 | App 能拿到 host path、secret 明文、provider key，或 Shell 复制 tool / model / evidence service。 |
| 解耦 | Agent App 只依赖 `@lime/app-sdk`，Shell 只依赖 Runtime ports，Desktop 只是其中一个 Host adapter。 | 为 standalone 新建第二套 Runtime，或让业务 App import Lime Desktop internals。 |

这四个目标是 v2 后续开发的架构门禁：任何功能如果无法说明落在哪个模块、通过哪个扩展槽升级、跨过了哪些隔离边界、依赖了哪个 port，就不应进入实现。


## 开发者阅读顺序

1. 先读 [`prd.md`](./prd.md) 确认产品目标：Agent App 独立安装，但能力仍由 Lime Runtime 治理。
2. 再读 [`architecture.md`](./architecture.md) 的模块 DAG、可替换宿主拓扑、隔离模型和扩展升级分层。
3. 实现前对照 [`interface-contracts.md`](./interface-contracts.md) 的 port、strategy、stable error 和隔离平面。
4. 改代码时按 [`code-plan.md`](./code-plan.md) 的目录、模块契约、import 边界和结构扫描执行。
5. 切任务时以 [`implementation-plan.md`](./implementation-plan.md) 的 P0-P5 写集和验收命令为准。
6. 判断目标是否完成时，以 [`completion-audit.md`](./completion-audit.md) 的 checklist 为准，不用单个 smoke 或 summary 替代发布级审计。

## 主线收益

这条路线直接提升 Agent App 主线完成度：它把现有“安装到 Lime 的 App”升级为“可以独立成为产品的软件”，同时复用已完成的 projection、readiness、Capability SDK、Host Bridge、Artifact / Evidence 和权限治理。
