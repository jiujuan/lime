# Lime v1.110.0 发布执行计划

状态：ready-for-git-confirmation
日期：2026-07-23
目标版本：`1.110.0`
目标 tag：`v1.110.0`

## 主目标

将基于 `v1.109.0` 的当前工作树改动作为单一 release candidate，完成版本事实源、双语 release notes、发布门禁、release commit、tag、main/tag 推送与远端复核。

## 当前阶段与下一刀

- 当前阶段：版本事实源、release notes、类型/协议/Rust 门禁、Agent current fixture、GUI Gate B 与治理检查已通过，候选范围已冻结。
- 下一刀：取得危险操作确认后，排除 `interrupted` 并连续执行 stage、commit、tag、main/tag 推送与远端复核。

## Release Candidate

- 基线：`v1.109.0`，当前 `main` 与 `origin/main` 指向 `88a81b278`；目标 tag 当前不存在。
- `release metadata`：根 `package.json`、`packages/lime-cli-npm/package.json`、`lime-rs/Cargo.toml`、`lime-rs/Cargo.lock`、双语 release notes、本计划与执行计划索引。
- `candidate changes`：任务开始时工作树中的 current Rust/TS/Electron、协议/schema、生成类型、GUI、脚本、治理、架构与测试改动，以及门禁需要的最小修复。
- `excluded changes`：根目录 0 字节 `interrupted` 中断残留，不删除、不纳入候选；若验证发现其它不应发布的文件，必须在提交前明确列出。

## 窄写集与避让

发布准备只写版本事实源、双语 release notes、本计划与执行计划索引；其余业务改动仅审阅、验证并纳入候选。门禁暴露缺陷时，仅修改对应 current owner 的最小写集。

## 退出条件

1. 所有版本事实源同步为 `1.110.0`，双语 release notes 仅保留当前版本单页。
2. `npm run verify:app-version` 与 `npm run typecheck` 通过。
3. 协议/Bridge/脚本变更通过 `npm run test:contracts`；Rust/runtime/provider/media 变更通过相关测试。
4. `npm run smoke:agent-runtime-current-fixture` 与 `npm run verify:gui-smoke` 通过，或记录可复现环境限制。
5. `internal/aiprompts/architecture.md` 的重大架构确认与 current/compat/dead 分类保持一致。
6. staged 集覆盖全部 candidate changes 与 release metadata，仅排除 `interrupted`。
7. 获得危险操作确认后，连续完成 `git add`、`git commit -m "Release v1.110.0"`、`git tag v1.110.0`、`git push origin main`、`git push origin v1.110.0`，并复核本地与远端 tag。

## 验证记录

- `npm run verify:app-version`：通过，根应用、CLI npm package 与 Rust workspace 均为 `1.110.0`。
- `npm run typecheck`：通过，Renderer 与 Node TypeScript 项目均无类型错误；收尾阶段已再次复跑。
- `npm run test:contracts`：通过，759 个协议类型无漂移，App Server client 296 checks 与 command/modality/scripts/Electron release/docs guard 全部通过。
- `npm run test:rust:related -- "lime-rs/Cargo.toml"`：通过，workspace lib tests 全部通过；live/网络环境用例按测试声明 ignored。
- `npm run test:rust:related -- "lime-rs/crates/thread-store/src/agent_identity.rs"`：通过，覆盖 `thread-store` 与 `agent-runtime`/`app-server`/`lime-agent`/`lime-scheduler`/`lime-server` 反向依赖；修正一处与 Codex-compatible path 校验脱节的 rebinding 测试数据后全部通过。
- `cargo test -p app-server --lib`：通过，`1483/1483`。
- Lime server provider reasoning 定向回归：通过，`1/1`，仅 raw `ReasoningContentDelta` 降低为公开 reasoning。
- `npm run smoke:agent-runtime-current-fixture`：通过，覆盖 Electron/preload/IPC/App Server、history/read model、approval、Plan、Skills、MCP、media、Coding Workbench 与 Article Editor；`liveProviderUsed=false`。
- `npm run verify:gui-smoke`：通过，实际启动 macOS Electron、preload 与 `1.110.0` App Server sidecar，壳层重载和 memory settings 证据通过。
- `npm run governance:legacy-report`：通过，扫描 2361 个文件，零引用候选、分类漂移与边界违规均为 0。
- `npm run governance:scripts`：通过，无未登记根脚本或一级脚本目录。
- `git diff --check`：通过，无空白错误。

## 架构确认

- 影响：重大。候选涉及 App Server v2 protocol、RuntimeCore、Thread/Turn/Item projection、MCP、provider/media route、Electron bridge 与 Renderer gateway。
- 架构事实源：`internal/aiprompts/architecture.md` 已记录 ThreadGoal current owner、typed request、canonical history 与 legacy objective 清理。
- 责任人：root（release owner，v1.110.0）。
- 日期：2026-07-23。
- 确认状态：已确认。`internal/aiprompts/architecture.md` 已同步 ThreadGoal current owner、typed request、canonical history/read model 与 managed-objective dead 边界；contracts、Rust related、Agent current fixture 与 GUI Gate B 均未显示第二套业务后端或 mock fallback。

## 分类与剩余限制

- `current`：Agent runtime、App Server v2 Thread/Turn/Item、ThreadGoal、typed reverse request、credential-scoped provider、MCP snapshot/lifecycle、media route、plugin current bridge。
- `compat`：仅保留显式 fail-closed 的历史兼容边界，不扩展新能力。
- `deprecated`：仍存在的旧入口只允许迁出，不承接新功能。
- `dead / deleted / forbidden-to-restore`：managed-objective、retired session/objective/media API、metadata-routed waiter 与旧 catalog/script/documentation 入口。
- 平台限制：本轮已取得 macOS 真实 Electron Gate B 证据；未执行 Windows 真机与 macOS/Windows packaged artifact 门禁。

当前 release candidate 完成度：`85%`；版本准备与发布门禁已完成，仅剩危险操作确认后的 stage/commit/tag/push 与远端复核。
