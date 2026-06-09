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
- 执行计划：`../internal/exec-plans/`
- 路线图：`../internal/roadmap/`
- 测试与质量资料：`../internal/test/`、`../internal/tests/`、`../internal/testing/`
- 研究、PRD、技术专题：`../internal/research/`、`../internal/prd/`、`../internal/tech/`
- Electron 打包 / 发布 / updater 规则：`../AGENTS.md`、`../internal/aiprompts/quality-workflow.md`、`../internal/roadmap/appserver/release-updater.md`；current 打包事实源是 `forge.config.mjs` 与 Electron Forge。
- Rust command 清理规则：`../AGENTS.md`、`../internal/aiprompts/commands.md`、`../internal/roadmap/appserver/README.md`；`lime-rs/src/commands/**` 是旧 Tauri wrapper 清理区，不再承接新的业务逻辑、API adapter、runtime 分支、领域服务实现、compat wrapper 或退场 stub。新增 Rust 后端能力进入 App Server / RuntimeCore / services，桌面壳能力进入 Electron Desktop Host；旧 wrapper 删不动只能登记 blocker，不能保留 fail-closed stub、tombstone 或 thin facade 当完成态。
- 前端 DevBridge 治理规则：`../AGENTS.md`、`../internal/aiprompts/commands.md`、`../internal/aiprompts/governance.md`、`../internal/exec-plans/tech-debt-tracker.md`；`src/lib/dev-bridge/**` 不是旧 Rust DevBridge 的整体删除对象，`safeInvoke`、HTTP client、`app_server_handle_json_lines` 和 bridge availability 是 current renderer bridge，旧命令 policy / mock fallback 才是后续治理对象。

## 维护规则

1. 更新文档站页面时，优先改 `content/` 或顶层站点页面。
2. 更新工程规则、执行计划、路线图、测试策略或私有材料时，必须落到 `../internal/`。
3. 新增内部事实源目录前，先同步更新 `../internal/README.md`。
4. 文档站边界由根仓库 `npm run docs:boundary` 检查。
