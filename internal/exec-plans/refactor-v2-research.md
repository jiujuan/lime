# Refactor v2 研究与施工基线

> status: research-complete / implementation-pending
> owner: runtime-architecture
> started: 2026-07-12
> scope: `internal/research/refactor/v2/**`
> implementation_status: not started

## 主目标

基于 Codex `5c19155cbd93bfa099016e7487259f61669823ff` 和 OpenCode `9976269ab1accfc9f9dc98a4a688c516934de422`，生成第二轮 Lime 重构基线。v2 面向研发期清场：Codex 可直接复制的 runtime/protocol/test 能力优先复制，OpenCode 只参照 provider/multimodal 和 package/module ownership，旧入口在迁移后直接删除，不建立新的兼容双轨。

## 本轮写集

- 新建 `internal/research/refactor/v2/**` 文档集。
- 新建本执行计划。
- 只读审计 `/Users/coso/Documents/dev/rust/codex`、`/Users/coso/Documents/dev/js/opencode` 和 Lime current 工作树。
- 不修改 `v1`、Rust runtime、App Server、Electron、Renderer 热区，不提交、不推送、不创建分支。

## 阶段

| 阶段 | 状态 | 退出条件 |
| --- | --- | --- |
| 事实冻结 | completed | source commit、路径证据、体量和 v1 过期项已写入 v2 snapshot |
| 参考对照 | completed | Codex copy/adapt/reject 与 OpenCode module/provider allowlist 已有路径证据 |
| 目标架构 | completed | GUI-specific chain、owner、失败/恢复分支和删除原则已写入 v2 |
| 施工计划 | completed | S0-S7 有窄写集、验证、删除证明和依赖顺序 |
| 代码实施 | pending | 按 S1 起逐切片执行，另开代码变更集并更新 architecture confirmation |

## 验证

本轮已执行的只读检查：

```text
git -C /Users/coso/Documents/dev/rust/codex rev-parse HEAD
git -C /Users/coso/Documents/dev/js/opencode rev-parse HEAD
wc -l <关键 Lime 文件>
npm run governance:legacy-report
```

治理报告快照：扫描 2418 文件、1439 测试文件、1125 Rust 文件、112 Rust 测试文件；零引用候选 0、分类漂移候选 0、边界违规 0。该结果只能证明当前治理扫描状态，不能替代 v2 代码切片的 runtime/GUI 证据。

## 风险与阻塞

1. Lime 工作树有大量并行改动，代码切片必须遵守窄写集和热区避让。
2. `internal/research/**` 被根 `.gitignore` 忽略；本轮文件已写入工作树，但纳入版本控制时需要由仓库维护者决定是否增加 v2 例外或显式跟踪，当前不擅自改动用户的 `.gitignore`。
3. Codex/OpenCode 的直接复制必须在实施切片中完成许可证、第三方依赖和编译图审计；本轮只形成 copy 清单，没有声称已复制代码。

## 下一刀

执行 `internal/research/refactor/v2/12-plan/slices.md` 的 S0 事实冻结，然后以 S1 做 Codex protocol/runtime copy spike。S1 未完成前不新增 Agent 业务功能、不扩展 compat、不把 v1 旧 gap 表当作任务依据。
