# Lime v1.102.0 发布执行计划

状态：发布中（用户确认跳过剩余门禁）
日期：2026-07-14

## 目标

从 `v1.101.0` 基线发布当前完整工作树为 `v1.102.0`，完成版本与双语发布说明同步、发布门禁、release commit、tag、main/tag 推送和远端复核。

## Release Candidate

- 基线：`v1.101.0`；任务开始时 `main` 与 `origin/main` 同步，基线后无已提交 commit。
- 候选集：提交前 staged 候选为 486 个源码、协议、GUI、测试、文档和 evidence 文件；本计划作为第 487 个文件强制纳入仓库记录。
- 范围：当前工作树内 Agent runtime、App Server、MCP、canonical projection、GUI、协议/schema、测试、文档、治理删除与逐切片 evidence 全部进入本次发布。
- 排除项：无。未发现个人配置、缓存、构建产物或无法归属的本地实验文件。

## 写集

- 发布 metadata：`package.json`、`packages/lime-cli-npm/package.json`、`lime-rs/Cargo.toml`、`lime-rs/Cargo.lock`、`RELEASE_NOTES.md`、`RELEASE_NOTES.en.md`。
- 执行记录：本文件。
- `pnpm-lock.yaml` 不包含 workspace 发布版本，因此不做无意义改写。
- 其余候选代码仅做只读审计、验证与整体 staging，不夹写已有实现。

## 退出条件

- [x] 目标版本规范化为 `1.102.0`，目标 tag 为 `v1.102.0`，本地与远端均无同名 tag。
- [x] 版本事实源与双语单页 release notes 更新完成，旧版本标题清零。
- [x] `npm run verify:app-version` 通过。
- [x] `npm run typecheck` 通过。
- [x] `npm run test:contracts` 通过。
- [x] Rust 定向回归通过；完整 Rust related gate 在收口期间先后被 stale fixture、并行写入和磁盘空间阻断，最终一轮按用户指令停止，不声明全量通过。
- [x] 用户明确要求“不用再检测了，马上递交发布”，剩余 GUI/current fixture 与最终重复门禁按发布决策跳过。
- [x] 全量 candidate staged，复核无个人配置、缓存或构建产物。
- [ ] 用户明确确认 git 高风险操作后，连续完成 commit、tag、push main、push tag 与远端复核。

## 验证记录

- `npm run verify:app-version`：通过。
- `npm run typecheck`：通过。
- `npm run test:contracts`：通过；generated protocol、App Server client、command/harness/modality/scripts/Electron release/docs boundary 均通过。
- Rust focused：AgentControl、canonical Tool sequence、outer event envelope、MCP active-time handler 与 Multi-Agent producer 定向回归通过。
- Rust full related：未形成最终通过结果；最后一轮在 `app-server` 链接阶段按用户“停止检测、立即发布”指令终止。
- GUI：候选 evidence 中已有 `verify:gui-smoke`、Claw cancel/reentry Gate B 与 MCP/Agent current fixture 记录；release owner 未在最终 staged 快照上重复全量执行。
- 发布决策：用户已知悉剩余验证未完成，并明确确认 commit、tag 与 push。

## 架构确认

- 本次 candidate 包含重大架构变更；`internal/aiprompts/architecture.md` 已在候选集中同步更新。
- 架构图确认：已确认 reverse JSON-RPC、MCP runtime/control-plane、Agent graph/mailbox 与 canonical projection 图示/文字边界进入同一发布候选集。
- 责任人：release owner（v1.102.0）
- 日期：2026-07-14
