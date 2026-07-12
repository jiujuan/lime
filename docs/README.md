# docs

## 目录定位

`docs/` 是 Lime 的文档站包，只承载对外文档站页面、站点配置和站点资源。

内部工程事实源已经迁移到 `../internal/`。Agent 协作规则、执行计划、路线图、测试策略、研究资料、PRD、技术专题和私有运营材料都不再放在本目录。

## 当前边界

`docs/` 只允许保留以下类型内容：

- `content/`：Nuxt Content / Docus 文档站页面
- `images/`：文档站图片资源
- `index.md`、`specification.md`、`ops.md`：文档站顶层页面
- `app.config.ts`、`nuxt.config.ts`、`package.json`、`package-lock.json`：文档站配置与依赖锁定
- `README.md`：本文档站包说明

不要在 `docs/` 新增内部工程目录。需要记录工程事实源时，使用 `../internal/README.md` 和对应子目录。

## 内部入口

- 仓库级 Agent 规则：`../AGENTS.md`
- 内部事实源总入口：`../internal/README.md`
- 模块级工程导航：`../internal/aiprompts/README.md`
- 全局架构图：`../internal/aiprompts/architecture.md`
- 执行计划：`../internal/exec-plans/`
- 路线图：`../internal/roadmap/`
- 测试与质量资料：`../internal/test/`、`../internal/tests/`、`../internal/testing/`
- 研究、PRD、技术专题：`../internal/research/`、`../internal/prd/`、`../internal/tech/`
- Electron 打包 / 发布 / updater 规则：`../AGENTS.md`、`../internal/aiprompts/quality-workflow.md`、`../internal/roadmap/appserver/release-updater.md`；current 打包事实源是 `forge.config.mjs` 与 Electron Forge。
- Rust 迁移 / command 清理规则：`../AGENTS.md`、`../internal/aiprompts/commands.md`、`../internal/aiprompts/governance.md`、`../internal/aiprompts/quality-workflow.md`、`../internal/roadmap/appserver/README.md`；`lime-rs/src/**` 旧主 crate / legacy facade / 迁移来源目录已于 `2026-06-10` 物理删除，当前 Rust 事实源是 `lime-rs/crates/**` 与 Electron Desktop Host 壳能力。不得恢复 `lime-rs/src/**`、`lime-rs/src/commands/**`、旧 Tauri wrapper、fail-closed stub、tombstone 或 thin facade；历史路径只允许作为 retired guard、执行计划证据或 git history 参考。非生成代码接近 `800` 行进入拆分预警，超过 `1000` 行时必须按最佳实践拆分，或登记无法拆分的 blocker、风险和退出条件。
- Codex-first Agent 删除边界：`../AGENTS.md`、`../internal/aiprompts/governance.md`；已退役 runtime 的 vendor、workspace crate、迁移目录与专用 skill 已删除且禁止恢复。能力缺口只可参考 `/Users/coso/Documents/dev/rust/codex` 在 Lime current owner 重建并接入真实 App Server / 前端 / Evidence 主链，不得恢复旧依赖、catalog、文档入口或 fallback。
- 复核 / 判死快速口径：`../AGENTS.md`、`../internal/aiprompts/governance.md`、`../internal/aiprompts/commands.md`、`../internal/aiprompts/quality-workflow.md`；用户只问结论时先给短结论，不自动扩展成全量治理、命令 inventory 或质量矩阵。目录级旧实现满足脱离构建图、已删除、有 current owner、守卫防回流时，可直接判 `dead / deleted / forbidden-to-restore`，历史 checkpoint 默认只作 evidence。
- 前端 DevBridge 治理规则：`../AGENTS.md`、`../internal/aiprompts/commands.md`、`../internal/aiprompts/governance.md`、`../internal/exec-plans/tech-debt-tracker.md`；`src/lib/dev-bridge/**` 不是旧 Rust DevBridge 的整体删除对象，`safeInvoke`、HTTP client、`app_server_handle_json_lines` 和 bridge availability 是 current renderer bridge，旧命令 policy / mock fallback 才是后续治理对象。跨命令组长期 residual 必须回挂 `CCD-012`，不能只留在聊天、handoff 或临时计划备注。

## 维护规则

1. 更新文档站页面时，优先改 `content/` 或顶层站点页面。
2. 更新工程规则、执行计划、路线图、测试策略或私有材料时，必须落到 `../internal/`。
3. 新增内部事实源目录前，先同步更新 `../internal/README.md`。
4. 文档站边界由根仓库 `npm run docs:boundary` 检查。
