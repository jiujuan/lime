# Lime v1.103.0 发布执行计划

状态：release-ready / gates-passed / publication-authorized
日期：2026-07-15
目标版本：`1.103.0`
目标 tag：`v1.103.0`

## 目标

将 `v1.102.0` 后当前工作树中的 Refactor V2 Agent 主链收口作为单一 release candidate，完成版本事实源、双语 release notes、发布门禁、release commit、tag、main/tag 推送和远端复核。

## Release Candidate

- `release metadata`：`package.json`、`packages/lime-cli-npm/package.json`、`lime-rs/Cargo.toml`、`lime-rs/Cargo.lock`、`RELEASE_NOTES.md`、`RELEASE_NOTES.en.md`、`.gitignore`、本计划。
- `candidate changes`：candidate freeze 时工作树中的 382 个修改、29 个删除和 97 个未跟踪源码、测试、schema、文档与 evidence 路径，共 508 个候选路径；全部围绕 canonical Thread/Turn/Item、AgentControl/SubAgent、Agent Chat current owner、App Server owner 拆分和 S7 gate refinement。
- `excluded changes`：candidate freeze 之后由并行 owner 新启动的 S7y Approval cold/live typed response 与 S5 compat residual 增量不进入 `v1.103.0`，保留为下一版本工作树；它们不属于已冻结并完成门禁的 508 个候选路径。

## 窄写集与避让

本发布任务修改 release metadata，并在候选 owner 释放后补齐 S2n/S7x evidence、中央计划状态、history Electron oracle readiness regression 与两处 docs boundary 文案。其余 Electron、App Server、Renderer、协议、测试和 roadmap 候选文件只读核对并原样纳入，不扩大发布收口写集。

## 退出条件

1. S2m、S2n 与 S7x closeout 形成 evidence / handoff，候选集连续稳定且没有活跃测试写入。
2. 所有版本事实源为 `1.103.0`，`npm run verify:app-version` 通过，旧版本只允许出现在 release comparison 和历史文档上下文。
3. `npm run typecheck` 通过；协议、Rust 与 GUI 风险按当前变更补足 `npm run test:contracts`、定向 Rust 验证和 `npm run verify:gui-smoke`。
4. `git diff --check` 通过；staged 集覆盖全部 release metadata 与 candidate changes，且没有未说明的排除项。
5. 获得危险操作确认后，连续完成 `git commit`、`git tag v1.103.0`、`git push origin main`、`git push origin v1.103.0`，并复核本地与远端 tag。

## 当前状态

- S2m/S2n conversation import Plan 与 Message lifecycle 已完成 focused 验证并形成 evidence；本地 owner 进入 released。
- S7x focused 55/55 与 reasoning-first Gate B 通过；history replay oracle readiness race 已修复，原始 Electron fixture 复跑通过。
- 两处 docs boundary 旧引用已修正为 `internal/roadmap guard`。
- candidate 已冻结且没有未说明排除项；最终 aggregate gates 全部通过，发布写操作已获用户授权。
- 发布 cutoff 以已验证的 staged index 为准；冻结后新启动的 S7y/S5 工作保持 unstaged，不中断、不覆盖，也不改变本版本 tag 内容。

## 验证记录

- `npm run verify:app-version`：通过，版本一致为 `1.103.0`。
- `npm run typecheck`：通过。
- `npm run test:contracts`：通过；protocol types 698/0 drift、App Server client 288 checks、command、Harness、modality、scripts、Electron release workflow、cleanup 与 docs boundary 全部通过。
- S2m focused Rust：2/2；shared related App Server：1097/1097。
- S2n focused Rust：2/2；exact rustfmt 与 narrow diff check 通过。
- S7x focused Vitest：4 files / 55 tests；ESLint、Prettier、diff 与 reasoning-first Gate B 通过。
- history replay Electron fixture：`ok=true`、reasoning summary 1、image attachments 2、MCP tool rows 1、console errors 0。
- `npm run verify:gui-smoke`：通过；Renderer、Electron host/preload、真实 App Server sidecar `1.103.0`、Claw workbench 与 settings 主路径就绪。
- `git diff --check`：通过。

## 架构确认

本发布任务本身不改变架构；candidate 的重大架构切片已在 `internal/aiprompts/architecture.md` 与 `internal/exec-plans/refactor-v2-implementation.md` 逐项确认。发布门禁只引用这些既有确认，不新增第二套 owner、compat 或 fallback。

当前完成度：`90%`。下一刀：复核 staged candidate 后执行 release commit、tag、main/tag push 与远端校验。
