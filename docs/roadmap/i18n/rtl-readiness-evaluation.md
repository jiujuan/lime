# Lime RTL readiness 评估

> 关联 PRD：`docs/roadmap/i18n/prd.md`
> 关联进度：`docs/roadmap/i18n/implementation-progress.md`
> 评估时间：2026-05-23

## 评估目标

判断 Lime 当前主路径是否已经具备引入 RTL locale（例如 `ar` / `fa-IR`）的布局与交互前置条件。

## 当前事实

- `src/i18n/locales.ts` 已提供 `resolveDocumentDirection()` 与 `isRtlLocale()`，`document.documentElement.dir` 会随当前 locale 同步。
- 当前 `SUPPORTED_LOCALES` 仍只有 `zh-CN / en-US / zh-TW / ja-JP / ko-KR`，没有任何 RTL locale 进入主支持列表。
- `src/i18n/locales.ts` 仍是 locale registry 的唯一方向事实源，没有引入 `rtl-detect` 或独立方向插件。
- `docs/roadmap/i18n/evidence/rtl-readiness-inventory.json` 已落盘，记录当前主路径里 38 个被审计文件、98 个方向敏感 marker、23 个高风险文件与 5 个主路径 surface 的静态 inventory。
- `docs/roadmap/i18n/evidence/rtl-screenshot-smoke-report.md` 与 `docs/roadmap/i18n/evidence/rtl-playwright-smoke-report.json` 已落盘，并附带 `rtl-home-fullpage.png`、`rtl-settings-fullpage.png`、`rtl-user-menu-fullpage.png`、`rtl-workspace-fullpage.png` 以及自动化版本的 `rtl-home-automated.png`、`rtl-settings-automated.png`、`rtl-user-menu-automated.png`、`rtl-workspace-automated.png`，记录一次强制 `rtl` 下的首页、Workspace、设置页与用户菜单 smoke。
- Readiness inventory 已逐项映射 PRD 要求的 RTL smoke surface：当前 `sidebar / settings / workspace / dialogs` 都有 Playwright summary 证据，`missingRequiredSurfaceSmokeEvidence=false`。
- PRD 已明确要求：在引入 RTL locale 之前，必须先完成布局审计、截图回归与 Playwright smoke。

## 结论

当前**不应**把 `ar` / `fa-IR` 直接加入主支持列表。

## 现状评价

1. 方向判定的底层 helper 已经补上，但这只解决了 `dir` 语义，不等于 RTL 主路径已就绪。
2. 当前缺口不在 locale registry 本身，而在设置页、侧栏、Workspace、弹窗和其他主路径的视觉与交互审计。
3. 这次已经补了人工截图与自动化 smoke 基线，并覆盖 PRD 点名的 `sidebar / settings / workspace / dialogs` 四个 required surface；但它仍然只是强制 `dir=rtl` 的页面级验证，不等于已支持 RTL locale。
4. 贸然开放 RTL locale 仍会把布局风险转成线上回归风险，必须先把自动化回归再补上。

## 建议工作流

- 先按主路径做 RTL 布局审计：设置页、侧栏、Workspace shell、弹窗、表单控件、工具栏、列表和空态。
- 再补基于截图的回归证据，确认方向切换不会引起文本截断、图标错位、按钮顺序异常或弹窗溢出。
- 最后把这次人工 smoke 固化为 Playwright 断言，复核语言切换与主路径交互；当前 required surface smoke missing count 已归零，后续若新增 RTL locale，还需要补真实 locale 选择器 / 文案加载 / LTR 对照截图回归。

## 重新评估条件

满足以下任一条件时，再考虑把 RTL locale 进入支持列表：

1. 主路径 RTL 布局审计已经完成并落成版本化工件。
2. 关键页面的截图回归已覆盖 RTL 与 LTR 两个方向。
3. Playwright smoke 能证明 RTL 下设置页、侧栏、Workspace 和弹窗仍可用，且 `rtl-readiness-inventory.json` 的 `missingRequiredSurfaceSmokeEvidence=false`。
4. 视觉与交互缺陷已经收口，且没有新的方向性 CSS 债务继续扩散。

## 证据链接

- [locales.ts](/Users/coso/Documents/dev/ai/aiclientproxy/lime/src/i18n/locales.ts)
- [createI18n.ts](/Users/coso/Documents/dev/ai/aiclientproxy/lime/src/i18n/createI18n.ts)
- [locales.test.ts](/Users/coso/Documents/dev/ai/aiclientproxy/lime/src/i18n/__tests__/locales.test.ts)
- [rtl-readiness-inventory.json](/Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/evidence/rtl-readiness-inventory.json)
- [rtl-screenshot-smoke-report.md](/Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/evidence/rtl-screenshot-smoke-report.md)
- [rtl-playwright-smoke-report.json](/Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/evidence/rtl-playwright-smoke-report.json)
- [PRD](/Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/prd.md)
