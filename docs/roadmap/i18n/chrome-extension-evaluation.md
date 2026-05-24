# Lime Chrome extension i18n 评估

> 关联 PRD：`docs/roadmap/i18n/prd.md`
> 关联进度：`docs/roadmap/i18n/implementation-progress.md`
> 评估时间：2026-05-23

## 评估目标

判断 `extensions/lime-chrome` 是否应从当前自定义 `data-i18n` / `InstallI18n` 适配层迁移到 Chrome 标准 `_locales/messages.json` 结构。

## 当前事实

- `extensions/lime-chrome/manifest.json` 没有 `default_locale`，也没有 `_locales/` 目录。
- 扩展页面主要是静态 HTML：`pages/options.html`、`pages/install-extension.html`、`pages/install-direct-cdp.html`、`pages/compare-methods.html`、`pages/popup.html`。
- `extensions/lime-chrome/pages/scripts/install-i18n.js` 提供的是轻量页面级 registry：按 `lang` 注册字符串、按 `data-i18n` 选择器写入 DOM、同步 `document.documentElement.lang`。
- 语言集合是扩展自管的 `zh / en / de / es / fr / pt`，并通过 `navigator.language` 或 `?lang=` 推导。
- 页面里的不少文案本身就是安装引导、比较说明、诊断提示，且混合了少量 HTML 片段。

## 结论

当前**不迁移**到 `_locales/messages.json`。

## 原因

1. 扩展当前本地化面很小，且主要集中在安装引导页和 options 页，现有自定义 registry 已能覆盖需求。
2. `_locales/messages.json` 的收益主要在 Chrome 生态标准化和更大规模 catalog 管理；以当前体量看，迁移成本高于收益。
3. 现有实现已经和页面结构强绑定，直接迁移会把 `data-i18n`、页面内注册、HTML 片段处理和语言检测一起重做，工作量不小。
4. 扩展当前并不是 Lime 共享文案事实源，和桌面 App 的 namespace 体系也没有直接的 loader 复用关系，贸然标准化只会新增一套并行边界。

## 保留做法

- 继续使用 `InstallI18n` 作为扩展页级适配层。
- 继续保持扩展内文案与桌面端术语一致，但不把它升级成新的全局 i18n 主事实源。
- 若后续需要 Chrome Web Store 级别的标准化，优先考虑 build-time 导出而不是手工双维护。

## 重新评估条件

满足以下任一条件时，再评估迁移：

1. 扩展页面数量和 locale 数量继续增长，当前轻量 registry 开始变成维护负担。
2. 扩展需要和桌面端共享同一套翻译产物，而不是只共享术语约定。
3. 发布链路需要更强的 Chrome 标准兼容性或自动化打包约束。
4. 未来扩展文案需要进入统一的 PR 级翻译 workflow。

## 证据链接

- [manifest.json](</Users/coso/Documents/dev/ai/aiclientproxy/lime/extensions/lime-chrome/manifest.json>)
- [install-i18n.js](</Users/coso/Documents/dev/ai/aiclientproxy/lime/extensions/lime-chrome/pages/scripts/install-i18n.js>)
- [options.html](</Users/coso/Documents/dev/ai/aiclientproxy/lime/extensions/lime-chrome/pages/options.html>)
- [install-extension.html](</Users/coso/Documents/dev/ai/aiclientproxy/lime/extensions/lime-chrome/pages/install-extension.html>)
- [compare-methods.html](</Users/coso/Documents/dev/ai/aiclientproxy/lime/extensions/lime-chrome/pages/compare-methods.html>)
- [README.md](</Users/coso/Documents/dev/ai/aiclientproxy/lime/extensions/lime-chrome/README.md>)
