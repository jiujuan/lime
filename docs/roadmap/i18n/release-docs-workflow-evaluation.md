# Lime 发布材料与帮助文档翻译工作流评估

> 关联 PRD：`docs/roadmap/i18n/prd.md`
> 关联进度：`docs/roadmap/i18n/implementation-progress.md`
> 评估时间：2026-05-27

## 评估目标

判断 Lime 的发布材料、官网文档和帮助文档，是否已经具备独立于桌面 App 的翻译工作流。

## 当前事实

- 根目录只有 `README.md` 与 `README.en.md` 这一对双语入口；其中英文版明确标注为 companion，不是主版本。
- `RELEASE_NOTES.md` 与 `RELEASE_NOTES.en.md` 现在形成当前版本发布说明 companion pair；中文仍是 source，英文版只作为国际读者 companion，且英文 README 已链接到英文 release notes companion。
- `docs/README.md`、`docs/content/`、`docs/aiprompts/`、`docs/develop/`、`docs/ops.md`、`docs/bussniss/`、`docs/oem/` 目前仍以中文为主。
- `docs/package.json` 只提供 Nuxt / Docus 构建脚本，没有把翻译、locale sync 或发布材料导出接入文档站自身构建。
- `docs/nuxt.config.ts` 没有 `i18n`、`locales` 或语言路由配置，说明文档站当前仍不是多语言路由站点。
- 现有 `docs/content/` 只保留少量对外文档页，没有按 locale 切目录或按语言分站点的结构。
- `docs/roadmap/i18n/release-docs-translation-scope.json` 已定义发布材料 / 官网文档 / 帮助文档的 `required / pilot / source-only` 翻译范围，当前 required 项为 README 与 Release Notes，pilot 项为文档首页；`docs/roadmap/i18n/companions/docs-content-index.en.md` 已作为文档首页英文 companion pilot，inventory 会把 required companion 缺失作为门禁，把后续新增 pilot companion 缺失作为 advisory。
- 文档首页英文 companion 现在放在 roadmap companion 目录，不放入 `docs/content/`；在文档站没有 locale route 前，这避免把 companion 误发布成普通内容页。
- `docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json` 现在输出 `releaseDocsTranslationQueue`，从 translation scope 生成可审阅队列；当前队列状态为 `ready`，missing source / required companion blocker / pilot companion missing 均为 `0`，12 个 `source-only` 帮助文档 / API reference / open platform / legal 页面进入后续翻译候选队列。
- `docs/roadmap/i18n/evidence/docs-locale-build-manifest.json` 现在输出独立于 Nuxt route emission 的 build-time manifest；当前 `workflowStatus=ready`，source locale 为 `zh-CN`，target locales 为 `en-US`，15 个 scope entry 中 3 个已有 companion、12 个进入 source-only 候选队列，missing source / required companion missing / pilot companion missing 均为 `0`。
- `docs/content` locale route emission 明确保持 `disabled`，当前 workflow 只证明发布材料 / 官网文档 / 帮助文档有可审阅、可门禁的 locale build manifest，不把英文 companion 冒充成已发布的多语言站点页面。

## 结论

当前已经具备 README、Release Notes 与文档首页 pilot 的最小 `zh-CN / en-US` companion 覆盖，并有可机器读取的 release docs translation scope、translation queue 与 build-time locale manifest；因此 P4 的“官网文档 / 帮助文档 locale workflow”已具备最小独立工作流。仍不能宣称已完成真实多语言文档站发布，因为 `docs/content` 还没有 locale route、语言切换或多站点发布产物。

## 现状评价

1. README 已经有最薄的双语 companion 形态，但这更像单文件双语展示，不是可复用的 workflow。
2. Release Notes 已有英文 companion，且 report 会检查中英文版本标题是否一致、英文 README 是否链接 companion，可以满足当前发布材料的最低双语覆盖；但这仍是手工 companion，不是可扩展的多语言同步链路。
3. Translation scope manifest 让“哪些页面必须双语、哪些页面先作为 pilot、哪些页面只保留 source”有了版本化事实源，后续可以被 report / quality selector 继续消费；当前 required companion 缺失数为 `0`，文档首页 pilot companion 缺失数也为 `0`。
4. Translation queue 把剩余 source-only 文档转成可审阅候选列表，当前 12 个候选都来自真实存在的 source 文件，没有 required blocker；这已经是独立 workflow queue，但不是自动翻译或自动发布流水线。
5. Docs locale build manifest 把 release docs scope 转成 build-time 门禁产物，当前 `workflowStatus=ready`，并显式禁止 `docs/content` route emission；这避免了“有英文 companion 文件”与“已经发布英文站点”的口径混淆。
6. 文档站仍是单语言 Nuxt Content 站，没有 locale 路由或语言切换；inventory 会额外统计 `docs/content` 内英文 companion 文件数量，当前应保持为 `0`。
7. 商业、OEM、帮助文档等内容虽然分目录，但大多仍停留在 source-only 候选队列，还没有正式 companion 文件、术语校验和回滚策略。

## 建议工作流

- 发布材料：继续以 `RELEASE_NOTES.md` 为当前版本事实源，发布时同步维护 `RELEASE_NOTES.en.md` companion，但不要反过来把英文版变成 source。
- 官网文档：把 `README.md`、`README.en.md` 视作最小双语样板，其余公开文档先进入 `releaseDocsTranslationQueue`，再决定是否拆 locale 目录。
- 帮助文档：沿 `docs/content/` 现有结构继续维护 source locale，进入翻译前先让 inventory 明确 required / pilot / source-only 队列状态。
- 构建门禁：继续把 `docs-locale-build-manifest.json` 作为发布材料 / 官网文档 / 帮助文档的最小 locale build workflow evidence；在没有 locale route 前，保持 route emission disabled。
- 术语控制：复用 `docs/roadmap/i18n/glossary.md` 和 PR 模板，避免发布材料与帮助文档各自长出不同词表。

## 重新评估条件

满足以下任一条件时，再推进独立 workflow 实施：

1. 官网或帮助文档开始需要稳定的 `zh-CN / en-US` 双语发布节奏。
2. Release Notes 需要同步面向外部用户的英文版本，而不是只在 README 上做 companion。
3. 文档站开始引入 locale 路由、语言切换或多站点构建。
4. `source-only` 候选页面要升级为 required / pilot companion，并进入正式发布门禁。
5. 翻译流程需要 CI 级校验、PR 级审阅和回滚策略。

## 证据链接

- [README.md](</Users/coso/Documents/dev/ai/aiclientproxy/lime/README.md>)
- [README.en.md](</Users/coso/Documents/dev/ai/aiclientproxy/lime/README.en.md>)
- [RELEASE_NOTES.md](</Users/coso/Documents/dev/ai/aiclientproxy/lime/RELEASE_NOTES.md>)
- [RELEASE_NOTES.en.md](</Users/coso/Documents/dev/ai/aiclientproxy/lime/RELEASE_NOTES.en.md>)
- [release-docs-translation-scope.json](</Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/release-docs-translation-scope.json>)
- [release-docs-workflow-inventory.json](</Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json>)
- [docs-locale-build-manifest.json](</Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/evidence/docs-locale-build-manifest.json>)
- [docs-content-index.en.md](</Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/companions/docs-content-index.en.md>)
- [docs/README.md](</Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/README.md>)
- [docs/package.json](</Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/package.json>)
- [docs/nuxt.config.ts](</Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/nuxt.config.ts>)
