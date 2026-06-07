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

## 维护规则

1. 更新文档站页面时，优先改 `content/` 或顶层站点页面。
2. 更新工程规则、执行计划、路线图、测试策略或私有材料时，必须落到 `../internal/`。
3. 新增内部事实源目录前，先同步更新 `../internal/README.md`。
4. 文档站边界由根仓库 `npm run docs:boundary` 检查。
