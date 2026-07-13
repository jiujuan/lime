# Refactor v2 研究与施工基线

> status: research-complete / implementation-active
> owner: runtime-architecture
> started: 2026-07-12
> scope: `internal/research/refactor/v2/**`
> implementation_status: active; see `refactor-v2-implementation.md`

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
| 代码实施 | active | 实时 slice、claim、handoff、阻塞和 architecture confirmation 统一由 `refactor-v2-implementation.md` 管理 |

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

1. v2 将由多个本地进程并行实施；代码切片必须遵守窄写集、原子锁、热区避让和不可变 handoff。
2. 根 `.gitignore` 已为 v2 research 和两份 refactor-v2 执行计划增加窄例外；其他被忽略的 research/exec-plan 内容不随本轮开放。
3. Codex/OpenCode 的直接复制必须在实施切片中完成许可证、第三方依赖和编译图审计；本轮只形成 copy 清单，没有声称已复制代码。

## 下一刀

S0 事实冻结已完成。下一刀遵循 `internal/exec-plans/refactor-v2-implementation.md` 的多进程认领/锁定/交接协议启动 S1 Codex protocol/runtime copy spike；S2/S3 只允许先行只读审计。S1 未完成前不新增 Agent 业务功能、不扩展 compat、不把 v1 旧 gap 表当作任务依据。
