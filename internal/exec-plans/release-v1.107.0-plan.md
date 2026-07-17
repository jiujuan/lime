# Lime v1.107.0 发布执行计划

状态：validated-awaiting-git-confirmation
日期：2026-07-18
目标版本：`1.107.0`
目标 tag：`v1.107.0`

## 目标

将 `v1.106.0` 后当前工作树中的 Electron 更新链、Windows Squirrel 发布验证、Agent canonical projection、Codex 导入、Settings/Browser Runtime、首页皮肤、GUI timeline、质量脚本与治理文档改动作为单一 release candidate，完成版本事实源、双语 release notes、发布门禁、release commit、tag、main/tag 推送和远端复核。

## Release Candidate

- 基线：`v1.106.0`；任务开始时 `main`、`origin/main` 与该 tag 指向同一提交，目标 tag 在本地不存在。
- 任务开始时工作树包含 213 个已跟踪改动和 72 个未跟踪文件，共 285 个候选路径；未发现缓存、凭证、个人环境或临时产物。
- `release metadata`：`package.json`、`packages/lime-cli-npm/package.json`、`lime-rs/Cargo.toml`、`lime-rs/Cargo.lock`、`RELEASE_NOTES.md`、`RELEASE_NOTES.en.md` 与本计划。
- `candidate changes`：当前工作树全部产品、测试、脚本、schema、资源、治理和文档改动，无排除项。
- `excluded changes`：无。

## 窄写集与避让

本发布任务只新增/更新上述 release metadata 与执行记录文件，不重写其余脏工作树中的候选实现，不覆盖并行工作结果。若门禁发现产品缺陷，只在确认根因后修改对应 current owner，并把新增写集和验证记录回本计划。

## 退出条件

1. 所有版本事实源为 `1.107.0`，`npm run verify:app-version` 通过；旧版本只允许出现在 release comparison、历史计划和变更上下文。
2. 双语 release notes 采用当前版本单页，覆盖 Electron 更新、Windows Squirrel、Agent/导入 canonical projection、Settings/Browser Runtime、首页皮肤、GUI 与质量治理。
3. `npm run typecheck` 通过；按候选风险执行 `npm run test:contracts`、`npm run test:rust:changed`、`npm run smoke:agent-runtime-current-fixture` 与 `npm run verify:gui-smoke`，若环境不支持则记录原因。
4. `git diff --check` 通过；staged 集覆盖全部 release metadata 与 candidate changes，没有未说明的排除项。
5. 重大架构改动已同步 `internal/aiprompts/architecture.md`，release owner 完成架构边界复核。
6. 获得危险操作确认后，连续完成 `git add -A`、`git commit -m "Release v1.107.0"`、`git tag v1.107.0`、`git push origin main`、`git push origin v1.107.0`，并复核本地与远端 tag。

## 当前状态

- Release candidate 已冻结，纳入当前全部 285 个候选路径，无排除项。
- 版本事实源与双语 release notes 已更新，门禁待执行。
- 版本事实源、合同、Rust、Agent fixture 与 GUI smoke 门禁均已通过；Git staging、commit、tag 与 push 尚未执行，等待危险操作确认。

## 验证记录

- `npm run verify:app-version`：通过，版本事实源一致为 `1.107.0`。
- `npm run typecheck`：通过。
- `npm run test:contracts`：通过；protocol types 704 个无漂移，App Server client 291 checks，Electron host 93 commands，mock priority 0，modality/scripts/release/docs boundary 全绿。
- `npm run test:rust:changed`：通过；workspace 全量 lib tests，App Server 1183、Agent Runtime 121、Tool Runtime 247 及其余受影响 crate 全部通过；首次运行的 1 个过时顺序断言已修正并定向复测通过。
- `npm run smoke:agent-runtime-current-fixture`：通过；覆盖 Agent history/cache、Claw GUI、coding workbench、图片/媒体、approval、Inputbar queue、Plan、Skills/MCP、Expert Skills 与 Content Factory，`liveProviderUsed=false`。
- `npm run verify:gui-smoke`：通过；renderer、Desktop Host、preload、App Server sidecar、Workbench、Memory Settings 与 reload 主路径可用，报告 `appserver.v0 / 1.107.0`。
- `git diff --check`：通过。

## 架构确认

- 影响：重大。候选涉及 Electron Desktop Host/update、App Server canonical read model、Agent/Thread/Turn/Item projection、Browser Runtime 与 GUI 皮肤/设置主链。
- 架构图/文字边界：`internal/aiprompts/architecture.md` 已在候选中同步；发布 owner 需在门禁完成后复核 current 单轨边界。
- 责任人：release owner（v1.107.0）。
- 日期：2026-07-18。

当前完成度：`95%`。下一刀：最终复核 staged 摘要；获得危险操作确认后连续完成 release commit、`v1.107.0` tag、main/tag 推送与远端 tag 复核。
