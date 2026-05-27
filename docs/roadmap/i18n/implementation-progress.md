# Lime 全球本地化执行进度

> 关联 PRD：`docs/roadmap/i18n/prd.md`
> 当前阶段：P2 / P3 并行收口
> 更新日期：2026-05-24

## 主目标

把 Lime 本地化从已落地的 key-based resources 与五语言覆盖，继续推进到可被统一质量入口验证的治理体系；新增或变更 locale resources 时，不能只依赖人工记忆执行检查。

## 当前事实

- `src/i18n/resources/<locale>/` 已覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
- `scripts/detect-missing-translations.ts` 已能按 `zh-CN` source locale 检查 namespace 与 key 结构一致性。
- `package.json` 之前只有 `detect-translations*` 入口，缺少 PRD P3 明确验收口径里的 `npm run i18n:check`。
- `npm run verify:local` 已开始在 frontend / i18n 相关改动时串联 `i18n:check` 与 `i18n:unused --check`，让 source locale 结构与 unused key 门禁进入统一本地校验入口。

## 2026-05-24：P2 Artifact document language runtime 收口

本轮完成：

- `src-tauri/src/services/artifact_document_validator.rs` 不再把显式 `document.language` 固定覆盖成 `zh-CN`；当模型或上游协议给出 `en-US` 等文档级语言元数据时，validator 会保留该值。
- Artifact document 缺失或空 `language` 时仍回退 `zh-CN`，并记录修复 issue，保持历史默认行为可追踪。
- `src-tauri/src/services/artifact_output_schema_service.rs` 新增 content target language 读取：当 request metadata 显式提供 `target_language` / `targetLanguage` / `artifact_language` / `artifactLanguage` / `content_target_language` / `contentTargetLanguage` 时，stage2 document schema 的 `language.enum` 收窄到该内容目标语言；未提供时继续默认 `zh-CN`。
- 这条 runtime 证据把 PRD P2 验收“Artifact 目标语言不因 UI 切换而改变”推进到 Artifact document 主链：语言事实源来自文档 / turn metadata 的 content target language，而不是 UI locale。

验证：

- `cargo test --manifest-path "src-tauri/Cargo.toml" validate_or_fallback_should_accept_plain_document_json` 通过。
- `cargo test --manifest-path "src-tauri/Cargo.toml" validate_or_fallback_should_default_missing_document_language` 通过。
- `cargo test --manifest-path "src-tauri/Cargo.toml" stage2_should_narrow_document_language_to_content_target_language` 通过。

## 2026-05-24：P2 Service Skill 导出目标语言反向回归

本轮完成：

- `src/components/agent/chat/service-skills/siteCapabilityBinding.test.ts` 新增导出型站点技能反向回归：当任务只携带 `locale: "en-US"` 这类 locale-like adapter 参数、但没有显式 `target_language` 时，`buildServiceSkillClawLaunchRequestMetadata()` 不会注入 `allow_model_skills` 或 `translation_skill_launch`。
- 复用 `createArticleExportSkill()` helper 收敛 X 文章导出测试 fixture，保留既有“显式 `target_language` 会触发 translation request”的正向断言。
- 这条测试把 PRD P2 验收“Artifact / 文档 / 文章 / 翻译类任务明确 content target language”推进到可执行口径：content target language 只来自任务级 `target_language`，不能从 UI locale 或 adapter locale-like 参数自动派生。

验证：

- `npm test -- "src/components/agent/chat/service-skills/siteCapabilityBinding.test.ts"` 通过，覆盖 7 个用例。

## 2026-05-24：P2 content target language 边界证据

本轮完成：

- `scripts/i18n-language-boundary-report.ts` 新增 `--category <category>` 聚焦输出，支持单独导出 `contentTargetLanguage`、`agentResponseLanguage` 等边界 evidence。
- language boundary report 的 JSON summary 现在包含 `fileSummaries` 与 `markerSummaries`，可以直接看到某类 language-like 字段的热点文件和 marker 分布。
- 已刷新 `docs/roadmap/i18n/evidence/language-boundary-report.json`，当前全量扫描 3007 个源码文件、1935 个 marker：`uiLocale=1081`、`contentTargetLanguage=418`、`codeLanguage=121`、`asrLanguage=97`、`unknownLanguageLike=95`、`browserEnvironmentLanguage=91`、`agentResponseLanguage=32`。
- 新增 `docs/roadmap/i18n/evidence/content-target-language-boundary-report.json`，聚焦 PRD P2 “Artifact / 文档 / 文章 / 翻译类任务明确 content target language”；当前 marker 分布为 `language=257`、`target_language=82`、`targetLanguage=48`、`locale=31`。
- `docs/roadmap/i18n/language-boundary-evaluation.md` 已补充 content target language 证据和边界结论：`target_language` 是任务级产物语言，Artifact document `language` 是文档级元数据，二者都不能由 UI locale 自动写回。

验证：

- `npm test -- "scripts/i18n-language-boundary-report.test.ts"` 通过，覆盖 3 个用例。
- `npm run i18n:language-boundary-report -- --category contentTargetLanguage` 通过，文本报告输出 `contentTargetLanguage=418` 与 top file / marker 热点。
- `npm run i18n:language-boundary-report:json -- --output "docs/roadmap/i18n/evidence/language-boundary-report.json"` 通过。
- `npm run i18n:language-boundary-report:json -- --category contentTargetLanguage --output "docs/roadmap/i18n/evidence/content-target-language-boundary-report.json"` 通过。

## 2026-05-24：P3 unused key 门禁接入 verify:local

本轮完成：

- `scripts/local-ci.mjs` 已在 `tasks.i18nUnused` 命中时执行 `npm run i18n:unused -- --check`，并在计划摘要里显式显示“i18n 未引用 key 检查”。
- `scripts/quality-task-planner.mjs` / `scripts/quality-task-planner.test.ts` 新增 `i18nUnused` 任务位：前端源码、i18n check 相关文件、workflow 或 full 模式都会触发该门禁，docs-only 改动则不会把它拉进来。
- `scripts/quality-task-selector.mjs` 的 GitHub 格式输出同步暴露 `i18n_unused`，方便外部任务选择器消费这条门禁位。
- `src/i18n/README.md` 已把 `i18n:unused --check` 写入验证入口，并明确它会在 `verify:local` 的相关改动路径里自动运行。

验证：

- `npm test -- "scripts/quality-task-planner.test.ts" "scripts/i18n-patch-retirement-gate.test.ts"` 通过。
- `node --check "scripts/local-ci.mjs"` 通过。
- `node --check "scripts/quality-task-planner.mjs"` 通过。
- `npm run i18n:unused -- --check` 通过，当前 `unusedKeyCount=0`。

## 2026-05-24：P3 selector 输出位回归

本轮继续完成：

- `scripts/quality-task-selector.mjs` 现在以可导入模块方式暴露 `printGithubFormat()`，并在 GitHub 格式输出里显式保留 `i18n_unused`，方便外部质量选择器消费这条门禁位。
- 新增 `scripts/quality-task-selector.test.ts`，锁住 GitHub 输出必须包含 `i18n_unused=true`，避免后续 selector 改版时把这个任务位漏掉。

验证：

- `node --check "scripts/quality-task-selector.mjs"` 通过。
- `npm test -- "scripts/quality-task-selector.test.ts"` 通过。
- `node scripts/quality-task-selector.mjs --format github --base HEAD` 输出里包含 `i18n_unused=true`。

## 2026-05-24：P3 i18next-cli parity benchmark 增强

本轮继续完成：

- `scripts/i18next-cli-parity-benchmark.mjs` 已把 Lime 自研 `i18n-unused-key-check.ts` 纳入同一个 temp fixture benchmark，和官方 `status` / `lint` / `extract --dry-run --ci` / `types` 结果一起落盘。
- benchmark 现在先跑 Lime unused scan，再跑官方 CLI，避免官方 `types` 命令生成的 `src/types` 文件污染 unused key 统计。
- 新增 `scripts/i18next-cli-parity-benchmark.test.ts`，锁住 summary 里必须包含 `limeUnused` 的 `unusedKeyCount`、`protectedKeyCount`、`dynamicKeyPatternCount` 与热点 namespace。
- 已刷新 `docs/roadmap/i18n/evidence/i18next-cli-parity-benchmark.json`；当前 fixture 结果显示官方 CLI 能覆盖 extraction / lint / type 方向，Lime unused 侧则给出 `unusedKeyCount=1`、`protectedKeyCount=1`，继续证明两者现在是互补关系，不是可直接替换关系。
- `docs/roadmap/i18n/toolchain-evaluation.md` 已同步这份增强证据。

验证：

- `node --check "scripts/i18next-cli-parity-benchmark.mjs"` 通过。
- `npm test -- "scripts/i18next-cli-parity-benchmark.test.ts"` 通过。
- `npm run i18n:toolchain-benchmark -- --output "docs/roadmap/i18n/evidence/i18next-cli-parity-benchmark.json"` 通过。

## 2026-05-24：P4 legacy Patch 退出门禁接入 GUI smoke

本轮完成：

- `scripts/verify-gui-smoke.mjs` 在写出 `.lime/i18n/patch-metrics.json` 与 `.lime/i18n/patch-metrics-report.json` 后，继续生成 `.lime/governance/legacy-surface-report.json`，并自动执行 `npm run i18n:patch-retirement-gate -- --check`，把 legacy Patch 退出门禁接到真实 GUI smoke 产物链。
- `scripts/quality-task-planner.mjs` 与 `scripts/quality-task-planner.test.ts` 新增 patch retirement 相关脚本识别：当 `scripts/i18n-patch-metrics-report.mjs`、`scripts/i18n-patch-retirement-gate.mjs`、`scripts/report-legacy-surfaces.mjs`、`scripts/lib/i18n-patch-metrics-report-core.mjs`、`scripts/lib/legacy-surface-report-core.mjs` 或 `scripts/verify-gui-smoke.mjs` 变更时，会把这条链路视为 `guiSmoke` 风险，并推荐直接重跑 `npm run i18n:patch-retirement-gate -- --check`。
- `src/i18n/README.md` 的 gate 说明已同步改写成“GUI smoke 会同时刷新 legacy surface report 并执行 gate”，避免只记住 patch metrics 而忽略 dependency audit。

验证：

- `node --check "scripts/verify-gui-smoke.mjs"` 通过。
- `node --check "scripts/quality-task-planner.mjs"` 通过。
- `npm test -- "scripts/quality-task-planner.test.ts" "scripts/i18n-patch-retirement-gate.test.ts"` 通过，覆盖 2 个文件、17 个用例。
- `npm run i18n:patch-retirement-gate -- --check --format json --patch-report .lime/i18n/patch-metrics-report.json --legacy-report .lime/governance/legacy-surface-report.json` 通过，当前 `status=no-hit`、`violationCount=0`、`retirementReady=true`。

## 2026-05-23：P2 language boundary inventory

本轮完成：

- 新增 `scripts/i18n-language-boundary-report.ts` 与测试 `scripts/i18n-language-boundary-report.test.ts`，把 `language` / `locale` / `accept_language` / `target_language` 等 language-like marker 分类到 UI locale、AI response language、content target language、Browser Environment、ASR、code language 和 unknown 七类。
- `package.json` 新增 `i18n:language-boundary-report` 与 `i18n:language-boundary-report:json`，用于在实现 response language、content target language 或 Browser Environment 语言能力前复跑 inventory。
- 通过 `npx tsx scripts/i18n-language-boundary-report.ts --format json --output "docs/roadmap/i18n/evidence/language-boundary-report.json"` 落盘 evidence；当前扫描 3007 个源码文件，识别 1864 个 marker，其中 `uiLocale=1068`、`contentTargetLanguage=406`、`codeLanguage=121`、`asrLanguage=97`、`browserEnvironmentLanguage=91`、`unknownLanguageLike=81`。
- 本轮继续收紧分类规则，把 Markdown / code fence、media task、workspace artifact preview、runtime export locale、Browser Runtime / WebView language 等明确语义从 unknown 桶剥离，`unknownLanguageLike` 从 322 降到 81。
- 新增 `docs/roadmap/i18n/language-boundary-evaluation.md`，明确当前不应复用 `Config.language` 作为 AI response language 或内容产物语言事实源。
- `src/i18n/README.md` 已补充 language boundary report 的入口说明。

验证：

- `npm test -- "scripts/i18n-language-boundary-report.test.ts"` 通过，覆盖 2 个用例。
- `git diff --check -- "scripts/i18n-language-boundary-report.ts" "scripts/i18n-language-boundary-report.test.ts" "package.json" "src/i18n/README.md" "docs/roadmap/i18n/evidence/language-boundary-report.json" "docs/roadmap/i18n/language-boundary-evaluation.md"` 通过。

## 2026-05-23：P3 source locale 导出

本轮完成：

- 新增 `scripts/i18n-source-locale-export.ts` 与测试 `scripts/i18n-source-locale-export.test.ts`，把 `zh-CN` source locale 的 namespace、扁平 key、原文值、key 数和 raw bytes 汇总导出为稳定 JSON / text 报告。
- `package.json` 新增 `i18n:source-export` 与 `i18n:source-export:json`，后续自动翻译 PR、人工 review 或外部翻译工具可以复用同一份 source 输入。
- 通过 `npx tsx scripts/i18n-source-locale-export.ts --format json --output "docs/roadmap/i18n/evidence/source-locale-export.json"` 落盘当前 source export evidence，当前 `zh-CN` source locale 覆盖 13 个 namespace、7318 个 key、636992 raw bytes。
- `src/i18n/README.md` 已补充 source export 入口说明，避免后续翻译 workflow 直接临时拼读 resources 目录。

验证：

- `npm test -- "scripts/i18n-source-locale-export.test.ts"` 通过，覆盖 2 个用例。
- `git diff --check -- "scripts/i18n-source-locale-export.ts" "scripts/i18n-source-locale-export.test.ts" "package.json" "src/i18n/README.md" "docs/roadmap/i18n/evidence/source-locale-export.json"` 通过。

## 2026-05-23：P3 translation PR pack

本轮完成：

- 新增 `scripts/i18n-translation-pr-pack.ts` 与测试 `scripts/i18n-translation-pr-pack.test.ts`，把 `zh-CN` source export、翻译覆盖率与 locale 缺口组合成可审阅的 PR pack，不会改写任何 source locale 或目标 locale 文件。
- `package.json` 新增 `i18n:translation-pr-pack` 与 `i18n:translation-pr-pack:json`，后续自动翻译或人工 review 可以直接消费同一份包。
- 这个 PR pack 会对每个缺口 locale 生成 namespace 级 `missingEntries`，携带原始 source 文案，方便自动翻译系统或人工 reviewer 直接复核，而不是只看空洞的 missing key 列表。
- 通过 `npx tsx scripts/i18n-translation-pr-pack.ts --format json --output "docs/roadmap/i18n/evidence/translation-pr-pack.json"` 落盘当前 PR pack evidence；当前 5 个 locale、13 个 namespace 维持无缺口，`proposedEntryCount=0`。
- `src/i18n/README.md` 已补充 PR pack 入口说明，明确它只做 review packaging，不回写 resources。

验证：

- `npm test -- "scripts/i18n-translation-pr-pack.test.ts"` 通过，覆盖 2 个用例。
- `git diff --check -- "scripts/i18n-translation-pr-pack.ts" "scripts/i18n-translation-pr-pack.test.ts" "package.json" "src/i18n/README.md" "docs/roadmap/i18n/evidence/translation-pr-pack.json"` 通过。

## 2026-05-23：P3 translation PR pack 接入质量选择器

本轮完成：

- `scripts/quality-task-planner.mjs` 已把 `scripts/i18n-*` workflow 脚本纳入 i18n 结构校验触发面，避免后续改 source export / PR pack / unused key / RTL 等 i18n 治理脚本时没有任何 i18n 定向校验。
- 当 `src/i18n/resources/` 或 source export / translation PR pack 相关脚本变更时，质量选择器会推荐 `npm run i18n:translation-pr-pack:json -- --output docs/roadmap/i18n/evidence/translation-pr-pack.json`，把 PR pack 从孤立脚本接到日常 review 流程。
- 这条推荐只作为审阅证据，不把 PR pack 生成强制塞进 `verify:local` 阻断面；当前阻断面仍由 `i18n:check` 保证资源结构一致性，符合“可审阅、可回滚、不直接覆盖人工修订”的 P3 目标。

验证：

- `npm test -- "scripts/quality-task-planner.test.ts"` 通过，覆盖 14 个用例。
- `npm run verify:tasks -- --format json` 输出包含 `recommendedCommands=["npm run i18n:translation-pr-pack:json -- --output docs/roadmap/i18n/evidence/translation-pr-pack.json"]`。
- `git diff --check -- "scripts/quality-task-planner.mjs" "scripts/quality-task-planner.test.ts" "docs/roadmap/i18n/implementation-progress.md"` 通过。

## 2026-05-23：P3 翻译覆盖率报告

本轮完成：

- `scripts/detect-missing-translations.ts` 新增翻译覆盖率计算，`detect-translations:json` 现在会同时输出 locale 总覆盖率与 namespace 级覆盖率，覆盖 `translated / missing / extra` 的机器可消费摘要。
- `scripts/detect-missing-translations.test.ts` 补充 coverage 回归，锁住 JSON 报告里的 locale 总覆盖率、namespace 覆盖率和 verbose 文本输出。
- 通过 `npx tsx scripts/detect-missing-translations.ts --format json` 落盘 `docs/roadmap/i18n/evidence/translation-coverage-report.json`，当前五个 locale 与 13 个 namespace 维持 `hasIssues=false`，`en-US / ja-JP / ko-KR / zh-TW` 的翻译覆盖率均为 100%。
- `src/i18n/README.md` 已补充 `detect-translations:json` 的覆盖率报告入口说明，避免只看 `--verbose` 文本输出。

验证：

- `npm test -- "scripts/detect-missing-translations.test.ts"` 通过，覆盖 6 个用例。
- `git diff --check -- "scripts/detect-missing-translations.ts" "scripts/detect-missing-translations.test.ts" "src/i18n/README.md" "docs/roadmap/i18n/evidence/translation-coverage-report.json"` 通过。

## 2026-05-23：P4 installer / app metadata workflow 库存报告

本轮完成：

- 新增 `scripts/i18n-app-metadata-workflow-report.ts` 与测试 `scripts/i18n-app-metadata-workflow-report.test.ts`，把 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/tauri.conf.headless.json` 与 `src-tauri/capabilities/agent-app-shell.json` 的 app / installer 元数据事实源做成可重复 inventory 报告。
- 通过 `npm run i18n:app-metadata-report -- --format json --output "docs/roadmap/i18n/evidence/app-metadata-workflow-inventory.json"` 落盘库存报告，确认当前这些元数据仍是单语事实源，没有独立 installer 翻译工作流。
- 新增 `docs/roadmap/i18n/app-metadata-workflow-evaluation.md`，把 installer / app metadata 的边界判断、建议工作流和重新评估条件写成可引用的 roadmap 工件。
- 报告结论保持不变：app / installer 元数据现在只有单一文本事实源，没有 `zh-CN / en-US` 之类的专门翻译链路；如果后续要做，必须先定义 source locale、metadata ownership 和发布约束，再补 workflow。

验证：

- `npm test -- "scripts/i18n-app-metadata-workflow-report.test.ts"` 通过，覆盖 2 个用例。
- `git diff --check -- "scripts/i18n-app-metadata-workflow-report.ts" "scripts/i18n-app-metadata-workflow-report.test.ts" "package.json" "docs/roadmap/i18n/evidence/app-metadata-workflow-inventory.json"` 通过。

## 2026-05-23：P4 RTL readiness groundwork

本轮完成：

- `src/i18n/locales.ts` 新增 `isRtlLocale()` 与基于 RTL 语言 / script 的 `resolveDocumentDirection()`，让 `document.documentElement.dir` 不再是硬编码 `ltr`。
- `src/i18n/__tests__/locales.test.ts` 补充 RTL 方向单测，覆盖 `ar` / `fa-IR` 的方向判定与常规 LTR 回归。
- `src/i18n/README.md` 把 locale registry 的职责说明补到方向辅助能力。
- 新增 `docs/roadmap/i18n/rtl-readiness-evaluation.md`，把当前 RTL 主路径仍未完成布局审计、截图回归与 Playwright smoke 的缺口版本化。

验证：

- `npm test -- "src/features/browser-runtime/BrowserEnvironmentPresetManager.test.tsx"` 通过，覆盖浏览器环境页的中英双语边界文案回归。
- `npm run i18n:check` 通过，确认 5 个 locale、13 个 namespace 的资源结构仍保持一致。
- `git diff --check -- "src/features/browser-runtime/BrowserEnvironmentPresetManager.test.tsx" "src/i18n/resources/zh-CN/workspace.json" "src/i18n/resources/zh-TW/workspace.json" "src/i18n/resources/en-US/workspace.json" "src/i18n/resources/ja-JP/workspace.json" "src/i18n/resources/ko-KR/workspace.json" "docs/roadmap/i18n/implementation-progress.md"` 通过。

## 2026-05-23：P4 RTL readiness inventory

本轮完成：

- 新增 `scripts/i18n-rtl-readiness-report.ts` 与测试 `scripts/i18n-rtl-readiness-report.test.ts`，把 RTL 主路径的方向基础、设置页 / 侧栏 / Workspace / 对话框 / Knowledge 主路径布局敏感面做成可重复 inventory。
- `package.json` 新增 `i18n:rtl-readiness-report` 与 `i18n:rtl-readiness-report:json`，方便后续把同一份 inventory 直接落盘成 evidence。
- 通过 `npm run i18n:rtl-readiness-report -- --format json --output "docs/roadmap/i18n/evidence/rtl-readiness-inventory.json"` 落盘静态 inventory，当前结果显示：38 个审计文件、98 个方向敏感 marker、23 个高风险文件、5 个主路径 surface，且仍缺 RTL 截图回归与 Playwright smoke 证据。
- `docs/roadmap/i18n/rtl-readiness-evaluation.md` 已更新，引用这份 inventory 作为当前态基线。

验证：

- `npm test -- "scripts/i18n-rtl-readiness-report.test.ts"` 通过，覆盖 2 个用例。
- `npm run i18n:rtl-readiness-report -- --format json --output "docs/roadmap/i18n/evidence/rtl-readiness-inventory.json"` 成功落盘。

## 2026-05-23：P4 RTL screenshot / smoke evidence

本轮完成：

- 在现有 Lime 页面上强制 `document.documentElement.dir = "rtl"`，完成首页、设置页与用户菜单 dialog 的 Playwright smoke。
- 通过 `browser_take_screenshot` 落盘三张截图：`rtl-home-fullpage.png`、`rtl-settings-fullpage.png`、`rtl-user-menu-fullpage.png`。
- 新增 `docs/roadmap/i18n/evidence/rtl-screenshot-smoke-report.md`，把本次人工 smoke 的页面、截图和局限收成版本化 evidence。
- 观察结果显示：首页与设置页在 `rtl` 下仍可加载，侧栏已整体翻转到右侧，用户菜单 dialog 可打开，控制台 error 维持为 0。

验证：

- Playwright MCP 复用现有 Lime 页签完成 smoke。
- `browser_console_messages --level error` 返回 0 条 error。

## 2026-05-23：P4 RTL smoke automation

本轮完成：

- 新增 `scripts/i18n-rtl-playwright-smoke.mjs`，把强制 `rtl` 下的首页、用户菜单和设置页验证固化为可复跑的 Playwright smoke。
- `package.json` 新增 `i18n:rtl-smoke` 入口，直接复用仓库已有的 Playwright / Chromium 依赖。
- 自动 smoke 生成 `docs/roadmap/i18n/evidence/rtl-playwright-smoke-report.json`，并复用同一目录下的三张自动截图 `rtl-home-automated.png`、`rtl-settings-automated.png`、`rtl-user-menu-automated.png`。
- 报告摘要显示：`homeSidebarOnRight=true`、`settingsNavVisible=true`、`userMenuDialogVisible=true`，且 console / page error 都为 0。

验证：

- `npm run i18n:rtl-smoke` 通过。

## 2026-05-23：P4 发布材料 / 帮助文档工作流库存报告

本轮完成：

- 新增 `scripts/i18n-release-docs-workflow-report.ts` 与测试 `scripts/i18n-release-docs-workflow-report.test.ts`，把 `README.md` / `README.en.md`、`RELEASE_NOTES.md`、`docs/package.json`、`docs/nuxt.config.ts` 与 `docs/content/` 的翻译工作流现状做成可重复报告。
- 通过 `npm run i18n:release-docs-report -- --format json --output "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json"` 落盘库存报告，证明当前 `docs/` 站点没有 `i18n` / `locales` 配置，也没有独立翻译脚本。
- 报告结论保持不变：当前没有独立的发布材料 / 官网文档 / 帮助文档翻译工作流，但现在已经有机器可消费的 inventory artifact，可作为后续 workflow 变更的基线。

验证：

- `npm test -- "scripts/i18n-release-docs-workflow-report.test.ts"` 通过，覆盖 2 个用例。
- `git diff --check -- "scripts/i18n-release-docs-workflow-report.ts" "scripts/i18n-release-docs-workflow-report.test.ts" "package.json" "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json"` 通过。

## 2026-05-23：P4 发布材料 / 帮助文档翻译工作流评估

本轮完成：

- 新增 `docs/roadmap/i18n/release-docs-workflow-evaluation.md`，把 `README` 双语 companion、`RELEASE_NOTES.md` 单一当前版本事实源、`docs/content/` / `docs/aiprompts/` / `docs/oem/` 单语言文档站现状，以及 `docs/package.json` / `docs/nuxt.config.ts` 没有 locale workflow 的缺口落成版本化工件。
- 评估结论收紧为：当前没有独立的发布材料 / 官网文档 / 帮助文档翻译工作流；后续若要做，应先定义 source locale、companion 形态和回滚边界，再接入 CI / PR workflow。

验证：

- 读回 `README.md`、`README.en.md`、`RELEASE_NOTES.md`、`docs/README.md`、`docs/package.json` 与 `docs/nuxt.config.ts`，确认现状是 README 只有最薄双语 companion，文档站仍是单语言 Nuxt Content，没有 locale 配置。
- `git diff --check -- "docs/roadmap/i18n/release-docs-workflow-evaluation.md" "docs/roadmap/i18n/implementation-progress.md"` 预期可用作后续提交前的格式校验入口。

## 2026-05-23：P4 Chrome extension i18n 评估

本轮完成：

- 新增 `docs/roadmap/i18n/chrome-extension-evaluation.md`，把 `extensions/lime-chrome` 当前的自定义 `data-i18n` / `InstallI18n` 事实源、manifest 现状和 `_locales/messages.json` 迁移判断落成版本化工件。
- 评估结论收紧为：当前不迁移到 `_locales/messages.json`，继续保留扩展页级 registry，等待扩展规模或发布约束变化后再重评。

验证：

- 读回 `extensions/lime-chrome/manifest.json`、`extensions/lime-chrome/pages/scripts/install-i18n.js`、`extensions/lime-chrome/pages/*.html` 与扩展 README，确认当前扩展没有 `_locales/` 目录，也没有 `default_locale`。
- `git diff --check -- "docs/roadmap/i18n/chrome-extension-evaluation.md" "docs/roadmap/i18n/implementation-progress.md"` 预期可用作后续提交前的格式校验入口。

## 2026-05-23：P2 浏览器环境语言边界文案收口

本轮完成：

- `src/features/browser-runtime/BrowserEnvironmentPresetManager.tsx` 继续沿用既有字段结构，但浏览器环境预设的说明、`locale` / `accept_language` 标签、预览摘要和占位文案已明确改成“网站可见环境”，不再让它看起来像 Lime UI 语言事实源。
- 5 个 locale 的 `workspace.browserEnvironment.*` 文案已同步收紧：`locale` 统一改为浏览器侧 locale，`acceptLanguage` 统一改为 `Accept-Language` 请求头 / header，说明文案直接点明它们不控制 Lime UI 语言或 Agent 回复语言。
- `BrowserEnvironmentPresetManager.test.tsx` 补了中英双语回归，锁住浏览器环境页里与 UI locale 的语义边界。

验证：

- `npm test -- "src/features/browser-runtime/BrowserProfileManager.test.tsx"` 通过，覆盖浏览器 profile 启动环境提示的中英双语边界回归。
- `git diff --check -- "src/features/browser-runtime/BrowserProfileManager.test.tsx" "src/i18n/resources/zh-CN/workspace.json" "src/i18n/resources/zh-TW/workspace.json" "src/i18n/resources/en-US/workspace.json" "src/i18n/resources/ja-JP/workspace.json" "src/i18n/resources/ko-KR/workspace.json" "docs/roadmap/i18n/implementation-progress.md"` 通过。

## 2026-05-23：P2 browser profile 启动环境文案收口

本轮完成：

- `src/features/browser-runtime/BrowserProfileManager.tsx` 仍沿用现有启动环境 / 附着模式逻辑，但 `workspace.browserProfile.bridge.unavailableDescription` 与 `workspace.browserProfile.notice.existingSessionEnvironment` 已从泛化的 `language` 收敛到 `browser locale` 和 `Accept-Language`，避免把浏览器侧环境描述成 Lime UI 语言。
- 5 个 locale 的 `workspace.browserProfile.*` 文案同步更新，明确附着当前 Chrome 不会应用启动级浏览器 locale / Accept-Language 配置，需要这些能力时应切到托管浏览器模式。
- `BrowserProfileManager.test.tsx` 补了中英双语回归，锁住浏览器 profile 页里“附着模式”和“启动环境”之间的语义边界。

验证：

- `npm test -- "src/components/settings-v2/general/appearance/index.test.tsx"` 通过，覆盖设置页界面语言与回复语言边界回归。
- `npm run i18n:check` 通过，确认 5 个 locale、13 个 namespace 的资源结构仍保持一致。
- `git diff --check -- "src/components/settings-v2/general/appearance/index.test.tsx" "src/i18n/resources/zh-CN/settings.json" "src/i18n/resources/zh-TW/settings.json" "src/i18n/resources/en-US/settings.json" "src/i18n/resources/ja-JP/settings.json" "src/i18n/resources/ko-KR/settings.json" "docs/roadmap/i18n/implementation-progress.md"` 通过。

## 2026-05-23：P2 sidebar account language entry 收口

本轮完成：

- `src/components/AppSidebar.tsx` 的账户区语言入口已从泛化 `language` 切换为 `interfaceLanguage`，菜单按钮、子菜单标题与切换文案都更明确地指向界面语言，而不是一个笼统的语言字段。
- 5 个 locale 的 `navigation.sidebar.account.language`、`selectLanguage` 与 `switchLanguage` 文案同步更新，避免侧边栏继续把界面语言说成泛化语言。
- `AppSidebar.test.tsx` 补了中英双语回归，锁住账户菜单里的语言入口与切换操作文案。

验证：

- `npm test -- "src/components/AppSidebar.test.tsx"` 通过，覆盖账户菜单语言入口与切换文案回归。
- `npm run i18n:check` 通过，确认 5 个 locale、13 个 namespace 的资源结构仍保持一致。
- `git diff --check -- "src/components/AppSidebar.tsx" "src/components/AppSidebar.test.tsx" "src/i18n/resources/zh-CN/navigation.json" "src/i18n/resources/zh-TW/navigation.json" "src/i18n/resources/en-US/navigation.json" "src/i18n/resources/ja-JP/navigation.json" "src/i18n/resources/ko-KR/navigation.json" "docs/roadmap/i18n/implementation-progress.md"` 通过。

## 2026-05-23：P2 settings appearance 界面语言边界收口

本轮完成：

- `src/components/settings-v2/general/appearance/index.tsx` 继续沿用现有外观设置结构，但界面语言摘要已从泛化 `Language` 改成 `UI`，语言说明也明确只控制界面显示，不影响回复语言、浏览器站点语言或内容产物目标语言。
- 5 个 locale 的 `settings.appearance.language.tip` 与 `settings.appearance.summary.language` 同步更新，把设置页里的界面语言和回复语言边界说清楚。
- `AppearanceSettings` 的测试补了语言说明和回复语言说明的 tooltip 回归，避免后续再把 UI 语言、Agent 回复语言和浏览器站点语言混成一个词。

验证：

- `npm test -- "src/components/settings-v2/general/appearance/index.test.tsx"` 通过，覆盖设置页界面语言与回复语言边界回归。
- `npm run i18n:check` 通过，确认 5 个 locale、13 个 namespace 的资源结构仍保持一致。
- `git diff --check -- "src/components/settings-v2/general/appearance/index.test.tsx" "src/i18n/resources/zh-CN/settings.json" "src/i18n/resources/zh-TW/settings.json" "src/i18n/resources/en-US/settings.json" "src/i18n/resources/ja-JP/settings.json" "src/i18n/resources/ko-KR/settings.json" "docs/roadmap/i18n/implementation-progress.md"` 通过。

## 2026-05-23：P2 settings language hints 收口

本轮完成：

- `settings.language.*.hint` 里的旧泛化“语言”提示已改成“界面语言”提示，明确这些选项是 UI language 相关建议，不是泛指所有 language-like 字段。
- 5 个 locale 的系统语言提示同步收紧，`auto` 也改成跟随系统界面语言，避免再次把界面语言、回复语言和站点语言混为一谈。

验证：

- `npm test -- "src/components/settings-v2/general/appearance/index.test.tsx"` 通过，覆盖设置页界面语言与回复语言边界回归。
- `npm run i18n:check` 通过，确认 5 个 locale、13 个 namespace 的资源结构仍保持一致。
- `git diff --check -- "src/i18n/resources/zh-CN/settings.json" "src/i18n/resources/zh-TW/settings.json" "src/i18n/resources/en-US/settings.json" "src/i18n/resources/ja-JP/settings.json" "src/i18n/resources/ko-KR/settings.json" "docs/roadmap/i18n/implementation-progress.md"` 通过。

## 2026-05-23：P2 startup / quick access language cleanup

本轮完成：

- `common.startupLoading.description` 已改成“界面语言设置”而不是泛化“语言设置”，让启动页不再把 UI language 和其他 language-like 场景混成一处。
- 设置首页的外观快速入口摘要也从 `Theme, language, and sound cues` 收紧成 `Theme, interface language, and sound cues`，避免入口概览继续误导成笼统语言配置。
- `loadNamespace.test.ts` 补了 `common.startupLoading.description` 的中英精确回归，`settings/home/index.test.tsx` 同步改了快速入口摘要断言。

验证：

- `npm test -- "src/i18n/__tests__/loadNamespace.test.ts" "src/components/settings-v2/home/index.test.tsx"` 通过，覆盖启动文案与设置首页快速入口摘要回归。
- `npm run i18n:check` 通过，确认 5 个 locale、13 个 namespace 的资源结构仍保持一致。
- `git diff --check -- "src/i18n/resources/zh-CN/common.json" "src/i18n/resources/zh-TW/common.json" "src/i18n/resources/en-US/common.json" "src/i18n/resources/ja-JP/common.json" "src/i18n/resources/ko-KR/common.json" "src/i18n/resources/zh-CN/settings.json" "src/i18n/resources/zh-TW/settings.json" "src/i18n/resources/en-US/settings.json" "src/i18n/resources/ja-JP/settings.json" "src/i18n/resources/ko-KR/settings.json" "src/components/settings-v2/home/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "docs/roadmap/i18n/implementation-progress.md"` 通过。

## 2026-05-23：P3 i18n check 接入统一质量入口

本轮完成：

- `package.json` 新增 `i18n:check`、`i18n:check:fix`、`i18n:check:verbose`，复用现有 `detect-translations*`，不引入平行脚本。
- `scripts/quality-task-planner.mjs` 新增 i18n 任务判断：resources、i18n loader / locale registry / 类型绑定、翻译检查脚本和本地质量入口变更时触发。
- `scripts/local-ci.mjs` 在任务命中时执行 `npm run i18n:check`，让 `verify:local` 覆盖本地化资源结构风险。
- `scripts/quality-task-selector.mjs` 的 GitHub 格式输出新增 `i18n` 字段，便于 CI 或人工审阅看到该风险分类。
- `scripts/quality-task-planner.test.ts` 补充 i18n resource 改动应触发翻译资源结构校验的回归。

## 2026-05-23：P3 hard-coded 文案扫描原型

本轮继续完成：

- `scripts/i18n-hardcoded-check.ts` 新增轻量硬编码扫描原型，先只检查当前变更的前端源码文件，识别 JSX 里直接写入的用户可见中文与 visible prop literal。
- `scripts/i18n-hardcoded-check.test.ts` 补充正向与忽略路径回归，验证 i18n resources 与 test files 不会进入扫描结果。
- `package.json` 新增 `i18n:scan` / `i18n:scan:json` 入口，便于本地与后续 CI 复用。
- `scripts/quality-task-planner.mjs` / `scripts/quality-task-selector.mjs` 暴露 `i18nHardcoded` 风险位。
- `scripts/local-ci.mjs` 在前端源码变更命中时自动执行 `npm run i18n:scan -- --files ...`，但仅扫描变更文件，不把历史代码一次性拉进阻断面。

验证：

- `npm test -- "scripts/i18n-hardcoded-check.test.ts" "scripts/quality-task-planner.test.ts" "scripts/detect-missing-translations.test.ts"` 通过。
- `npm run verify:tasks -- --format json` 能看到 `i18nHardcoded` 分类。
- `node_modules/.bin/tsx scripts/i18n-hardcoded-check.ts --format json --files <hardcoded fixture>` 会输出机器可消费 JSON，并在命中时以非零退出码结束。
- `npm run verify:local` 通过，确认本地质量入口和新扫描器接线正常。

## 2026-05-23：legacy patch coverage 命名收口

本轮完成：

- legacy patch 覆盖测试已重命名为 `legacyPatchCoverage.test.ts`，避免 current resources 覆盖率与 legacy patch 覆盖率混在同一个测试名下。

## 2026-05-23：P3 i18n check JSON 模式

本轮完成：

- `scripts/detect-missing-translations.ts` 新增 `--format json`，CLI 可以输出结构化翻译检查报告。
- JSON 报告包含 schema version、resources 位置、source locale、locale / namespace 列表、source key 数量、issue 汇总与完整 issues 结构，方便后续质量报告和 CI 消费。
- `package.json` 新增 `i18n:check:json` 与 `detect-translations:json` 入口，复用同一脚本，不再额外派生别的逻辑分支。
- `scripts/detect-missing-translations.test.ts` 增补 JSON 格式化与 CLI 回归，覆盖结构化输出和非零退出码。

验证：

- `npm test -- "scripts/detect-missing-translations.test.ts" "scripts/i18n-hardcoded-check.test.ts" "scripts/quality-task-planner.test.ts"` 通过。
- `npm run i18n:check:json` 可正常输出结构化 JSON 报告。

## 2026-05-23：P3 hard-coded 文案扫描 AST 收口

本轮完成：

- `scripts/i18n-hardcoded-check.ts` 从 regex 扫描升级为 AST 扫描，只收 JSX 文本节点、JSX 子节点里的直接字面量表达式，以及 `title` / `label` / `placeholder` 等可见属性字面量。
- 扫描器排除了 `t(...)`、普通逻辑字符串、测试文件和 i18n 资源文件，减少了对非 UI 文本的误报。
- `scripts/i18n-hardcoded-check.test.ts` 增补 AST 级回归，覆盖 JSX 文本、直接字面量表达式、可见属性、资源 / 测试 / 普通逻辑字符串忽略场景。

验证：

- `npm test -- "scripts/i18n-hardcoded-check.test.ts" "scripts/quality-task-planner.test.ts" "scripts/detect-missing-translations.test.ts"` 通过。
- `npm run verify:local` 通过，说明 AST 扫描器与统一质量入口保持兼容。

## 2026-05-23：P3 unused key 候选报告

本轮完成：

- `scripts/i18n-unused-key-check.ts` 新增 source locale unused key 候选分析，默认从 `src/i18n/resources/zh-CN/*.json` 读取 key，并扫描 `src/**/*.{ts,tsx,js,jsx}` 的字符串字面量引用。
- 扫描默认排除测试文件、`src/i18n/resources/` 与 `src/i18n/legacy-patch/`，避免把测试 fixture、资源自身和迁移兜底层误计为 current 生产引用。
- `package.json` 新增 `i18n:unused` / `i18n:unused:json`，输出 text 或 JSON 报告；`--check` 可用于后续治理门禁，但当前不接入 `verify:local`。
- `--protected-prefix` 支持显式保护动态 key prefix；同时脚本开始从 `t(\`...\${...}...\`)` 模板字符串推断动态 key pattern，并把匹配 key 归入 protected，避免把显式动态访问误报成 unused。

当前报告数据：

- `npm run i18n:unused:json` 可输出 `lime.i18n.unusedKeyReport.v1`。
- 当前口径：`resourceKeyCount=7318`、`referencedKeyCount=6317`、`unusedKeyCount=832`、`protectedKeyCount=169`、`dynamicKeyPatternCount=27`、`scannedFileCount=1467`。
- 这 832 个 key 只是治理候选，不是可直接删除清单；其中剩余的主要是间接 lookup、未覆盖访问模式和旧路线图资源，需要后续按 namespace 分批确认。

后续进展：

- 新的动态 key pattern 推断已接入测试覆盖，`npm run i18n:unused:json` 已开始输出 `dynamicKeyPatterns`，并在命中的模板键上产生 `protectedKeys`。

验证：

- `npm test -- "scripts/i18n-unused-key-check.test.ts" "scripts/detect-missing-translations.test.ts" "scripts/i18n-hardcoded-check.test.ts" "scripts/quality-task-planner.test.ts"` 通过。
- `npm run i18n:unused:json` 通过并输出结构化候选报告。

## 下一刀候选

1. 按 namespace 复核 `i18n:unused:json` 的候选结果，先识别动态 key 与间接 lookup，再决定是否沉淀 `--protected-prefix` 默认清单。
2. 继续评估官方 `i18next-cli` 是否适合作为后续 extraction / lint / type generation 的统一工具链。
3. 把 legacy Patch `no-hit` 报告、current 主路径依赖审计和删除条件收敛成可机械验证的退出门禁。

## 2026-05-23：glossary / PR 模板收口

本轮完成：

- 新增 `docs/roadmap/i18n/glossary.md`，把 P3 自动翻译、review、命名一致性和 namespace 约定所需的产品名、功能名、Agent 术语、Browser Runtime 术语、SceneApp 术语统一落盘。
- 新增 `.github/pull_request_template.md`，要求 PR 显式标注 i18n 影响、变更 namespace、术语对照和验证入口，避免后续翻译或资源变更只靠口头约定。

验证：

- `git diff --check -- "docs/roadmap/i18n/glossary.md" ".github/pull_request_template.md" "docs/roadmap/i18n/implementation-progress.md"` 通过。

## 2026-05-23：bundle 体积与 chunk 策略报告

本轮完成：

- `scripts/i18n-bundle-report.ts` 新增 bundle footprint 报告，按 current loader 的 core namespace 边界聚合 `common / navigation / settings / workspace / agent / errors`，并将未来非 core namespace 视为 lazy chunk 候选。
- `src/i18n/bundledNamespaceParts.ts` 作为纯数据源沉淀 core namespace 与 agent 资源分片规则；`src/i18n/loadNamespace.ts` 只负责运行时加载，不再承担规则定义。
- `package.json` 新增 `i18n:bundle-report` / `i18n:bundle-report:json`，`src/i18n/README.md` 记录了报告入口。
- 当前报告结果：`inlineGroupCount=6`、`lazyGroupCount=0`、`sourceLocaleFileCount=13`、`sourceLocaleKeyCount=7318`、`totalRawBytes=3374451`。

验证：

- `npm test -- "scripts/i18n-bundle-report.test.ts"` 通过。
- `npm run i18n:bundle-report:json` 可输出结构化 bundle footprint 报告。
- `npm run verify:local` 通过，确认 bundle 报告脚本与 `loadNamespace` 的边界调整未破坏本地质量入口。

## 2026-05-23：legacy Patch 退出门禁

本轮完成：

- `scripts/i18n-patch-retirement-gate.mjs` 新增组合门禁，统一消费 `.lime/i18n/patch-metrics-report.json` 与 `.lime/governance/legacy-surface-report.json`，只有当 Patch report 为 `no-hit` 且 legacy surface report 无违规引用时才通过。
- `package.json` 新增 `i18n:patch-retirement-gate` / `i18n:patch-retirement-gate:json`，`src/i18n/README.md` 记录了门禁入口和默认 artifact 路径。
- 组合门禁当前在真实 artifact 上通过：Patch `status=no-hit`、`retirementCandidate=true`、`totalMatchedSegments=0`、`totalReplacedNodes=0`、`totalRuns=17`；legacy surface `violationCount=0`。门禁仍会显式输出 `classificationDriftCandidateCount=23` 作为审阅信号，但不单独阻断本轮退出。

验证：

- `npm test -- "scripts/i18n-patch-retirement-gate.test.ts"` 通过。
- `node scripts/i18n-patch-retirement-gate.mjs --check --format json --patch-report .lime/i18n/patch-metrics-report.json --legacy-report .lime/governance/legacy-surface-report.json` 通过。
- `npm run governance:legacy-report -- --json --output .lime/governance/legacy-surface-report.json` 与 `node scripts/i18n-patch-metrics-report.mjs --input .lime/i18n/patch-metrics.json --format json --output .lime/i18n/patch-metrics-report.json` 生成当前 gate 依赖 artifact。

## 2026-05-23：unused key namespace 热点报告

本轮完成：

- `scripts/i18n-unused-key-check.ts` 新增 `namespaceSummaries`，把 unused / referenced / protected / total / unusedRatio 变成 namespace 级汇总，`i18n:unused:json` 和 text 报告都能直接复核热点桶。
- `scripts/i18n-unused-key-check.test.ts` 增补 namespace 热点、JSON 结构与 text 输出回归，避免后续只保留扁平候选列表。
- `src/i18n/README.md` 记录了热点报告入口，方便后续按桶 tightening protected prefixes 或拆 namespace。
- 当前热点结果：`agentRuntime` unused=368 / total=601，`agentSkills` unused=225 / total=980，`agentTeamWorkspace` unused=143 / total=404，`agent` unused=48 / total=587，`settings` unused=24 / total=2717，`workspace` unused=23 / total=871。

后续收紧：

- `scripts/i18n-unused-key-check.ts` 继续补齐文件内 `const` 字符串前缀推断，能识别 `agentChat.threadReliability.diagnostic.*` 这类 prefix helper，避免把同文件动态拼接误计为 unused。
- 当前复跑后，`protectedKeyCount` 从 169 提升到 354，`unusedKeyCount` 从 832 降到 647；`agentRuntime` 从 unused=368 / protected=0 调整到 unused=183 / protected=185，说明热点桶里有一半以上是可由动态前缀保护的 current 引用，而不是纯 dead key。

验证：

- `npm test -- "scripts/i18n-unused-key-check.test.ts"` 通过。
- `npx tsx scripts/i18n-unused-key-check.ts --format json` 可正常输出 `namespaceSummaries` 热点表。

## 2026-05-23：unused key 扫描器再收紧

本轮继续完成：

- `scripts/i18n-unused-key-check.ts` 继续补齐动态 key 推断，支持 `i18n.t(...)` 这类 property-call 形式，以及文件内 `const` 前缀 + 简单拼接表达式，避免把明确的 current 动态访问误计为 unused。
- 动态 key pattern 现在只保留首个动态槽之前的静态前缀，减少中间模板占位符后静态片段被错误算进 prefix 的情况。
- `scripts/i18n-unused-key-check.test.ts` 新增 property-call 回归，和 const 前缀动态拼接回归，锁住这次推断边界。

当前复跑结果：

- `protectedKeyCount=429`、`unusedKeyCount=572`、`dynamicKeyPatternCount=29`、`scannedFileCount=1468`。
- `agentRuntime` 从 `unused=183 / protected=185` 继续收紧到 `unused=108 / protected=260`，说明这轮修正继续剥离了热点桶里的假 unused。

验证：

- `npm test -- "scripts/i18n-unused-key-check.test.ts"` 通过。
- `npm run typecheck` 通过。
- `npx tsx scripts/i18n-unused-key-check.ts --format json` 可正常输出更新后的热点和保护统计。

## 2026-05-23：unused key 家族热点分桶

本轮继续完成：

- `scripts/i18n-unused-key-check.ts` 新增 `unusedKeyFamiliesByNamespace`，把 unused key 再按 namespace 内前缀家族聚合，JSON 与 text 报告都能直接看到可收口的家族桶。
- `scripts/i18n-unused-key-check.test.ts` 增补家族热点回归，锁住 JSON 结构与 text 报告输出，避免后续只能看到扁平 unused list。

当前真实热点家族：

- `agentSkills`：`curatedTask.templates.account-project-review`、`skills.workspace.managedJob`、`curatedTask.templates.daily-trend-briefing`、`curatedTask.templates.longform-multiplatform-rewrite`、`curatedTask.templates.script-to-voiceover`、`curatedTask.templates.social-post-starter`、`curatedTask.templates.viral-content-breakdown`、`skills.workspace.sidebar`、`skills.workspace.marketplace`、`skills.workspace.featured`。
- `agentTeamWorkspace`：`agentChat.agentUiProjection.eventType`、`agentChat.teamWorkspace.control`、`agentChat.agentUiProjection.control`、`agentChat.agentUiProjection.surface`、`agentChat.agentUiProjection.phase`、`agentChat.agentUiProjection.sourceType`、`agentChat.agentUiProjection.lane`、`agentChat.agentUiProjection.requestedFixStatus`。

验证：

- `npm test -- "scripts/i18n-unused-key-check.test.ts"` 通过。
- `npm run typecheck` 通过。
- `npx tsx scripts/i18n-unused-key-check.ts --format json` 可输出 `unusedKeyFamiliesByNamespace`。

## 2026-05-23：i18next-cli 工具链评估

本轮继续完成：

- 新增 `docs/roadmap/i18n/toolchain-evaluation.md`，把官方 `i18next-cli` 的定位、Lime 当前自研治理脚本的覆盖面，以及后续切换条件落成版本化工件。
- 结论收紧为：`i18next-cli` 适合作为后续统一工具链候选，但当前不能替换 Lime 现有的动态前缀保护、unused key 家族分桶和 Patch 退出门禁。

下一步：

- 继续保留当前 `i18n:*` 自研治理脚本为 current。
- 已补 `i18next-cli` parity benchmark，证据落在 `docs/roadmap/i18n/evidence/i18next-cli-parity-benchmark.json`。
- 后续如果要推进替换，只需要补动态 key 保护、unused family 分桶和 gate 对齐，再评估最薄的 `npm run i18n:check` 层。

benchmark 摘要：

- `status`: `exitCode=1`、`keysFound=1`、`namespacesFound=1`。
- `lint`: `exitCode=1`、`hardcodedIssueCount=1`。
- `extract --dry-run --ci`: `exitCode=1`、`updatedFileCount=4`。
- `types`: `exitCode=0`、`generatedResourcesFile=true`、`generatedI18nextTypes=true`。
- `detect-translations`: `exitCode=0`、`issueCount=0`、`sourceKeyCount=4`。
- `i18n-unused`: `exitCode=0`、`unusedKeyCount=1`、`protectedKeyCount=1`、`topNamespace=common`。

验证：

- `npm run i18n:toolchain-benchmark -- --output "docs/roadmap/i18n/evidence/i18next-cli-parity-benchmark.json"` 通过。
- `git diff --check` 通过。

## 2026-05-23：P2 AI response language 注入评估与前端 metadata 最薄接线

本轮继续完成：

- 新增 `docs/roadmap/i18n/response-language-injection-evaluation.md`，把 PRD P2 的 “AI response language 设置与 request metadata 注入” 先落成 Query Loop 边界评估，避免直接复用 UI `Config.language`。
- 读回 `docs/aiprompts/query-loop.md`、`docs/aiprompts/commands.md`、`src/components/agent/chat/utils/harnessRequestMetadata.ts`、`src/components/agent/chat/workspace/workspaceSendHelpers.ts`、`src-tauri/src/commands/aster_agent_cmd/runtime_turn.rs` 与 `src-tauri/crates/agent/src/turn_input_envelope.rs`，确认正确扩展点是 `request_metadata.harness.*`、`runtime_turn.rs` prompt augmentation 与 `TurnInputEnvelope` 快照。
- 结论收紧为：current 写入命名应使用 `agent_response_language`，不要写泛名 `language`；`response_language` 最多作为短期兼容读取 alias；`Config.language`、Browser Environment `Accept-Language`、Artifact / media `target_language` 与 ASR `language` 均不能直接复用。
- `src/components/agent/chat/utils/harnessRequestMetadata.ts` 已给 `BuildHarnessRequestMetadataOptions` 增加 `agentResponseLanguage?: string | null`，并在 harness metadata 中 current 写入 `agent_response_language`。
- `buildHarnessRequestMetadata()` 会兼容读取已有 `agent_response_language` / `agentResponseLanguage` / `response_language` / `responseLanguage`，但不会写入泛名 `language`，也不会从 UI locale 自动派生。
- `src/components/agent/chat/utils/harnessRequestMetadata.test.ts` 新增回归，锁住显式 `agentResponseLanguage` 优先级、alias 兼容和 current snake_case 写入。
- `src/components/settings-v2/general/appearance/index.tsx` 新增“回复语言”表单块，持久化到 `workspace_preferences.agent_response_language`；`AgentChatWorkspace` / `useWorkspaceSendActions` / `workspaceSendHelpers` / `useServiceModelsConfig` 全链路消费同一偏好并写入 `request_metadata.harness.agent_response_language`。
- `src/lib/api/appConfigTypes.ts` 与 `src-tauri/crates/core/src/config/types.rs` 已同步新增 `workspace_preferences.agent_response_language`，并将 workspace preferences schema_version 升到 3；Rust roundtrip 测试覆盖该字段。
- `src-tauri/src/commands/aster_agent_cmd/runtime_turn.rs` 新增 `ResponseLanguage` prompt stage，并把 `request_metadata.harness.agent_response_language` 注入到 system prompt；`src-tauri/crates/agent/src/turn_input_envelope.rs` 同步阶段枚举。
- `runtime_turn.rs` 新增 response language helper tests，覆盖显式 locale 与 `auto` 两条路径，确认 prompt 约束不会退回到 UI locale 派生。
- `src-tauri/crates/agent/src/session_execution_runtime.rs` 继续把 `harness.agent_response_language` 投影进 `recent_response_language`，让 evidence / replay / review 继续沿 `SessionExecutionRuntime` 这条现成 runtime 事实链观察该偏好。
- 下一刀实现顺序调整为：继续评估是否把 `agent_response_language` 暴露到更多设置入口，或者转去收紧其它 P2/P3 主缺口；避免继续扩散 schema。

验证：

- 本轮不新增命令、Bridge、mock、Rust schema 或用户可见 UI 文案。
- `npm test -- "src/components/agent/chat/utils/harnessRequestMetadata.test.ts"` 通过，覆盖 17 个用例。
- `npx eslint --max-warnings 0 "src/components/agent/chat/utils/harnessRequestMetadata.ts" "src/components/agent/chat/utils/harnessRequestMetadata.test.ts"` 通过。
- `npm run typecheck -- --pretty false` 通过。
- `cargo test --manifest-path "src-tauri/Cargo.toml" merge_system_prompt_with_response_language -- --nocapture` 通过，覆盖 2 个新 Rust 测试。
- `git diff --check -- "src/components/agent/chat/utils/harnessRequestMetadata.ts" "src/components/agent/chat/utils/harnessRequestMetadata.test.ts" "docs/roadmap/i18n/response-language-injection-evaluation.md" "docs/roadmap/i18n/implementation-progress.md"` 通过。

## 2026-05-23：P2 chrome relay 语言语义收口

本轮继续完成：

- `src/components/settings-v2/system/chrome-relay/index.tsx` 继续沿用现有 Chrome Relay 结构，但 Google Profile 的说明与使用步骤已把泛化 `language` 收紧为 `browser language`，避免再次把浏览器侧环境说成 Lime UI 语言。
- 5 个 locale 的 `settings.chromeRelay.main.engine.google.description` 与 `settings.chromeRelay.main.usage.step1.description` 同步更新，明确这里讲的是浏览器语言 / 地区 / 内容偏好，而不是界面语言或回复语言。
- `src/components/settings-v2/system/chrome-relay/index.test.tsx` 补了默认渲染回归，锁住这两句说明文案不会再回退成泛化 `language`。

验证：

- `npm test -- "src/components/settings-v2/system/chrome-relay/index.test.tsx"` 通过。
- `npm run i18n:check` 通过。
- `git diff --check` 通过。

## 2026-05-23：P3 unused key 默认动态前缀收口

本轮继续完成：

- `scripts/i18n-unused-key-check.ts` 现在内置默认 protected dynamic prefix 清单，把已确认的动态家族从 current unused 候选里分离出去，避免 `agentChat.agentUiProjection.*`、`agentChat.teamWorkspace.control.*`、`agentChat.threadReliability.*`、`curatedTask.templates.*` 与 `skills.workspace.*` 这类实际运行时家族继续被误报成 dead key。
- 默认保护清单只覆盖已经从 current 代码与热点报告里复核过的家族，不再把整批 source locale key 留给临时命令参数手动保护。
- `scripts/i18n-unused-key-check.test.ts` 补了默认动态家族回归，锁住 `agentChat.agentUiProjection.eventType.*` 这类不显式传 `--protected-prefix` 也应自动归入 protected 的行为。
- 当前复跑结果：`protectedKeyCount=852`、`unusedKeyCount=156`；`agentTeamWorkspace` 与 `agentRuntime` 已分别收敛到 `unused=0`，`agentSkills` 收敛到 `unused=59`。

验证：

- `npm test -- "scripts/i18n-unused-key-check.test.ts"` 通过。
- `npm run i18n:unused:json` 通过并继续输出结构化热点报告。

## 2026-05-24：P3 agentSkills dead key 收口

本轮继续完成：

- 从 `src/i18n/resources/*/agentSkills.json` 删除了 8 个确认无 current 代码引用的 dead key：`sceneAppExecutionSummary.orchestration.blockedReason`、`sceneAppExecutionSummary.runtimePack.title`、`skills.workspace.header.createWithLime`、`skills.workspace.header.viewAll`、`skills.workspace.installedSkill.action.exportTitle`、`skills.workspace.installedSkill.entryBannerWithReplay`、`skills.workspace.reviewBanner.action`、`skills.workspace.runtimeEnable.prompt.intro`。
- 同步移除了 `src/i18n/__tests__/loadNamespace.test.ts` 和 `src/i18n/__tests__/types.test.ts` 里对应的测试锚点，避免测试继续把这些 dead key 当成活契约。
- 当前 `agentSkills` 资源口径已经收敛到 `unusedKeyCount=0`，`resourceKeyCount=921`。

验证：

- `npm run i18n:check` 通过。
- `npm run i18n:unused:json` 通过，`agentSkills.unusedKeyCount` 从 `8` 降到 `0`，全量 `unusedKeyCount` 降到 `97`。
- `npm test -- "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过。

## 2026-05-24：P3 common / navigation / settings dead key 收口

本轮继续完成：

- 从 `src/i18n/resources/*/{common,navigation,settings}.json` 删除了 6 个确认无 current 代码引用的 dead key：`common.reload`、`navigation.sidebar.account.language`、`settings.tab.skills`、`settings.layout.loading.skills`、`settings.voice.shortcut.status.translatePending`、`settings.home.current.skills.title`。
- 这批 key 只在资源里残留，没有出现在 current `src` 源码引用面；其中 `navigation.sidebar.account.language` 已被更明确的 `selectLanguage` / `switchLanguage` 语义替代，`settings.tab.skills` 与 `settings.home.current.skills.title` 也没有 current 消费面。
- 目前 `agentSkills` 仍保持 `unusedKeyCount=0`，这次继续把 `common` / `navigation` / `settings` 的资源面清了一小批，没有扩大任何 namespace 的动态保护范围。

验证：

- `npm run i18n:check` 通过，`sourceKeys` 从 `7272` 降到 `7266`。
- `npm run i18n:unused:json` 通过，全量 `unusedKeyCount` 从 `97` 降到 `91`。
- `git diff --check` 通过。

## 2026-05-24：P3 settings dead key 进一步清零

本轮继续完成：

- 从 `src/i18n/resources/*/settings.json` 删除了 21 个继续确认无 current 代码引用的 dead key，覆盖 `settings.automation.focus.*`、`settings.experimental.message.shortcutUpdated`、`settings.home.current.actions.skills`、`settings.home.current.skills.description`、`settings.home.quickAccess.skills.*` 与 `settings.voice.shortcut.status.translate*` 这一批残留。
- 这批 key 在 `src` 源码中已经没有消费面，继续保留只会把 settings 桶的 unused 热点拖长；删除后，`settings` namespace 彻底清零。
- 当前 `common` / `navigation` / `settings` 这批常见 UI namespace 的 residual dead key 继续收束，当前 unused 报表里 settings 已经不再出现。

验证：

- `npm run i18n:check` 通过，`sourceKeys` 从 `7266` 降到 `7246`。
- `npm run i18n:unused:json` 通过，全量 `unusedKeyCount` 从 `91` 降到 `71`，`settings.unusedKeyCount=0`。
- `git diff --check` 通过。

## 2026-05-24：P3 unused key 全量清零

本轮继续完成：

- 从 `src/i18n/resources/*/agent.json` 删除了 48 个确认无 current 代码引用的 `agentApp.apps.*` dead key，覆盖旧 App Center / runtime surface 残留的表格、详情、状态、安装入口与运行分区文案。
- `workspace.document.editor.slashCommand.*` 不是 dead key，而是 `slashCommandItems.tsx` 通过模板 key 动态访问；`scripts/i18n-unused-key-check.ts` 已把这个前缀加入默认动态保护清单，避免把文档编辑器 slash command 资源误判为 unused。
- `scripts/i18n-unused-key-check.test.ts` 补了默认保护 `workspace.document.editor.slashCommand.*` 的回归，锁住这类动态资源不会再次进入 dead key 候选。
- 已刷新 `docs/roadmap/i18n/evidence/source-locale-export.json` 与 `docs/roadmap/i18n/evidence/translation-pr-pack.json`，当前 source export / PR pack 均按 `sourceKeyCount=7198` 生成，translation PR pack 仍为 `proposedEntryCount=0`。
- 当前 `i18n:unused:json` 全量收敛为 `unusedKeyCount=0`；`agent`、`workspace`、`common`、`navigation`、`settings` 与 `agentSkills` 均为 `unusedKeyCount=0`。

验证：

- `npm test -- "scripts/i18n-unused-key-check.test.ts"` 通过。
- `npm run i18n:check` 通过，`sourceKeys` 从 `7246` 降到 `7198`。
- `npm run i18n:unused:json` 通过，全量 `unusedKeyCount` 从 `71` 降到 `0`，`protectedKeyCount` 从 `852` 升到 `875`。
- `npm run i18n:source-export:json -- --output "docs/roadmap/i18n/evidence/source-locale-export.json"` 通过。
- `npm run i18n:translation-pr-pack:json -- --output "docs/roadmap/i18n/evidence/translation-pr-pack.json"` 通过。
- `npm test -- "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，确认 dead key 测试锚点已同步移除。
- `git diff --check` 通过。

## 2026-05-24：P3 hardcoded toast 收口与扫描门禁修复

本轮继续完成：

- 修复了 `scripts/i18n-hardcoded-check.ts` 的两处门禁问题：`--files` 路径匹配现在能正确识别 `src/components/` 前缀，`--format json` 不再被误当成扫描文件；同时补上对 `<kbd>K</kbd>` 这类单字符快捷键标记的豁免，避免把无语义快捷键误报成硬编码文案。
- 将 `src/components/agent/chat/AgentChatWorkspace.tsx` 里“无法找到上下文详情”与上下文来源 / 估算 token 的 toast 文案资源化，统一接入 `agent` namespace 的 `generalWorkbench.context.detail.*` / `generalWorkbench.context.source.*` key。
- 补齐 `src/i18n/resources/*/agent.json` 的五语言翻译，并同步更新 `src/i18n/__tests__/loadNamespace.test.ts` 与 `src/i18n/__tests__/types.test.ts` 的契约锚点。

验证：

- `npm test -- "scripts/i18n-hardcoded-check.test.ts"` 通过。
- `npm run i18n:scan:json -- --files "src/components/AppSidebar.tsx" "src/components/agent/chat/AgentChatWorkspace.tsx" "src/components/agent/chat/utils/harnessRequestMetadata.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.ts" "src/components/agent/chat/workspace/workspaceSendHelpers.ts" "src/components/settings-v2/general/appearance/index.tsx"` 通过，6 个真实变更文件的 findingCount 为 `0`。
- `npm run i18n:check` 通过，`sourceKeys` 从 `7198` 增至 `7200`，覆盖仍为 `100%`。
- `npm test -- "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过。
- `npm run i18n:unused:json` 通过，`unusedKeyCount` 仍为 `0`。
- `npm run i18n:source-export:json -- --output "docs/roadmap/i18n/evidence/source-locale-export.json"` 通过。
- `npm run i18n:translation-pr-pack:json -- --output "docs/roadmap/i18n/evidence/translation-pr-pack.json"` 通过。

## 2026-05-24：StartupLoadingScreen 英文资源失配收口

本轮继续完成：

- 将 `src/i18n/StartupLoadingScreen.test.tsx` 的英文断言改为直接读取 `src/i18n/resources/en-US/common.json` 中的 `common.startupLoading.description` 事实源，避免测试继续持有过期的旧句子。
- 当前 `StartupLoadingScreen` 仍通过 `common` namespace 的 `common.startupLoading.title` / `common.startupLoading.description` 读取启动屏文案，组件本身没有再散落硬编码 presentation。

验证：

- `npm test -- "src/i18n/StartupLoadingScreen.test.tsx"` 通过。
- `npm run i18n:check` 通过。
- `npm run typecheck` 通过。
- `git diff --check` 通过。
- `npm run verify:local` 已重新跑到 Rust 单测阶段，但当前工作区仍有 4 个与本刀无关的 Rust 失败：`commands::aster_agent_cmd::tool_runtime::connector_tools::tests::agent_app_connector_fixture_executes_host_managed_mutation`、`commands::skill_cmd::tests::test_rename_user_local_skill_dir_moves_skill_directory`、`commands::skill_cmd::tests::test_replace_user_local_skill_package_replaces_existing_tree`、`dev_bridge::dispatcher::tests::skill_execution_catalog_commands_are_bridged`；这些失败不来自本次 i18n 资源修复，暂不在本刀扩大写集。

## 2026-05-26：P2 media task content / ASR language 边界回归

本轮继续完成：

- `audio_generate` 任务创建时会把显式 `target_language` 同步写入顶层 payload 与 pending `audio_output` 摘要；后续 failed / completed `audio_output` 继续沿同一任务 payload 复制该内容目标语言，避免 evidence / task preview 只能看到顶层字段。
- OpenAI-compatible audio generation 回归改为中文 source text + `target_language: "en-US"`，断言 provider instruction 与 completed `audio_output.target_language` 都使用显式内容目标语言，而不是 UI locale 或历史中文默认。
- `transcription_generate` 回归补强 `language` 语义：创建态 transcript 保存显式 ASR language；执行态 `language: "auto"` 不会作为 provider multipart `language` 参数发送，完成态 transcript language 以 provider 返回的 `"en"` 为准。
- `src/lib/tauri-mock/mediaTaskMocks.ts` 同步补齐 mock `audio_output.voice_style` / `target_language`，让前端 DevBridge / mock 视图与 Rust task artifact 摘要保持同构。
- 重新刷新 `docs/roadmap/i18n/evidence/language-boundary-report.json` 与 `docs/roadmap/i18n/evidence/content-target-language-boundary-report.json`；当前全量报告为 `entryCount=1999`、`unknownLanguageLike=97`，聚焦报告为 `contentTargetLanguage=444`，其中 `media_task_cmd.rs` 作为 media task 热点为 57 个 marker。

验证：

- `cargo test --manifest-path "src-tauri/Cargo.toml" create_audio_generation_task_artifact_inner_should_write_voice_contract_payload` 通过。
- `cargo test --manifest-path "src-tauri/Cargo.toml" complete_audio_generation_task_artifact_inner_should_write_audio_output_result`、`execute_audio_generation_task_should_mark_provider_resolver_unavailable_without_fabricated_audio`、`execute_audio_generation_task_with_openai_compatible_provider_should_write_audio_output` 通过。
- `cargo test --manifest-path "src-tauri/Cargo.toml" create_transcription_task_artifact_inner_should_write_audio_transcription_contract_payload`、`execute_audio_transcription_task_with_openai_compatible_provider_should_write_transcript_output` 通过。
- `npm test -- "src/lib/tauri-mock/core.test.ts" "src/lib/api/mediaTasks.test.ts"`、`npm run typecheck -- --pretty false`、`npm run i18n:check`、`npm run test:contracts` 通过。
- `npm run i18n:language-boundary-report:json -- --category contentTargetLanguage --output "docs/roadmap/i18n/evidence/content-target-language-boundary-report.json"` 与全量 `npm run i18n:language-boundary-report:json -- --output "docs/roadmap/i18n/evidence/language-boundary-report.json"` 通过。

## 2026-05-26：P3 language boundary unknown 收敛

本轮继续完成：

- `scripts/i18n-language-boundary-report.ts` 补充 context-aware 分类规则，把此前泛名 `language` 误报中的 code fence / Artifact preview、transcription task preview、ASR provider、Browser language、i18n mock、Knowledge metadata、Agent response language guard 与 service skill 语言类 ID 分别归回 `codeLanguage`、`contentTargetLanguage`、`asrLanguage`、`browserEnvironmentLanguage`、`uiLocale` 与 `agentResponseLanguage`。
- `scripts/i18n-language-boundary-report.test.ts` 新增回归，锁住 code block handler、transcription preview、response language、browser language 与 i18n `getFixedT(instance.language)` 这些高频上下文不再进入 unknown。
- 重新刷新 `docs/roadmap/i18n/evidence/language-boundary-report.json` 与 `docs/roadmap/i18n/evidence/content-target-language-boundary-report.json`；当前全量报告保持 `entryCount=1999`，`unknownLanguageLike` 从 97 收敛到 1，唯一剩余项是 `src/lib/model/oemCloudModelMetadata.ts` 的 `"vision-language"` 模型能力别名，不是 UI locale / 自然语言偏好；聚焦 content target 报告为 `contentTargetLanguage=428`。

验证：

- `npm test -- "scripts/i18n-language-boundary-report.test.ts"` 通过。
- `npm run i18n:language-boundary-report:json -- --output "docs/roadmap/i18n/evidence/language-boundary-report.json"` 通过。
- `npm run i18n:language-boundary-report:json -- --category contentTargetLanguage --output "docs/roadmap/i18n/evidence/content-target-language-boundary-report.json"` 通过。

## 2026-05-26：P3 Patch retirement gate 结构化证据

本轮继续完成：

- `scripts/i18n-patch-retirement-gate.mjs` 的输出新增 `schemaVersion=lime.i18n.patchRetirementGate.v1`、`generatedAt` 与 `advisoryIssues`，让 Patch 退出门禁 evidence 可被后续 CI / PR 审阅稳定消费。
- gate 仍只把 Patch 非 `no-hit`、`retirementCandidate=false`、threshold issue 和 legacy violation 作为阻断项；legacy classification drift / zero-reference 候选进入 advisory，不阻塞 DOM Patch no-hit 退出，但会在报告中显式提示。
- 新增 evidence `docs/roadmap/i18n/evidence/patch-retirement-gate-report.json`；当前门禁 `retirementReady=true`，Patch 报告 `status=no-hit`、`retirementCandidate=true`、`totalRuns=19`、`totalMatchedSegments=0`、`totalReplacedNodes=0`，legacy report `violationCount=0`、`zeroReferenceCandidateCount=0`，同时提示 `classificationDriftCandidateCount=26` 需要按治理计划继续收口。

验证：

- `npm test -- "scripts/i18n-patch-retirement-gate.test.ts"` 通过。
- `npm run i18n:patch-retirement-gate:json -- --output "docs/roadmap/i18n/evidence/patch-retirement-gate-report.json"` 通过。
- `npm run i18n:patch-retirement-gate -- --check` 通过。

## 2026-05-26：P3 legacy classification drift false advisory 收口

本轮继续完成：

- `scripts/lib/legacy-surface-report-summary.mjs` 修正 classification drift 判定：当 surface 已被治理目录册明确标为 `dead`，且扫描状态为“已删除”或“零引用”时，视为已完成 dead 收口，不再误进入 `classificationDriftCandidates`；`dead-candidate` 仍保持原有非漂移候选口径。
- `scripts/lib/legacy-surface-report-summary.test.ts` 增加 `dead-monitor` 回归，锁住 `classification: "dead"` + 零引用不会被当成分类漂移，避免已下线 surface 继续制造 patch retirement gate advisory 噪声。
- 使用 `npm run governance:legacy-report -- --json --output ".lime/governance/legacy-surface-report.json"` 刷新 legacy report 事实源；当前 summary 为 `zeroReferenceCandidates=0`、`classificationDriftCandidates=0`、`violations=0`。
- 重新刷新 `docs/roadmap/i18n/evidence/patch-retirement-gate-report.json`；当前 Patch gate `retirementReady=true`，Patch 报告仍为 `status=no-hit`、`retirementCandidate=true`、`totalRuns=19`、`totalMatchedSegments=0`、`totalReplacedNodes=0`，legacy 指标已变为 `classificationDriftCandidateCount=0`、`violationCount=0`、`zeroReferenceCandidateCount=0`，`advisoryIssues=[]`。

验证：

- `npm test -- "scripts/lib/legacy-surface-report-summary.test.ts"` 通过。
- `npm run governance:legacy-report -- --json --output ".lime/governance/legacy-surface-report.json"` 通过并刷新治理 evidence。
- `npm run i18n:patch-retirement-gate:json -- --output "docs/roadmap/i18n/evidence/patch-retirement-gate-report.json"` 通过。
- `npm run i18n:patch-retirement-gate -- --check` 通过，输出 `classificationDriftCandidates=0`、`问题: 无`、`提示: 无`。
- `npm run i18n:check` 通过，当前 `sourceKeys=7493`、coverage `100.0%`。
- 定向 `git diff --check` 通过。

## 2026-05-26：P3 translation coverage evidence 可落盘刷新

本轮继续完成：

- `scripts/detect-missing-translations.ts` 补齐 `--output <path>`，使 `npm run i18n:check:json -- --output "docs/roadmap/i18n/evidence/translation-coverage-report.json"` 能直接生成版本化 coverage evidence，不再依赖 stdout 重定向或手工复制。
- `scripts/detect-missing-translations.test.ts` 增加 CLI `--output` 回归，锁住结构化 JSON 报告写入文件且不污染 stdout。
- 刷新 `docs/roadmap/i18n/evidence/translation-coverage-report.json`、`docs/roadmap/i18n/evidence/source-locale-export.json` 与 `docs/roadmap/i18n/evidence/translation-pr-pack.json`；当前三份证据统一到 `sourceKeyCount=7493`、`namespaceCount=13`，translation coverage `hasIssues=false`、`missingKeyCount=0`、`extraKeyCount=0`、coverage `100.0%`，translation PR pack `proposedEntryCount=0`。
- `npm run i18n:unused:json -- --check` 当前也保持 `unusedKeyCount=0`，说明本轮刷新没有把新资源面变成 dead key 积压。

验证：

- `npm test -- "scripts/detect-missing-translations.test.ts"` 通过。
- `npm run i18n:check:json -- --output "docs/roadmap/i18n/evidence/translation-coverage-report.json"` 通过。
- `npm run i18n:source-export:json -- --output "docs/roadmap/i18n/evidence/source-locale-export.json"` 通过。
- `npm run i18n:translation-pr-pack:json -- --output "docs/roadmap/i18n/evidence/translation-pr-pack.json"` 通过。
- `npm run i18n:unused:json -- --check` 通过，`unusedKeyCount=0`。

## 2026-05-27：P2 code runtime 工作台导轨 / 审阅摘要五语言回归

本轮继续完成：

- `src/components/agent/chat/components/CodeWorkbenchGuide.tsx` 的 code runtime 工作台导轨已走 `agentChat.harness.codeWorkbench.*` namespace，覆盖权限确认、文件写入、变更复核、工具输出和运行态五个阶段的标题、说明、主操作和指标。
- 快照回滚提示只在真实 file checkpoint 存在且当前阶段需要复核文件变更 / 输出时展示，避免权限确认阶段提前给出误导性回滚信号。
- `src/components/agent/chat/components/CodeReviewSummaryPanel.tsx` 的代码审阅摘要已走 `agentChat.harness.codeReview.*` namespace，覆盖文件变更、测试 / 工具输出、快照入口和审阅 footer。
- `WorkspaceHarnessDialogs` 的 code_orchestrated 弹窗补了英文界面回归，证明新增导轨在真实弹窗入口下使用 `agent` namespace 文案，不依赖 legacy DOM Patch。
- `loadNamespace.test.ts` 与 `types.test.ts` 增加 code workbench / code review key 哨兵，确保五语言资源结构和 i18next 类型绑定继续覆盖这组新 key。

验证：

- `npm test -- "src/components/agent/chat/components/CodeWorkbenchGuide.test.tsx" "src/components/agent/chat/components/CodeReviewSummaryPanel.test.tsx" "src/components/agent/chat/workspace/WorkspaceHarnessDialogs.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 5 个文件、16 个用例。
- `npx eslint --max-warnings 0 "src/components/agent/chat/components/CodeWorkbenchGuide.tsx" "src/components/agent/chat/components/CodeWorkbenchGuide.test.tsx" "src/components/agent/chat/components/CodeReviewSummaryPanel.tsx" "src/components/agent/chat/components/CodeReviewSummaryPanel.test.tsx" "src/components/agent/chat/workspace/WorkspaceHarnessDialogs.tsx" "src/components/agent/chat/workspace/WorkspaceHarnessDialogs.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过。
- `npm run i18n:check` 通过，当前 `sourceKeys=7549`、coverage `100.0%`。
- `npm run i18n:unused -- --check` 通过，当前 `unused=0`。
- `npm run i18n:scan -- --files "src/components/agent/chat/components/CodeWorkbenchGuide.tsx" "src/components/agent/chat/components/CodeReviewSummaryPanel.tsx" "src/components/agent/chat/workspace/WorkspaceHarnessDialogs.tsx"` 通过，当前变更文件硬编码用户可见文案 `findings=0`。

## 2026-05-27：P3 translation evidence 跟随 code runtime 资源刷新

本轮继续完成：

- 刷新 `docs/roadmap/i18n/evidence/translation-coverage-report.json`、`docs/roadmap/i18n/evidence/source-locale-export.json` 与 `docs/roadmap/i18n/evidence/translation-pr-pack.json`，让 P3 版本化 evidence 跟随 code runtime 工作台导轨 / 审阅摘要五语言资源。
- 三份 evidence 当前统一到 `sourceKeyCount=7549`、`namespaceCount=13`；translation coverage 继续保持 `hasIssues=false`，translation PR pack 继续保持 `proposedEntryCount=0`。
- 这条证据把 PRD P3 “source locale 导出 / 覆盖率报告 / 翻译 PR pack 可审阅”重新对齐到当前 `src/i18n/resources` 事实源，避免路线图证据停留在旧的 `7493` key 口径。

验证：

- `npm run i18n:check:json -- --output "docs/roadmap/i18n/evidence/translation-coverage-report.json"` 通过。
- `npm run i18n:source-export:json -- --output "docs/roadmap/i18n/evidence/source-locale-export.json"` 通过。
- `npm run i18n:translation-pr-pack:json -- --output "docs/roadmap/i18n/evidence/translation-pr-pack.json"` 通过。

## 2026-05-27：P3 translation evidence 内容漂移重刷

本轮继续完成：

- 重新生成 `docs/roadmap/i18n/evidence/source-locale-export.json` 与 `docs/roadmap/i18n/evidence/translation-pr-pack.json`，对齐当前 `src/i18n/resources` 里的 code review metric 文案事实源。
- 当前三份 P3 translation evidence 仍统一为 `sourceKeyCount=7549`、`namespaceCount=13`；coverage 保持 `hasIssues=false`，translation PR pack 保持 `proposedEntryCount=0`。
- 本轮只修正 source export / PR pack 的原文内容与 raw bytes 漂移，没有引入新的 locale key，也没有扩大 legacy Patch 兜底范围。

验证：

- `npm run i18n:check:json -- --output "docs/roadmap/i18n/evidence/translation-coverage-report.json"` 通过。
- `npm run i18n:source-export:json -- --output "docs/roadmap/i18n/evidence/source-locale-export.json"` 通过。
- `npm run i18n:translation-pr-pack:json -- --output "docs/roadmap/i18n/evidence/translation-pr-pack.json"` 通过。
- `npm run i18n:check` 通过，当前 `sourceKeys=7549`、coverage `100.0%`。
- `npm run i18n:unused -- --check` 通过，当前 `unused=0`。
- `npm run verify:local` 通过，当前写集触发 app version、i18n 结构、unused key、lint、typecheck 与 Vitest smart 61 批次。

## 2026-05-27：P3 GUI smoke Patch 退出门禁证据刷新

本轮继续完成：

- 复用本轮已结束的 `npm run verify:gui-smoke -- --timeout-ms 600000` 产物，刷新 `docs/roadmap/i18n/evidence/patch-retirement-gate-report.json`。
- 最新 `.lime/i18n/patch-metrics-report.json` 显示 `status=no-hit`、`retirementCandidate=true`、`totalMatchedSegments=0`、`totalReplacedNodes=0`、`totalRuns=10`。
- 最新 `.lime/governance/legacy-surface-report.json` 显示 `classificationDriftCandidateCount=0`、`violationCount=0`、`zeroReferenceCandidateCount=0`。
- 版本化 Patch gate evidence 当前 `retirementReady=true`、`gateIssues=0`、`advisoryIssues=0`，说明当前 GUI smoke 样本仍未依赖 legacy DOM Patch，且 legacy surface 审计没有阻断项。

验证：

- `npm run i18n:patch-retirement-gate:json -- --output "docs/roadmap/i18n/evidence/patch-retirement-gate-report.json" --patch-report ".lime/i18n/patch-metrics-report.json" --legacy-report ".lime/governance/legacy-surface-report.json"` 通过。
- `npm run i18n:patch-retirement-gate -- --check --format json --patch-report ".lime/i18n/patch-metrics-report.json" --legacy-report ".lime/governance/legacy-surface-report.json"` 通过。
- 本轮观察到 `verify:gui-smoke` 进程已自然退出，`.lime/locks/gui-smoke.lock/owner.json` 已清理；同时 `code-runtime-fixture-smoke`、`runtime-approval-sandbox-smoke`、`agent-apps-smoke` 与 `at-command-registry-e2e` 产物均为通过状态。

## 2026-05-27：P3/P4 GUI smoke Patch gate 复验

本轮继续完成：

- 复用已运行的 headless Tauri 环境执行 `npm run verify:gui-smoke -- --reuse-running`，覆盖 DevBridge、workspace ready、browser runtime、site adapters、code runtime 页面级 smoke、code runtime fixture、approval sandbox、@ command registry、Agent Apps、Knowledge GUI 与 design canvas。
- GUI smoke 刷新的 `.lime/i18n/patch-metrics-report.json` 继续显示 `status=no-hit`、`retirementCandidate=true`、`totalRuns=10`、`totalMatchedSegments=0`、`totalReplacedNodes=0`。
- GUI smoke 刷新的 `.lime/governance/legacy-surface-report.json` 继续显示 `classificationDriftCandidates=[]`、`violations=[]`、`zeroReferenceCandidates=[]`。
- 已重新落盘 `docs/roadmap/i18n/evidence/patch-retirement-gate-report.json`；当前 `retirementReady=true`、`gateIssues=[]`、`advisoryIssues=[]`。

验证：

- `npm run verify:gui-smoke -- --reuse-running` 通过。
- `npm run i18n:patch-retirement-gate:json -- --output "docs/roadmap/i18n/evidence/patch-retirement-gate-report.json" --patch-report ".lime/i18n/patch-metrics-report.json" --legacy-report ".lime/governance/legacy-surface-report.json"` 通过。

## 2026-05-27：P3 bundle 体积与 chunk 策略 evidence 落盘

本轮继续完成：

- `scripts/i18n-bundle-report.ts` 新增 `--output <path>`，使 bundle footprint / chunk strategy 报告可以直接落成版本化 evidence，而不是依赖 stdout 复制。
- 新增 `docs/roadmap/i18n/evidence/bundle-strategy-report.json`；当前报告覆盖 5 个 locale、13 个 source locale 文件、7549 个 source key，总 raw bytes 为 3450322。
- 当前 core namespace 仍全部 inline；最大 inline group 是 `agent`，由 `agent / agentExperts / agentHome / agentInputbar / agentMessageList / agentRuntime / agentSkills / agentTeamWorkspace` 8 个资源分片组成，source locale 为 3504 key、296675 bytes。
- `settings` 是第二大 inline group，source locale 为 2534 key、226601 bytes；后续新增非启动路径 namespace 时应继续默认走 lazy chunk 候选，避免桌面首屏被非核心资源拖慢。

验证：

- `npm run i18n:bundle-report:json -- --output "docs/roadmap/i18n/evidence/bundle-strategy-report.json"` 通过。

## 2026-05-27：P3 bundle strategy evidence 接入质量选择器

本轮继续完成：

- `scripts/quality-task-planner.mjs` 将 i18n 资源、`loadNamespace.ts`、`bundledNamespaceParts.ts` 与 `scripts/i18n-bundle-report.ts` 纳入 bundle strategy 推荐命令范围。
- 资源改动现在会同时推荐刷新 `translation-pr-pack.json` 与 `bundle-strategy-report.json`；bundle loader / 报告脚本改动会推荐刷新 `bundle-strategy-report.json`。
- `docs/aiprompts/quality-workflow.md` 同步记录该口径，确保 P3 bundle 体积与 chunk 策略 evidence 不停留在一次性手工报告，而是进入质量任务选择器的治理闭环。

验证：

- `npm test -- "scripts/quality-task-planner.test.ts" "scripts/i18n-bundle-report.test.ts"` 通过。
- `npm run verify:tasks -- --format json` 能在当前 i18n bundle 报告改动下输出 `npm run i18n:bundle-report:json -- --output docs/roadmap/i18n/evidence/bundle-strategy-report.json` 推荐命令。

## 2026-05-27：P4 evidence 推荐命令接入质量选择器

本轮继续完成：

- `scripts/quality-task-planner.mjs` 将发布材料 / 官网文档 / 帮助文档事实源变更映射到 `i18n:release-docs-report:json` 推荐命令；docs-only 变更仍跳过代码校验，但会保留 evidence 刷新建议。
- installer / app metadata 相关的 `package.json`、`src-tauri/Cargo.toml`、`tauri.conf*.json` 与 `agent-app-shell.json` 变更现在会推荐刷新 `app-metadata-workflow-inventory.json`。
- RTL 方向基础与 readiness inventory 审计过的设置页、侧栏、Workspace、弹窗和 Knowledge 主路径 surface 变更，会推荐刷新 `rtl-readiness-inventory.json`；布局敏感 surface 同时推荐 `npm run i18n:rtl-smoke`。
- `scripts/local-ci.mjs` 调整 docs-only 摘要输出顺序，确保 docs-only 仍跳过本地代码校验，但不会吞掉 P4 evidence 推荐命令。

验证：

- `npm test -- "scripts/quality-task-planner.test.ts" "scripts/quality-task-selector.test.ts"` 通过。
- 定向 `detectTasks(["docs/content/02.user-guide/9.mcp.md"])` 确认 docs-only 发布材料变更会保留 `i18n:release-docs-report:json` 推荐命令，且不触发前端 / GUI smoke。
- `npm run verify:tasks -- --format json` 能在当前 evidence 变更下输出 `i18n:app-metadata-report:json` 与 `i18n:rtl-readiness-report:json` 推荐命令。

## 2026-05-27：P4 Chrome extension i18n inventory 接入质量选择器

本轮继续完成：

- 新增 `scripts/i18n-chrome-extension-workflow-report.ts` 与测试 `scripts/i18n-chrome-extension-workflow-report.test.ts`，把 `extensions/lime-chrome` 的 manifest、Chrome `_locales` 状态、`InstallI18n` registry、options 页语言集合、页面 `data-i18n` 属性和核心术语出现情况做成可重复 inventory。
- `package.json` 新增 `i18n:chrome-extension-report` 与 `i18n:chrome-extension-report:json`，后续可直接刷新 `docs/roadmap/i18n/evidence/chrome-extension-workflow-inventory.json`。
- `scripts/quality-task-planner.mjs` 已把 Chrome extension i18n surface 变更接入 `recommendedCommands`，当扩展 manifest、页面、`install-i18n.js`、options 语言脚本或对应 evidence / evaluation 变更时，推荐刷新 Chrome extension inventory。
- `docs/roadmap/i18n/chrome-extension-evaluation.md` 已补充 machine-readable evidence 链接，继续保持当前结论：不迁移 `_locales/messages.json`，但扩展术语与页面级 registry 状态必须可复验。

验证：

- `npm test -- "scripts/i18n-chrome-extension-workflow-report.test.ts" "scripts/quality-task-planner.test.ts"` 通过，覆盖 2 个文件、23 个用例。
- `npm run i18n:chrome-extension-report:json -- --output "docs/roadmap/i18n/evidence/chrome-extension-workflow-inventory.json"` 通过，当前报告显示 manifest 无 `default_locale`、无 `_locales/`，`InstallI18n` 支持 `de / en / es / fr / pt / zh`，options 页支持 `en / zh`，核心术语 5/5 出现。

## 2026-05-27：P4 Release Notes 英文 companion 补齐

本轮继续完成：

- 新增 `RELEASE_NOTES.en.md`，按 `RELEASE_NOTES.md` 当前 `v1.52.0` 结构补齐英文 companion，并明确中文发布说明仍是 primary/source 版本。
- `README.en.md` 的 Release Notes 入口已指向 `RELEASE_NOTES.en.md`；`scripts/i18n-release-docs-workflow-report.ts` 同步补充英文 README companion 链接检查，以及中英文 release notes 标题版本一致性检查。
- `docs/roadmap/i18n/release-docs-workflow-evaluation.md` 已从“Release Notes 无英文 companion”更新为“README 与 Release Notes 已有最小 `zh-CN / en-US` companion 覆盖，但文档站仍没有独立 locale workflow”。
- 这一步直接推进 PRD P4 验收“发布材料至少覆盖 `zh-CN / en-US`”；官网文档与帮助文档仍需要后续独立 workflow。

验证：

- `npm run i18n:release-docs-report:json -- --output "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json"` 通过，当前报告显示 `hasBilingualRootReadme=true`、`hasReleaseNotesCompanion=true`、`hasReleaseNotesCompanionVersionMatch=true`、`readmeEnglishLinksReleaseNotesCompanion=true`。
- `jq empty "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json"` 通过，确认 evidence JSON 有效。

## 2026-05-27：P4 release docs translation scope manifest

本轮继续完成：

- 新增 `docs/roadmap/i18n/release-docs-translation-scope.json`，把发布材料、官网文档和帮助文档拆成 `required / pilot / source-only` 三类翻译范围；当前 required 为 README 与 Release Notes，pilot 为 `docs/content/index.md`。
- `scripts/i18n-release-docs-workflow-report.ts` 已读取 translation scope manifest，并输出 scope item 数、required companion 缺失数、source locale、target locales 与 source / companion 文件存在情况。
- `docs/roadmap/i18n/release-docs-workflow-evaluation.md` 已更新结论：发布材料已有最小 `zh-CN / en-US` companion 覆盖和可机器读取的 translation scope，但文档站仍没有 locale 构建 workflow。

验证：

- `npm run i18n:release-docs-report:json -- --output "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json"` 通过，当前报告显示 `hasReleaseDocsTranslationScope=true`、`releaseDocsScopeItemCount=15`、`releaseDocsRequiredCompanionMissingCount=0`。
- `jq empty "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json" "docs/roadmap/i18n/release-docs-translation-scope.json"` 通过，确认 evidence 与 scope manifest 均为有效 JSON。

## 2026-05-27：P4 release docs pilot companion advisory

本轮继续完成：

- `scripts/i18n-release-docs-workflow-report.ts` 在 required companion 门禁之外新增 `missingPilotEnglishCompanions` 与 `releaseDocsPilotCompanionMissingCount`，把 pilot 文档的英文 companion 缺口暴露为非阻断 advisory。
- 刷新 `docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json` 后，当前 required companion 缺失数仍为 `0`，pilot companion 缺失数为 `1`，具体是 `docs/content/index.md`。
- `docs/roadmap/i18n/release-docs-workflow-evaluation.md` 已同步说明：README 与 Release Notes 的最低 `zh-CN / en-US` 发布材料覆盖不受 pilot 缺失影响，但文档首页 pilot 是下一步官网 / 帮助文档 companion 的明确候选。

验证：

- `npm test -- "scripts/i18n-release-docs-workflow-report.test.ts"` 通过，覆盖 required 门禁和 pilot advisory。
- `npm run i18n:release-docs-report:json -- --output "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json"` 通过，已刷新 evidence。

## 2026-05-27：P4 app metadata translation scope manifest

本轮继续完成：

- 新增 `docs/roadmap/i18n/app-metadata-translation-scope.json`，把 installer / app metadata 字段拆成 translatable、stable brand / identifier 与 source-only 三类；当前 `generatedMetadataAllowed=false`，避免在发布链路未设计前生成平行配置。
- `scripts/i18n-app-metadata-workflow-report.ts` 已读取 metadata scope，并在 inventory 中输出 scope item 数、可翻译字段数、稳定字段数、source-only 字段数、owner、source locale、target locales 与 workflow status。
- 刷新 `docs/roadmap/i18n/evidence/app-metadata-workflow-inventory.json` 后，当前 scope 共 `10` 项，其中 translatable 字段 `2` 项、stable 字段 `6` 项、source-only 字段 `2` 项；installer localization workflow 仍为 `false`。
- `scripts/quality-task-planner.mjs` 已把 metadata scope 纳入 P4 app metadata evidence 推荐范围；单独改 scope manifest 时保持 docs-only，但推荐刷新 `app-metadata-workflow-inventory.json`。
- `docs/roadmap/i18n/app-metadata-workflow-evaluation.md` 已同步记录：这一步只建立可机器读取的 ownership / scope，不改真实安装器或 Tauri 配置。

验证：

- `npm test -- "scripts/i18n-app-metadata-workflow-report.test.ts" "scripts/quality-task-planner.test.ts"` 通过，覆盖 app metadata scope 读取与 docs-only 推荐命令。
- `npm run i18n:app-metadata-report:json -- --output "docs/roadmap/i18n/evidence/app-metadata-workflow-inventory.json"` 通过，已刷新 evidence。

## 2026-05-27：P4 docs home English companion pilot

本轮继续完成：

- 新增 `docs/content/index.en.md`，作为文档首页 `docs/content/index.md` 的英文 companion pilot；内容保持与 source 页同一定位：创作者故事优先、技术连接能力作为扩展说明。
- `docs/roadmap/i18n/release-docs-translation-scope.json` 已把 `docs/content/index.md` 的 pilot `enUSPath` 指向 `docs/content/index.en.md`。
- 刷新 `docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json` 后，当前 release docs scope 的 required companion 缺失数为 `0`，pilot companion 缺失数也为 `0`；existing English companion 数从 README / Release Notes 的 `2` 扩展到 `3`。
- `docs/roadmap/i18n/release-docs-workflow-evaluation.md` 已同步记录：文档首页已有英文 companion pilot，但 docs site 仍没有 locale route / locale build workflow，不能把该 pilot 误判成完整文档站国际化。

验证：

- `npm test -- "scripts/i18n-release-docs-workflow-report.test.ts" "scripts/quality-task-planner.test.ts"` 通过，覆盖 pilot companion 存在时 advisory 为 `0`。
- `npm run i18n:release-docs-report:json -- --output "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json"` 通过，已刷新 release docs evidence。

## 2026-05-27：P4 docs companion pilot 避免文档站假路由

本轮继续完成：

- 将文档首页英文 companion 从 `docs/content/index.en.md` 移到 `docs/roadmap/i18n/companions/docs-content-index.en.md`，避免在 `docs/nuxt.config.ts` 尚无 locale route 的情况下，被 Docus / Nuxt Content 当成普通内容页收集。
- `docs/roadmap/i18n/release-docs-translation-scope.json` 已同步把 `docs/content/index.md` 的 pilot `enUSPath` 指向 roadmap companion 目录；release docs evidence 仍显示 required companion 缺失数 `0`、pilot companion 缺失数 `0`、existing English companion 数 `3`。
- `scripts/i18n-release-docs-workflow-report.ts` 新增 `docsSite.contentEnglishCompanionFiles` 与 `summary.docsContentEnglishCompanionFileCount`，专门检测 `docs/content` 内是否出现 `.en.md` / `.en-US.md` companion；当前应保持为 `0`，直到真正引入 docs locale route / build workflow。
- `docs/roadmap/i18n/release-docs-workflow-evaluation.md` 已同步说明：当前已有文档首页英文 companion pilot，但它不是文档站 locale route，也不代表完整 docs i18n workflow 已完成。

验证：

- `npm test -- "scripts/i18n-release-docs-workflow-report.test.ts" "scripts/quality-task-planner.test.ts"` 通过，覆盖 companion 不落入 `docs/content` 的口径。
- `npm run i18n:release-docs-report:json -- --output "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json"` 通过，已刷新 release docs evidence。

## 2026-05-27：P4 docs companion 接入质量选择器

本轮继续完成：

- `scripts/quality-task-planner.mjs` 已把 `docs/roadmap/i18n/companions/` 纳入 release docs workflow 触发面；后续修改文档 companion pilot 时，会保持 docs-only，但推荐刷新 `release-docs-workflow-inventory.json`。
- `scripts/quality-task-planner.test.ts` 新增 companion 目录回归，锁住 `docsOnly=true`、不触发 frontend / GUI smoke，并保留 `i18n:release-docs-report:json` 推荐命令。
- 这一步补齐 P4 发布材料 / 官网文档 companion pilot 的质量闭环，避免 companion 内容变更后 evidence 失效。

验证：

- `npm test -- "scripts/quality-task-planner.test.ts" "scripts/i18n-release-docs-workflow-report.test.ts"` 通过，覆盖 2 个文件、26 个用例。
- 定向 `detectTasks(["docs/roadmap/i18n/companions/docs-content-index.en.md"])` 输出 `docsOnly=true`，且推荐 `npm run i18n:release-docs-report:json -- --output docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json`。

## 2026-05-27：P4 release docs companion orphan 检测

本轮继续完成：

- `scripts/i18n-release-docs-workflow-report.ts` 新增 companion 目录审计：收集 `docs/roadmap/i18n/companions/` 下英文 Markdown companion，并与 `release-docs-translation-scope.json` 中的 `enUSPath` 交叉比对。
- inventory 现在输出 `releaseDocsTranslationScope.companionFiles`、`orphanEnglishCompanions` 与 `summary.releaseDocsOrphanCompanionCount`，避免后续出现未被 scope 管理的游离英文 companion。
- 刷新 `docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json` 后，当前 companion 文件为 `docs/roadmap/i18n/companions/docs-content-index.en.md`，orphan companion 数为 `0`；required / pilot companion 缺失数仍为 `0`。

验证：

- `npm test -- "scripts/i18n-release-docs-workflow-report.test.ts"` 通过，覆盖 companion 正常引用和 orphan companion 反向用例。
- `npm run i18n:release-docs-report:json -- --output "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json"` 通过，已刷新 release docs evidence。

## 2026-05-27：P4 release docs source-only 剩余范围量化

本轮继续完成：

- `scripts/i18n-release-docs-workflow-report.ts` 新增 `sourceOnlyWithoutCompanions` 与 `sourceOnlyWithoutCompanionCount`，把 translation scope 中明确暂不翻译的 source-only 文档数量直接暴露到 inventory。
- 刷新 `docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json` 后，当前 required companion 缺失数为 `0`、pilot companion 缺失数为 `0`、orphan companion 数为 `0`；source-only without companion 数为 `12`，对应现有帮助文档 / API reference / open platform / legal 长尾。
- 这一步不改变当前门禁，但让 P4 “官网文档、帮助文档进入独立翻译 workflow” 的剩余范围可机器读取，避免只看 required / pilot 就误判 docs workflow 已完成。

验证：

- `npm test -- "scripts/i18n-release-docs-workflow-report.test.ts"` 通过，覆盖 source-only without companion 统计。
- `npm run i18n:release-docs-report:json -- --output "docs/roadmap/i18n/evidence/release-docs-workflow-inventory.json"` 通过，已刷新 release docs evidence。
