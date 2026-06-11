# Lime 结构重构方案中心（架构驱动版）

> 状态：proposed（v2，2026-06-11 重写）
> 适用范围：开发 Lime 源码仓库本身
> 上位规则：`AGENTS.md`（冲突时以 AGENTS.md 为准）
> v1 教训：第一版方案以"超线文件数"为核心指标，是症状驱动；本版改为机制驱动

本目录是「让代码结构回归可控」这条长任务的事实源。

## 核心判断：行数是症状，膨胀机制才是病

仓库确实有 233 个文件超过 1000 行红线，但逐个拆文件是低杠杆动作——只要"新功能默认落进中心文件"的机制还在，拆完还会长回来。2026-06-11 的架构证据扫描（见 `architecture-debt-analysis.md`）定位了五个真正的膨胀机制：

| 轴 | 膨胀机制 | 一句话证据 |
|---|---|---|
| **A 协议链路靠人肉同步** | 新增 1 个 JSON-RPC 方法要手改约 10 个文件，TS 侧 `protocol.ts`（3600 行）纯手写 | 本轮 `project_git` 新增 4 个方法，git status 触碰 protocol crate 4 文件 + runtime + processor + services + client 2 文件 + 前端网关 |
| **B App Server 双中心 Facade** | 所有方法都堆进 `processor.rs` 单一 impl（238 个 `handle_*`）和 `runtime.rs` 单一 `impl RuntimeCore`（521 个 fn） | 两文件合计 1.3 万行，且每个新功能必然使其变大 |
| **C 前端分层倒置、无依赖方向守卫** | `lib/`（基础层）反向 import `components/`、`features/`（≥6 处实证）；组件状态无分层，`AgentChatWorkspace.tsx` 52 个 useState | 没有任何机械约束阻止下一次违例 |
| **D 后端调用网关叠床架屋** | `lib/api/`、`lib/dev-bridge/`、`lib/agentRuntime/`、`packages/app-server-client` 四套封装并存，同一能力多条路径 | 媒体任务预览走 dev-bridge、其余走 lib/api |
| **E core/services 垃圾抽屉化** | `lime-core` 被 11+ crate 依赖且装着 config/models/database/plugin；`services` 32 个 service 平铺；模型注册类型在 core 与 services 重复定义 | 与 Codex 仓库"resist adding to core"问题同构 |

行数债（233 个超线文件）是这五个机制的**输出**。所以顺序必须是：先关掉水龙头（消除机制），再拖地（拆存量文件）。

## 核心策略

1. **先机制后症状**——A/B/C 三轴消除"新代码默认进中心文件"的路径，存量拆分（原 P2）降级为各轴的副产品。
2. **守卫先于重构**——每一轴先上机械守卫（codegen 校验、import 边界 lint、体量棘轮），把方向锁死，再动代码；守卫复用项目既有模式（`governance:scripts` baseline 模式、`test:contracts`）。
3. **每刀说得出消除了什么机制**——任何条目动手前必须能回答"完成后哪类新代码不再流向旧位置"；说不出来的是症状打磨，延后。

## 文档索引

- **架构债证据底座**（五轴实证，结论可复查）：`architecture-debt-analysis.md`
- **执行计划**（按机制杠杆排序的 R-xx 队列）：`progressive-refactor-plan.md`
- **未来代码结构指引**（北极星目标结构 + 新代码落点决策表 + T1/T2/T3 中长期规划）：`directory-architecture-blueprint.md`
- **文件体量棘轮守卫规格**（轴 F 护栏的实现契约）：`file-size-ratchet-guard-spec.md`
- **Codex 工程模式借鉴**（五轴对照：协议 ts-rs 生成链、domain processor、抗膨胀，含抄什么/避什么结论）：`codex-engineering-patterns.md`

## 进度速览

| 轴 | 内容 | 状态 |
|---|---|---|
| P0 依赖事实源 | R-01 锁文件统一到 pnpm | **基本完成**（package-lock.json 已删、`packageManager` 已补，待干净安装验证收尾） |
| 轴 A 协议链路自动化 | R-10 protocol.ts 代码生成 | proposed |
| 轴 B App Server 去中心化 | R-20 handler 按 domain 注册 | proposed |
| 轴 C 前端分层矫正 | R-30 import 边界守卫 → R-31 修违例 → R-32 状态分层拆分 | proposed |
| 轴 D 网关收敛 | R-40 lib/api 唯一网关 | proposed（与 CCD-012 协同） |
| 轴 E crate 抗膨胀 | R-50 抗膨胀规则 + 重复定义归并 | proposed |
| 轴 F 体量护栏 | R-60 文件体量棘轮（原 R-02，降级为支撑项） | proposed |

## 执行纪律

1. 每刀对应 `progressive-refactor-plan.md` 一个 `R-xx`，动手前更新状态、收尾补进度日志。
2. 排序按 `AGENTS.md` 执行规则 3：选对整体完成度提升最大的，不挑顺手的。
3. 拆分前先抽纯逻辑到 `*.unit.test.ts` / 子模块单测兜底（硬规则 9/12），测试随代码迁移。
4. 用户可见文案五语言同步（硬规则 10）；协议改动四侧同步 + `test:contracts`（硬规则 3）。
5. 收尾给「本轮完成度 X%」+「整体目标完成度 Y%」（执行规则 13），口径见执行计划。
6. 长期残留回挂 `internal/exec-plans/tech-debt-tracker.md`（dev-bridge 相关统一挂 CCD-012）。
