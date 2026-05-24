# Lime 发布材料与帮助文档翻译工作流评估

> 关联 PRD：`docs/roadmap/i18n/prd.md`
> 关联进度：`docs/roadmap/i18n/implementation-progress.md`
> 评估时间：2026-05-23

## 评估目标

判断 Lime 的发布材料、官网文档和帮助文档，是否已经具备独立于桌面 App 的翻译工作流。

## 当前事实

- 根目录只有 `README.md` 与 `README.en.md` 这一对双语入口；其中英文版明确标注为 companion，不是主版本。
- `RELEASE_NOTES.md` 目前是单一当前版本的发布说明，没有独立的英文 release notes companion。
- `docs/README.md`、`docs/content/`、`docs/aiprompts/`、`docs/develop/`、`docs/ops.md`、`docs/bussniss/`、`docs/oem/` 目前仍以中文为主。
- `docs/package.json` 只提供 Nuxt / Docus 构建脚本，没有文档翻译、locale sync 或发布材料导出脚本。
- `docs/nuxt.config.ts` 没有 `i18n`、`locales` 或语言路由配置，说明文档站当前不是多语言站点。
- 现有 `docs/content/` 只保留少量对外文档页，没有按 locale 切目录或按语言分站点的结构。

## 结论

当前**没有**独立的发布材料 / 官网文档 / 帮助文档翻译工作流。

## 现状评价

1. README 已经有最薄的双语 companion 形态，但这更像单文件双语展示，不是可复用的 workflow。
2. Release Notes 目前只维护当前版本事实源，适合发布收口，不适合作为多语言同步的独立链路。
3. 文档站仍是单语言 Nuxt Content 站，没有 locale 路由，也没有 translation pipeline。
4. 商业、OEM、帮助文档等内容虽然分目录，但没有统一的翻译责任边界、术语约束和回滚策略。

## 建议工作流

- 发布材料：继续以 `RELEASE_NOTES.md` 为当前版本事实源，再按需要生成英文 companion，但不要反过来把英文版变成 source。
- 官网文档：把 `README.md`、`README.en.md` 视作最小双语样板，其余公开文档先统一到 source locale，再决定是否拆 locale 目录。
- 帮助文档：沿 `docs/content/` 现有结构继续维护 source locale，进入翻译前先定义哪些页必须双语、哪些页只保留中文 source。
- 术语控制：复用 `docs/roadmap/i18n/glossary.md` 和 PR 模板，避免发布材料与帮助文档各自长出不同词表。

## 重新评估条件

满足以下任一条件时，再推进独立 workflow 实施：

1. 官网或帮助文档开始需要稳定的 `zh-CN / en-US` 双语发布节奏。
2. Release Notes 需要同步面向外部用户的英文版本，而不是只在 README 上做 companion。
3. 文档站开始引入 locale 路由、语言切换或多站点构建。
4. 翻译流程需要 CI 级校验、PR 级审阅和回滚策略。

## 证据链接

- [README.md](</Users/coso/Documents/dev/ai/aiclientproxy/lime/README.md>)
- [README.en.md](</Users/coso/Documents/dev/ai/aiclientproxy/lime/README.en.md>)
- [RELEASE_NOTES.md](</Users/coso/Documents/dev/ai/aiclientproxy/lime/RELEASE_NOTES.md>)
- [docs/README.md](</Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/README.md>)
- [docs/package.json](</Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/package.json>)
- [docs/nuxt.config.ts](</Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/nuxt.config.ts>)
