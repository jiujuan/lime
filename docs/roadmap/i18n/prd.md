# Lime 全球本地化 PRD

> 状态：proposed current roadmap
> 更新时间：2026-05-11
> 负责人视角：Lime 桌面端 GUI / Agent 运行时 / Browser Runtime 的全球本地化能力层
> 目标：把当前 DOM Patch 翻译补丁升级为 key-based、可验证、可持续扩展的全球本地化体系
> 非目标：本文不是具体实施任务清单；实施前仍需拆分到 `docs/exec-plans/` 并按 Lime 质量工作流验证

## 1. 背景

Lime 当前已经具备早期中英切换能力，但能力形态仍是“把渲染后的中文文本替换成英文”的 Patch Layer。这个机制适合快速补齐英文预览，不适合长期全球化。

全球本地化不只是翻译 UI 文案，而是同时覆盖：

1. UI 文案与组件状态
2. 日期、数字、相对时间、排序、复数与变量
3. RTL / LTR 方向、`html lang`、桌面端首屏闪烁控制
4. Agent 默认回复语言与用户创作内容目标语言
5. Browser Runtime 的 `Accept-Language`、locale、timezone 等站点环境
6. Rust / Tauri / Bridge 错误的用户可见表达
7. Chrome extension、发布材料、文档与自动翻译流程

因此，Lime 的目标不是“把中文替换成英文”，而是建立一个可治理的本地化事实源，让新功能默认具备全球化能力。

## 2. 调研依据

本轮调研同时使用了本地代码检索、Context7 文档查询与 WebSearch 官方资料复核，避免只基于单一项目经验做方案设计：

- 本地代码：复核 Lime 当前 `src/i18n/`、配置 schema、Browser Runtime 环境语言实现，并对比 `/Users/coso/Documents/dev/js/lobehub` 与 `/Users/coso/Documents/dev/rust/CodexMonitor`。
- Context7：查询 `i18next`、`react-i18next`、`Vite` 的 current 文档，重点验证 fallback、namespace、`Trans`、Suspense 与 `import.meta.glob` 的实现约束。
- WebSearch：只采用官方或上游资料，包括 i18next、react-i18next、Vite、MDN、W3C、Tauri 与 i18next 插件仓库。

### 2.1 Lime 当前事实

本轮复核了以下本地事实源：

- `package.json` 已有 `i18next`、`react-i18next`、`dayjs`，但没有 `i18next-browser-languagedetector`、`i18next-resources-to-backend`、`rtl-detect`。
- `src/i18n/README.md` 明确当前单一前端 i18n fact source 是 Patch Layer。
- `src/i18n/config.ts` 初始化了 i18next，但当前只作为兼容层，`lng` 与 `fallbackLng` 均为 `zh`。
- `src/i18n/legacy-patch/text-map.ts` 的语言模型只有 `"zh" | "en"`，资源落在 `legacy-patch/patches/zh.json` 与 `legacy-patch/patches/en.json`。
- `src/i18n/legacy-patch/I18nPatchProvider.tsx` 通过 `MutationObserver` 监听动态 DOM，调用 `replaceTextInDOM` / `replaceTextInNode` 替换文本。
- `src/i18n/legacy-patch/dom-replacer.ts` 使用 `TreeWalker` 扫描 text node，只处理含中文文本，跳过 `input`、`textarea`、`contenteditable`、`.ProseMirror`，并记录耗时指标。
- `src/lib/api/appConfigTypes.ts` 与 `src-tauri/crates/core/src/config/types.rs` 均已有 `language: string`，Rust 默认值仍是 `zh`，可作为首期 UI locale 持久化入口。
- `src/lib/api/appConfig.ts` 已有 `getConfig()` / `saveConfig()`，首期切换语言不需要新增 Tauri 命令。
- `package.json` 暴露 `detect-translations*` 脚本；本轮已补 `scripts/detect-missing-translations.ts`，用于校验各 locale 的 namespace/key 结构一致性。
- `src-tauri/src/services/browser_environment_service.rs` 已把 Browser Runtime 的 `locale`、`accept_language`、`timezone_id` 作为站点环境的一部分，并由 `browser_launch_language()` 推导 Chrome 启动语言；这应与 Lime UI locale 分离。

结论：Patch Layer 可作为迁移期兼容层保留，但不能继续作为 current 主路径。

### 2.2 LobeHub 参考

本轮复核 `/Users/coso/Documents/dev/js/lobehub`：

- 依赖组合：`i18next`、`react-i18next`、`i18next-browser-languagedetector`、`i18next-resources-to-backend`、`rtl-detect`、`dayjs`。
- `.i18nrc.js` 以 `locales/en-US` 为入口，使用 `@lobehub/i18n-cli` 自动生成多语言 JSON，并配置 `temperature: 0`、`jsonMode`、Markdown 翻译。
- `locales/<locale>/<namespace>.json` 资源结构清晰，每个 locale 下约 46 个 namespace。
- `src/locales/resources.ts` 集中维护 locale registry、`normalizeLocale()`、本地语言显示名与支持列表。
- `src/locales/create.ts` 使用 `LanguageDetector`、`resourcesToBackend`、`initReactI18next`，预加载核心 namespace，`react.useSuspense = false`，语言变化时同步 `document.documentElement.dir`。
- `src/utils/i18n/loadI18nNamespaceModule.vite.ts` 使用 `import.meta.glob` 动态加载 default / locale namespace；desktop 版本用 `{ eager: true }` 内联所有资源，降低桌面运行时懒加载不确定性。
- 设置里区分 UI language 与 response language；用户可以界面使用一种语言，同时让 Agent 用另一种语言回复。
- i18n workflow 包含 default locale 生成、diff 清理、unused key 扫描、自动翻译 PR。

对 Lime 的可借鉴点：namespace 资源结构、locale registry、locale normalize、核心 namespace 预加载、desktop eager loader、UI 语言和 AI 回复语言分离、自动翻译与 unused key 治理。

不建议照搬的点：Next.js middleware、路由 locale、SEO sitemap、Ant Design locale、一次性支持 18 种语言。Lime 是 Tauri 桌面产品，首期应更克制。

### 2.3 CodexMonitor 参考

本轮复核 `/Users/coso/Documents/dev/rust/CodexMonitor`：

- `package.json` 没有正式 i18n / react-i18next 依赖。
- UI 中存在大量英文硬编码，说明桌面 GUI 如果早期不做 key-based i18n，后期迁移成本会快速上升。
- `src/utils/time.ts`、`src/features/home/homeFormatters.ts` 已使用 `Intl.RelativeTimeFormat`、`Intl.DateTimeFormat`、`Intl.NumberFormat`，这是值得 Lime 借鉴的格式化方向。
- Rust 侧存在 terminal locale、dictation preferred language 等能力，提醒 Lime 需要区分“UI 语言”“输入/识别语言”“终端/进程 locale”“AI 输出语言”。

对 Lime 的启示：不要把所有 language 字段混成一个；日期数字等格式化应走统一 locale wrapper，不要靠翻译 JSON 手写时间单位。

### 2.4 官方资料与外部参考

本轮使用 Context7 与 WebSearch 查阅了官方/上游资料：

- i18next fallback：`https://www.i18next.com/principles/fallback`
- i18next namespace：`https://www.i18next.com/principles/namespaces`
- i18next interpolation / plural / context：`https://www.i18next.com/translation-function/interpolation`、`https://www.i18next.com/translation-function/plurals`、`https://www.i18next.com/translation-function/context`
- react-i18next `useTranslation`：`https://react.i18next.com/latest/usetranslation-hook`
- react-i18next `Trans`：`https://react.i18next.com/latest/trans-component`
- i18next TypeScript：`https://www.i18next.com/overview/typescript`
- Vite glob import：`https://vite.dev/guide/features.html#glob-import`
- MDN Intl：`https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl`
- MDN `lang` / `dir`：`https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang`、`https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/dir`
- W3C language tag 选择：`https://www.w3.org/International/questions/qa-choosing-language-tags`
- Tauri v2 Store：`https://v2.tauri.app/plugin/store/`
- i18next resources backend：`https://github.com/i18next/i18next-resources-to-backend`
- i18next browser language detector：`https://github.com/i18next/i18next-browser-languageDetector`

官方资料对本 PRD 的直接结论：

1. i18next 原生支持 `fallbackLng` 的具体语言、泛化语言与 fallback 序列，适合 `zh-CN -> zh -> fallback` 这类退化链。
2. namespace 是长期维护大型应用文案的基本边界，应使用 `ns` 参数访问公共 namespace，而不是把所有 key 放进一个大 JSON。
3. interpolation、plural、context 是变量、复数、性别/语境差异的标准能力，DOM Patch 无法可靠覆盖这些场景。
4. react-i18next 的 `useTranslation(ns)` 与 `Trans` 分别覆盖普通文案和富文本/React 组件插入，应成为新 UI 的默认入口。
5. TypeScript `CustomTypeOptions` 可以把 resources 绑定到 key 类型，降低漏 key 与拼错 key 风险。
6. Vite `import.meta.glob` 可用于 namespace lazy load；桌面端可用 eager load 换取启动确定性。
7. `Intl.*` 是日期、数字、相对时间的基础设施，应封装成 Lime 统一 format API。
8. `html lang` 与 `dir` 需要随 UI locale 同步；RTL 支持不是简单翻译 JSON。

### 2.5 补充调研矩阵

| 来源                     | 复核点                                                                                                                                                                                    | 对 Lime 的方案约束                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Context7 / i18next       | `fallbackLng` 支持具体语言、方言退化、fallback 序列与 namespace fallback；key fallback 虽可用但不推荐长期以自然语言 key 管理。                                                            | Lime 使用稳定 dotted key，`fallbackLng` 固定回 `zh-CN`，`fallbackNS` 回 `common`；不把中文原文当 current key。                                |
| Context7 / i18next       | namespace 用于按语义、页面或 feature 拆分资源，避免单文件过大并支持懒加载。                                                                                                               | Lime 首期保留 `common`、`navigation`、`settings`、`workspace`、`agent`、`errors` 核心 namespace，业务域后续再拆。                             |
| Context7 / i18next       | interpolation、plural、context 是变量、数量和语境差异的标准能力。                                                                                                                         | 动态文案必须走 `t(key, params)`、plural 与 context；禁止继续用字符串拼接或 DOM Patch 处理变量语序。                                           |
| Context7 / react-i18next | `useTranslation(ns)` 的 `t` 绑定 namespace；`Trans` 适合富文本和 React 组件插入；未就绪时会触发 Suspense，关闭 Suspense 后要自行处理 ready。                                              | 桌面端默认 `react.useSuspense = false`，核心 namespace eager preload；普通组件用 `useTranslation(ns)`，带链接/强调/代码片段的文案用 `Trans`。 |
| Context7 / Vite          | `import.meta.glob` 默认 lazy dynamic import；`{ eager: true }` 会构建期直接导入所有匹配模块；JSON 可直接 import。                                                                         | Lime 桌面主路径优先 eager preload 核心资源，业务 namespace 可 lazy；若 GUI smoke 发现首屏抖动，切到 desktop eager loader。                    |
| WebSearch / MDN Intl     | `Intl` 提供语言敏感的比较、数字、日期、相对时间、列表等格式化能力，并使用 BCP 47 locale negotiation。                                                                                     | 新增 `format.ts` 统一封装，不在 JSON 里手写时间单位；排序与时间数字展示显式传 UI locale。                                                     |
| WebSearch / MDN + W3C    | `lang` / `dir` 是 HTML 级语义；语言标签应基于 BCP 47，避免自造短码。                                                                                                                      | UI locale 采用 `zh-CN` / `en-US` / `zh-TW` 等 BCP 47 风格，旧 `zh` / `en` 只读兼容；切换语言同步 `documentElement.lang` 与 `dir`。            |
| LobeHub 本地代码         | `.i18nrc.js` 以 `en-US` 为 entry，配置多 locale 输出、glossary、Markdown 翻译、JSON mode；`src/locales/create.ts` 组合 LanguageDetector、resources backend、核心资源预加载和 `dir` 同步。 | Lime 借鉴 workflow 与架构边界，但不照搬 source locale、Next.js 路由、SEO 与一次性 18 语言；首期保守支持 5 个 locale + `auto`。                |
| LobeHub 本地代码         | `loadI18nNamespaceModule.vite.ts` lazy，`loadI18nNamespaceModule.desktop.ts` eager，均提供 fallback 到 default namespace。                                                                | Lime 后续可拆出 `loadNamespace.ts`，保留 web/dev 与 desktop 两种加载策略，确保 Tauri 首屏确定性。                                             |
| CodexMonitor 本地代码    | 没有正式 i18n 依赖，UI 有大量硬编码英文；但 `src/utils/time.ts` 使用 `Intl.RelativeTimeFormat`，Rust terminal 与 dictation 另有 locale / preferred language。                             | Lime 不能把 UI language、终端 locale、ASR language、Agent response language 混成一个字段；格式化能力应统一封装。                              |

### 2.6 对比结论

1. **LobeHub 是正向成熟样板**：它证明 `i18next + react-i18next + resources backend + locale registry + 自动翻译 workflow` 能支撑大规模 AI 产品，但 Lime 应按桌面 GUI 的启动稳定性和当前中文事实源做裁剪。
2. **CodexMonitor 是边界提醒**：没有早期 key-based i18n 时，UI 硬编码会快速扩散；同时 terminal、dictation、code highlight 这类 “language” 不是 UI locale，必须分字段治理。
3. **Lime 的正确路线是双轨收口**：current 主路径转向 key-based resources，legacy Patch Layer 只做迁移期兜底，并用命中率和 coverage 逐步退出。
4. **首期不追求语言数量，而追求机制闭环**：先让 locale registry、资源加载、设置持久化、fallback、格式化和 GUI smoke 跑通，再扩大 locale 与自动翻译。

### 2.7 本轮工具复核与取舍

为了避免“参考了成熟项目，但没有落到 Lime 桌面产品边界”的问题，本轮把外部资料转成以下决策约束：

| 复核方式                                          | 关键证据                                                                                                                                 | Lime 取舍                                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Context7 / `/websites/i18next`                    | i18next 官方资料确认 `fallbackLng`、`fallbackNS`、namespace、interpolation、plural、context 与 TypeScript 资源绑定均是框架原生能力。     | current 主路径采用稳定 key + namespace；中文原文只作为 `zh-CN` source value，不再作为长期 key。                       |
| Context7 / `/i18next/react-i18next`               | `useTranslation(ns)` 适合普通组件文案，`Trans` 适合富文本和 React 组件插入；关闭 Suspense 后需要预加载或自行处理 ready。                 | 桌面端默认 `useSuspense: false`，核心 namespace eager 资源内联，避免 Tauri 首屏 loading 闪烁。                        |
| Context7 / `/vitejs/vite`                         | `import.meta.glob` 默认 lazy dynamic import，`{ eager: true, import: "default" }` 可构建期直接导入 JSON default export。                 | P0 直接静态导入核心 resources；P3 再抽 `loadNamespace.ts`，按核心 eager、业务 lazy 拆分。                             |
| WebSearch / MDN + W3C                             | `Intl`、`html lang`、`dir` 与 BCP 47 language tag 是浏览器标准能力。                                                                     | `Config.language` 新写入值使用 `zh-CN` / `en-US` 等 BCP 47 风格；切换 UI locale 同步 `documentElement.lang` / `dir`。 |
| WebSearch / Tauri Store                           | Tauri v2 Store 可作为轻量持久化插件。                                                                                                    | Lime 已有跨 Rust / 前端的 `get_config` / `save_config` 配置事实源，P0 不新增 Store，避免平行配置源。                  |
| WebSearch / i18next detector 与 resources backend | detector 与 backend 适合 Web 场景自动探测和懒加载资源。                                                                                  | Lime P0 先不新增依赖；`auto` 通过 registry normalize 解析系统/浏览器 locale，resources 先随包内联。                   |
| LobeHub 本地复核                                  | 当前样板有 18 个 locale、`en-US` 约 46 个 namespace，并组合 detector、resources backend、RTL、自动翻译 workflow。                        | 只借鉴架构和治理；不照搬 Next.js 路由、SEO、Ant Design locale，也不首期铺 18 种语言。                                 |
| CodexMonitor 本地复核                             | 未引入正式 i18n 依赖；存在 `Intl.RelativeTimeFormat`、terminal `LANG` / `LC_*`、dictation preferred language 等多种 language-like 字段。 | Lime 必须把 UI locale、Agent response language、Browser environment language、终端/语音语言拆开治理。                 |

由此确定 P0 的最小闭环：不追求翻译覆盖率最大化，而是先建立 locale registry、key-based resources、旧值兼容、设置持久化、`lang` / `dir` 同步和 GUI smoke 验收口径。

2026-05-10 追加复核：Context7 重新确认 `/websites/i18next`、`/i18next/react-i18next`、`/vitejs/vite` 的 current 文档与上述结论一致；WebSearch 复核的官方资料仍指向 i18next / react-i18next / Vite / MDN / W3C / Tauri 官方或上游来源，未发现需要推翻 P0/P1 技术路线的更新。

### 2.8 追加调研证据与方案修正

本轮继续使用 Context7、WebSearch、本地 LobeHub 与 CodexMonitor 复核，新增以下更细约束：

| 来源                          | 新增证据                                                                                                                                                                                                                                              | 对 Lime 的修正                                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context7 / i18next TypeScript | i18next v25.4 起加强 `enableSelector`；官方说明 v26 计划默认启用 selector，v27 有弃用 string-based 类型支持的倾向；同时大资源类型检查可能带来 OOM。                                                                                                   | P1 继续用稳定 dotted string key 降低迁移成本；P3 评估 selector API 与 `@i18next-selector/codemod`，但不要在资源量未收敛前强推全仓 selector。                                                 |
| WebSearch / i18next 官方      | 官方把 `i18next-cli` 标为推荐工具，覆盖 key extraction、hardcoded string lint、locale sync 与 type generation。                                                                                                                                       | P3 工具链候选从“自研或 LobeHub CLI”扩展为“三段式”：短期保留 `detect-translations`；中期优先评估官方 `i18next-cli` 做抽取 / lint / 类型；AI 自动翻译可再评估 `@lobehub/i18n-cli` 或自研脚本。 |
| Context7 / react-i18next      | `<Trans>` 适合 React/HTML 节点插入，但它本身只做插值，不负责重新渲染或加载翻译；普通文本仍应优先用 `t`。                                                                                                                                              | 富文本组件必须与 `useTranslation(ns)` 绑定同一个 `t`；不要把 `<Trans>` 当成全局 provider，也不要为了普通按钮文案滥用 `<Trans>`。                                                             |
| Context7 / Vite               | `import.meta.glob` 默认 lazy dynamic import；`eager + import: "default"` 可直接拿 JSON default export；glob 参数必须是字面量，不能用变量拼接。                                                                                                        | `loadNamespace.ts` 的 glob pattern 必须保持静态字面量；业务 namespace 若 lazy，应通过 registry 查表而不是动态拼 import path。                                                                |
| WebSearch / MDN + W3C         | `lang` 使用单个 BCP 47 language tag；`dir` 是语义方向属性，`ltr` / `rtl` / `auto` 与 CSS `direction` 不是同一层决策；W3C 建议只在需要区分时增加 region/script 子标签。                                                                                | Lime 支持列表使用规范大小写的 BCP 47 tag；首期 `ja-JP` / `ko-KR` 是产品选择而非技术必要，后续扩 locale 要说明 region 子标签理由。                                                            |
| WebSearch / Tauri Store       | Tauri Store 是官方持久化 key-value 插件，但需要新增依赖、权限和 async save/load 处理。                                                                                                                                                                | P0 不引入 Store，继续使用已有 `get_config` / `save_config` 作为配置事实源，避免出现第二套 language preference。                                                                              |
| LobeHub 本地代码              | LobeHub 现在有 18 个 locale、46 个 JSON namespace；`createI18nNext` 使用 bundled fallback resources、`partialBundledLanguages`、`initAsync` 控制与后台 `reloadResources`；Vite 配置把 `i18n-*` chunk 单独命名，大型 namespace 拆成 per-locale chunk。 | Lime 不首期照搬 18 语言；但需要把“首屏核心资源内联”和“后续 namespace chunk 化”写成 P2/P3 性能任务，避免资源扩大后拖慢 Tauri 启动。                                                           |
| LobeHub 本地代码              | desktop loader 使用 eager `import.meta.glob`，vite loader 使用 lazy glob，并在缺失 locale namespace 时回退 default namespace。                                                                                                                        | Lime 当前 bundled loader 先走 eager 核心资源；未来如拆 desktop/web loader，应保留 fallback 监控与测试，不允许 namespace missing 变成白屏。                                                   |
| CodexMonitor 本地代码         | `package.json` 没有 i18n 依赖；前端和 Rust 侧存在大量英文硬编码错误 / UI 文案；`src/utils/time.ts` 使用 `Intl.RelativeTimeFormat(undefined)`，但 short relative time 仍手写 `m/h/d/w/mo/y`。                                                          | Lime 的 `format.ts` 必须显式传 UI locale，并禁止重新出现手写相对时间单位；Rust 新错误应逐步转成 `code + params + fallbackMessage`。                                                          |
| CodexMonitor 本地代码         | `dictationPreferredLanguage` / `preferredLanguage` 从设置传到 Whisper 转写；`composerFenceLanguageTags`、代码高亮 language、`localeCompare` 排序和 TestFlight `--locale` 也都是 language-like 场景。                                                  | PRD 明确新增 “ASR / dictation language” 与 “发布材料 locale” 两个边界；这些字段不应复用 UI `Config.language`。                                                                               |

补充资料链接：

- i18next TypeScript / selector：`https://www.i18next.com/overview/typescript`
- i18next 官方抽取工具：`https://www.i18next.com/how-to/extracting-translations`
- i18next supported frameworks / official CLI：`https://www.i18next.com/overview/supported-frameworks`
- react-i18next `Trans`：`https://react.i18next.com/latest/trans-component`
- Vite glob import：`https://vite.dev/guide/features.html#glob-import`
- MDN `lang`：`https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/lang`
- MDN `dir`：`https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/dir`
- W3C language tag：`https://www.w3.org/International/questions/qa-choosing-language-tags`
- Tauri Store：`https://v2.tauri.app/plugin/store/`

### 2.9 最终复核记录

> 复核时间：2026-05-10
> 口径：本节只固化本轮调研证据，不替代后续 `docs/exec-plans/` 的实施计划。

本轮再次使用 Context7、WebSearch 与本地代码复核，确认当前 PRD 仍应坚持 “key-based current 主路径 + legacy Patch 迁移期兜底”：

1. Context7 选用的官方资料 ID 为 `/websites/i18next`、`/i18next/react-i18next`、`/vitejs/vite`，分别复核 `fallbackLng` / `fallbackNS`、namespace、interpolation、plural、context、`CustomTypeOptions`、`enableSelector`、`useTranslation(ns)`、`Trans`、Suspense 与 `import.meta.glob`。结论是 Lime P0/P1 应继续使用稳定 dotted string key，等资源规模与类型内存风险可控后再评估 selector API。
2. WebSearch 只采用官方或上游资料：i18next extraction / TypeScript、react-i18next `Trans` / `useTranslation`、Vite glob import、MDN `Intl` / `lang` / `dir`、W3C BCP 47 语言标签、Tauri v2 Store。结论是 P0 不新增 Store 或 detector/backend 依赖，优先复用已有 `Config.language` 与包内 resources，避免出现第二套语言偏好事实源。
3. LobeHub 本地复核确认 `/Users/coso/Documents/dev/js/lobehub/.i18nrc.js` 当前维护 18 个 output locale，`/Users/coso/Documents/dev/js/lobehub/locales/en-US` 下有 46 个 namespace；`src/locales/create.ts` 使用 bundled fallback resources、`LanguageDetector`、`resourcesToBackend`、`partialBundledLanguages`、`initAsync` 与 `documentElement.dir` 同步；`loadI18nNamespaceModule.vite.ts` 使用 lazy glob，`loadI18nNamespaceModule.desktop.ts` 使用 eager glob。Lime 借鉴 loader / workflow / normalize 思路，但不照搬 Next.js、SEO、Ant Design locale 与 18 语言首发范围。
4. CodexMonitor 本地复核确认 `/Users/coso/Documents/dev/rust/CodexMonitor/package.json` 没有正式 i18n 依赖；`src/utils/time.ts` 与 `src/features/home/homeFormatters.ts` 同时存在 `Intl.*` 与手写短时间单位；`src-tauri/src/terminal.rs` 独立处理 `LANG` / `LC_*`；`src/features/settings/components/sections/SettingsDictationSection.tsx` 与 `src-tauri/src/dictation/real.rs` 存在 dictation preferred language。对 Lime 的约束是：UI locale、Agent response language、Browser environment language、terminal locale、ASR language、代码高亮 language 必须分字段治理，不能共用 `Config.language`。
5. 本轮未发现需要推翻首期技术路线的外部资料更新；需要新增到路线图的只是 P3 工具链取舍：短期保留 `detect-translations`，中期优先评估官方 `i18next-cli` 做 extraction、hardcoded string lint、locale sync 与 type generation，AI 自动翻译再作为独立 workflow 接入。

### 2.10 协作复核补充

> 复核时间：2026-05-10
> 口径：本节记录并行协作期间的只读复核结果，只补证据，不扩大实现范围。

本轮在检测到并行 `npm run verify:local` 进程仍在运行后，只做低风险读证与 PRD 补充：

1. Context7 复核 `/websites/i18next`：官方资料仍建议用 namespace、`fallbackLng`、`fallbackNS`、interpolation、plural、context 与 `CustomTypeOptions` 组织大型应用本地化；官方 extraction 文档推荐 `i18next-cli` 承担 key extraction、code lint、locale sync 与 type generation。对 Lime 的落点不变：P0/P1 保持稳定 dotted key 与自有 `detect-translations`，P3 再评估官方 CLI 接入。
2. Context7 复核 `/i18next/react-i18next`：`useTranslation(ns)` 是普通组件文案主入口；`Trans` 只用于带 React 节点、链接、强调、代码片段或复杂插值的富文本；关闭 Suspense 后必须通过预加载或 `ready` 防止加载期闪烁。对 Lime 的落点不变：桌面端核心 namespace eager，普通按钮/标题/placeholder 不滥用 `Trans`。
3. Context7 复核 `/vitejs/vite`：`import.meta.glob` 默认 lazy dynamic import，`{ eager: true, import: "default" }` 可直接拿默认导出；glob 参数必须是字面量，不能由变量拼接。对 Lime 的落点不变：`loadNamespace.ts` 使用静态 glob / registry 查表，不在运行时拼资源路径。
4. WebSearch 复核官方/上游资料：i18next TypeScript 与 extraction、Vite glob import、MDN `lang` / `dir` / `Intl`、W3C language tag 与 Tauri Store 的结论未变化；P0 不引入第二套 Store 或 browser detector 事实源，仍复用现有 `Config.language` 与包内 resources。
5. LobeHub 本地只读复核：`/Users/coso/Documents/dev/js/lobehub/package.json` 当前使用 `i18next ^25.8.0`、`react-i18next ^16.5.3`、`i18next-browser-languagedetector ^8.2.0`、`i18next-resources-to-backend ^1.2.1`、`rtl-detect ^1.1.2`、`@lobehub/i18n-cli ^1.26.0`；`locales` 下有 18 个 locale 目录，`locales/en-US` 下有 46 个 JSON namespace；仍适合作为成熟 workflow 与 loader 样板，而不是首期语言规模样板。
6. CodexMonitor 本地只读复核：`/Users/coso/Documents/dev/rust/CodexMonitor/package.json` 仍无 `i18next` / `react-i18next` / `@formatjs/intl` / `dayjs`；代码中同时存在 `Intl.RelativeTimeFormat`、`localeCompare`、terminal `LANG` / `LC_*`、dictation preferred language、code block language 等 language-like 场景。对 Lime 的落点不变：格式化走统一 `format.ts`，UI locale、ASR language、terminal locale 与代码高亮 language 必须拆字段治理。
7. Lime 当前读证：`package.json` 已有 `i18next ^25.7.3`、`react-i18next ^16.5.1`、`dayjs ^1.11.19`，未引入 detector/backend/RTL 依赖；`src/i18n/resources` 当前已有 `zh-CN`、`en-US`、`zh-TW`、`ja-JP`、`ko-KR` 五个 locale，每个 locale 均有 `common`、`navigation`、`settings`、`workspace`、`agent`、`errors` 六个核心 namespace。

## 3. 问题诊断

### 3.1 Patch Layer 的上限

当前 Patch Layer 的优势是侵入小、见效快，但长期问题明显：

- 只能替换已渲染文本，无法稳定处理变量、复数、富文本、组件插槽和运行时错误。
- 依赖 DOM 扫描与 `MutationObserver`，页面越复杂，性能和时序风险越高。
- 资源 key 是中文原文，文案微调会导致 key 失效，无法稳定引用。
- 只能表达 `zh/en`，无法承载 `zh-CN`、`zh-TW`、`ja-JP`、`ko-KR`、RTL 等真实 locale。
- 不能参与类型检查、静态扫描、unused key 清理与 CI 覆盖率。
- 容易把“用户界面语言”“AI 回复语言”“浏览器环境语言”“内容产物语言”混成一个字段。

### 3.2 现有配置语义过窄

Rust 注释仍把 `Config.language` 描述为 `"zh" 或 "en"`，但全球本地化需要 BCP 47 风格 locale，例如 `zh-CN`、`en-US`、`ja-JP`。首期应做兼容 normalize：

| 旧值 | 新规范值                          |
| ---- | --------------------------------- |
| `zh` | `zh-CN`                           |
| `en` | `en-US`                           |
| 空值 | `auto` 或 `zh-CN`，按阶段策略决定 |

### 3.3 语言概念混用风险

Lime 已有多个 language-like 场景：

- UI locale：控制 Lime 界面语言。
- Response language：控制 Agent 默认回复语言。
- Content target language：控制 Artifact / 文章 / 翻译 / media task 的产物语言。
- Browser environment locale：控制远程站点看到的 `Accept-Language`、timezone、locale。
- ASR / dictation language：控制语音识别语言。
- Code block language：只是语法高亮标签，不是自然语言。

PRD 必须明确这些概念的边界，避免把一个全局 `language` 字段扩成所有场景的隐式事实源。

## 4. 产品目标

### 4.1 总目标

建立 Lime 全球本地化能力层，使新功能默认可翻译、可校验、可持续增加 locale，并让桌面端 GUI 在语言切换后保持稳定可用。

### 4.2 首期语言范围

首期推荐支持：

| Locale  | 显示名   | 用途                                       |
| ------- | -------- | ------------------------------------------ |
| `auto`  | 跟随系统 | 默认推荐项，按系统/浏览器 locale normalize |
| `zh-CN` | 简体中文 | Source locale 与默认 fallback              |
| `en-US` | English  | 第一海外主语言                             |
| `zh-TW` | 繁體中文 | 中文变体与繁体排版验证                     |
| `ja-JP` | 日本語   | CJK 非中文验证                             |
| `ko-KR` | 한국어   | CJK 非中文验证                             |

后续候选：`fr-FR`、`de-DE`、`es-ES`、`pt-BR`、`vi-VN`、`ar`、`fa-IR`。其中 `ar` / `fa-IR` 必须等 RTL 基础设施完成后再进入主支持列表。

### 4.3 用户价值

- 海外用户首次启动能看到可理解的核心路径，而不是只看到中文。
- 中文用户可以保持中文 UI，同时让 Agent 输出英文、日文或韩文。
- 创作/翻译任务能显式选择目标语言，不受 UI 语言影响。
- Browser Runtime 可以继续模拟目标市场环境，不被 UI 语言污染。
- 新增页面的本地化质量可被脚本和测试机械约束。

## 5. 非目标

1. 不做 Web SEO、locale route、sitemap 或 URL 级语言切换。
2. 不一次性迁移全部历史页面和角落文案。
3. 不继续扩大 `src/i18n/legacy-patch/patches/*.json` 作为 current 主机制。
4. 不在首期引入完整翻译管理平台；自动翻译先以 repo 内 JSON、脚本与 PR workflow 为事实源。
5. 不把 Browser Runtime 的 `Accept-Language` 绑定到 Lime UI locale。
6. 不要求 Rust 后端立即清空所有中文错误字符串，但新增 current 主路径应返回 code + params。

## 6. 目标架构

### 6.1 目录结构

建议目标结构：

```text
src/i18n/
├── createI18n.ts
├── format.ts
├── loadNamespace.ts
├── locales.ts
├── provider.tsx
├── resources/
│   ├── zh-CN/
│   │   ├── common.json
│   │   ├── navigation.json
│   │   ├── settings.json
│   │   ├── workspace.json
│   │   ├── agent.json
│   │   ├── browser.json
│   │   ├── artifact.json
│   │   ├── knowledge.json
│   │   ├── sceneapp.json
│   │   └── errors.json
│   ├── en-US/
│   ├── zh-TW/
│   ├── ja-JP/
│   └── ko-KR/
├── legacy-patch/
│   ├── I18nPatchProvider.tsx
│   ├── dom-replacer.ts
│   └── patches/
└── types.d.ts
```

迁移原则：

- `resources/zh-CN` 是 source locale。
- 新 UI 只允许使用 `useTranslation(ns)` / `Trans` / `t()`，不新增 Patch key。
- `legacy-patch` 只覆盖未迁移历史 UI，并且需要退出条件。
- namespace 内推荐继续使用扁平 dotted key，并设置 `keySeparator: false`，避免深层对象重排带来的翻译 diff 噪音。

### 6.2 Locale registry

`src/i18n/locales.ts` 负责：

- `SUPPORTED_LOCALES`
- `SOURCE_LOCALE = "zh-CN"`
- `FALLBACK_LOCALE = "zh-CN"`
- `localeOptions`
- `normalizeLocale(input?: string): Locale`
- `resolveAutoLocale(systemLocale?: string): Locale`
- `isRtlLocale(locale): boolean`
- 兼容旧值 `zh` / `en`

normalize 规则：

1. 空值或 `auto`：读取系统/浏览器 locale，无法识别时落到 `zh-CN`。
2. `zh`、`zh-Hans`、`cn`：归一到 `zh-CN`。
3. `zh-Hant`、`zh-TW`、`zh-HK`：首期归一到 `zh-TW`。
4. `en`、`en-*`：首期归一到 `en-US`。
5. `ja`、`ko`：分别归一到 `ja-JP`、`ko-KR`。
6. 未支持 locale：落到 `zh-CN`，并记录 debug warning。

### 6.3 i18next 初始化

`createI18n.ts` 负责创建单例或 scoped instance：

- `fallbackLng: "zh-CN"`
- `defaultNS: "common"`
- `ns` 不一次性声明所有 namespace，按核心和业务分层加载。
- `react.useSuspense = false`，避免桌面端切换语言时出现大面积 loading。
- 核心 namespace eager preload：`common`、`navigation`、`settings`、`workspace`、`agent`、`errors`。
- 非核心 namespace lazy load：`sceneapp`、`knowledge`、`artifact`、`browser`、`media`、`voice` 等。
- `languageChanged` 时同步：
  - `document.documentElement.lang`
  - `document.documentElement.dir`
  - `dayjs.locale` 或统一 date adapter
  - format cache invalidation

### 6.4 Namespace loading

`loadNamespace.ts` 采用 Vite `import.meta.glob`：

- Web/dev 模式可 lazy load：`import.meta.glob("./resources/*/*.json")`
- 桌面稳定模式可 eager load 核心资源，避免 Tauri 首屏懒加载抖动。
- namespace 缺失时必须回落到 `zh-CN`，并输出可测试的 warning。
- 资源加载失败不能让 App 白屏，最多显示 source locale 文案。

### 6.5 类型安全

`types.d.ts` 使用 i18next `CustomTypeOptions` 绑定 resources：

- `defaultNS: "common"`
- migrated namespaces 进入类型检查。
- 允许迁移期对未迁移 namespace 使用宽类型，但 current 主路径不应长期停留宽类型。
- P1 不强制启用 i18next selector API；P3 再结合资源规模、TypeScript 内存表现与官方 `@i18next-selector/codemod` 评估从 string key 迁到 selector key。
- 类型绑定只覆盖已经迁移且 key 稳定的 namespace，避免把还在快速变动的 legacy 文案提前固化成长期类型债。

### 6.6 统一格式化 API

`format.ts` 提供统一封装：

- `formatDate(value, options)` -> `Intl.DateTimeFormat(locale, options)`
- `formatNumber(value, options)` -> `Intl.NumberFormat(locale, options)`
- `formatRelativeTime(value, unit, options)` -> `Intl.RelativeTimeFormat(locale, options)`
- `formatList(values, options)` -> `Intl.ListFormat(locale, options)`，如运行环境支持
- `localeCompare(left, right, options)` -> `left.localeCompare(right, locale, options)`

规则：

- 不在翻译 JSON 里手写“分钟前 / days ago”这类时间单位。
- 不直接使用 `undefined` locale，除非明确是 `auto` 语义。
- 所有用户可见列表排序需要显式考虑 locale。

## 7. 产品边界

### 7.1 UI language

定义：控制 Lime GUI 文案、方向、日期数字展示和组件可读性。

事实源：首期复用 `Config.language`，但值迁移到 BCP 47 风格 locale。

设置入口：设置页语言选择器，推荐选项为 `auto`、`zh-CN`、`en-US`、`zh-TW`、`ja-JP`、`ko-KR`。

实现约束：

- 不新增 Tauri 命令，复用 `get_config` / `save_config`。
- `zh` / `en` 只作为读兼容，不作为新写入值。
- 切换语言后无需重启；首期可接受局部组件重新渲染。
- 设置页属于表单型设置页，应遵守 Lime 现有轻盈、清晰、专业的视觉语言，不新增营销式 hero 或高饱和背景。

### 7.2 AI response language

定义：控制 Agent 默认回复语言，不控制 UI。

推荐事实源：首期可新增到 `workspace_preferences.response_language` 或等价用户偏好字段；落点需在实施设计里结合现有 Agent config 最小化 schema 扩散。

产品规则：

- 默认 `auto`：跟随用户最近输入语言或 UI locale，具体算法需在实现文档中定义。
- 用户可以设置固定值，例如 `en-US`、`ja-JP`。
- Agent request metadata 应携带 response language，模型系统提示应显式说明。
- 不能把 UI locale 当成唯一回复语言事实源。

### 7.3 Content target language

定义：控制某次创作、翻译、Artifact、media task 的产物语言。

规则：

- 必须是任务级参数或文档级元数据。
- 不默认写回 UI language。
- SceneApp / Artifact / media task 中已有 `target_language`、`language` 字段时，应统一命名和说明，避免一处表示 UI，一处表示产物。

### 7.4 Browser environment language

定义：控制浏览器访问外站时暴露给网站的 locale、`Accept-Language`、timezone 等环境。

规则：

- 继续由 Browser Environment preset 管理。
- 不随 UI language 自动改变。
- 设置文案中要明确“站点环境语言”和“Lime 界面语言”不是一个概念。

### 7.5 Rust / Tauri 用户可见错误

目标方向：Rust 返回结构化错误，前端翻译最终用户文案。

推荐形态：

```ts
type LocalizedErrorPayload = {
  code: string;
  params?: Record<string, string | number | boolean | null>;
  fallbackMessage?: string;
};
```

迁移原则：

- 新 current 主路径优先返回 `code + params + fallbackMessage`。
- 前端 `errors` namespace 负责展示。
- 历史中文错误不在首期全量改造，但新增命令不得继续扩大中文长文错误面。
- 涉及 Tauri 命令边界时必须遵守四侧同步：前端调用、Rust 注册、治理目录册、mock。

## 8. 迁移路线

### P0：骨架与兼容层

目标：建立 key-based i18n 的最小可运行骨架，不破坏现有页面。

交付：

1. 新增 locale registry 与 normalize。
2. 新增 `createI18n`、provider、核心 resources。
3. 将现有 Patch Layer 移到 `legacy-patch` 或明确标注 legacy boundary。
4. `Config.language` 读取兼容 `zh` / `en`，写入新 locale。
5. `document.documentElement.lang` 与 `dir` 同步。
6. 修复或替换失效的 `detect-translations*` 脚本入口。

验收：

- App 能以 `zh-CN` / `en-US` 启动。
- 未迁移页面仍可由 Patch Layer 兜底。
- 新 provider 不造成首屏白屏或明显闪烁。
- 单测覆盖 normalize 与 fallback。

### P1：设置页与主导航迁移

目标：让用户真实切换 UI language，并覆盖主路径首屏。

交付：

1. 设置页语言选择器迁移到 key-based i18n。
2. 侧栏、顶部栏、主导航、Workspace shell、空态、基础按钮迁移。
3. `common`、`navigation`、`settings`、`workspace`、`errors` namespace 建立 source + en-US。
4. 新增 UI 回归测试，覆盖语言选择、持久化、关键文案。

验收：

- 切换语言后设置页、侧栏、Workspace shell 立即更新。
- 重启后保留选择。
- GUI smoke 覆盖默认 workspace 准备态。

### P2：Agent / Artifact / Browser / Knowledge 主路径

目标：把 Lime 的核心产品能力从“能看懂界面”推进到“能按语言工作”。

交付：

1. Agent Chat 主路径迁移 `agent` namespace。
2. 增加 AI response language 设置与 request metadata 注入。
3. Artifact / 文档 / 文章 / 翻译类任务明确 content target language。
4. Browser Environment 设置页文案明确 `Accept-Language` 与 UI language 的差异。
5. Knowledge / SceneApp / Browser / Artifact 主要入口迁移对应 namespace。
6. 用户可见 toast / error 进入 `errors` namespace。

验收：

- UI 中文、Agent 英文回复的组合可用。
- UI 英文、Browser preset 为日区/美区的组合不互相污染。
- Artifact 目标语言不因 UI 切换而改变。
- 关键错误能通过 error code 翻译展示。

### P3：自动化与治理

目标：让新增 locale、检查漏翻、清理废 key 变成可重复流程。

交付：

1. 参考 LobeHub 建立 `scripts/i18n/*`：
   - source locale 导出
   - missing key 检查
   - unused key 分析
   - protected dynamic key pattern
   - 翻译覆盖率报告
2. 评估官方 `i18next-cli` 作为抽取 / hardcoded string lint / locale sync / type generation 的默认候选；AI 自动翻译部分再对比 `@lobehub/i18n-cli` 与 Lime 自研脚本，首选能最少改动并可 CI 运行的方案。
3. 建立 glossary：产品名、功能名、Agent 术语、Browser Runtime 术语、SceneApp 术语。
4. 自动翻译只创建 PR，不直接覆盖 source locale。
5. PR 模板要求标注新增/变更文案的 namespace。
6. 资源规模扩大后补 bundle 体积与 chunk 策略报告；参考 LobeHub 把核心 namespace 内联、重 namespace 独立切块，避免桌面首屏被非核心 locale 资源拖慢。

验收：

- `npm run i18n:check` 能在本地发现漏 key 与无效 locale。
- `npm run verify:local` 或质量选择器能覆盖 i18n 结构风险。
- 翻译 PR 可审阅、可回滚、不会覆盖人工修订。

### P4：扩展与发布材料

目标：把 i18n 能力从桌面主 App 扩展到生态与发布链路。

交付：

1. Chrome extension 评估是否迁移到 `_locales/messages.json` 标准结构。
2. 发布说明、官网文档、帮助文档进入独立翻译 workflow。
3. 引入 RTL locale 前完成布局审计、截图回归与 Playwright smoke。
4. 多平台 installer / app metadata 本地化评估。

验收：

- extension 与桌面 App 的术语一致。
- RTL 不破坏设置页、侧栏、Workspace、弹窗主路径。
- 发布材料至少覆盖 `zh-CN` / `en-US`。

## 9. 质量门禁

### 9.1 新代码规则

- 新 UI 文案必须进入 namespace resources。
- 禁止在 current 主路径继续新增 `legacy-patch/patches/*.json` key。
- 允许中文注释继续遵守仓库规则，但用户可见文案不得散落在组件里。
- 动态文案使用 interpolation，不使用字符串拼接。
- 富文本或带链接文案使用 `Trans`。
- 数量相关文案使用 plural，不手写 `count === 1` 的英文分支。
- 错误展示走 `errors` namespace。

### 9.2 验证入口

按 Lime 质量工作流：

| 改动类型                                 | 最低验证                                                           |
| ---------------------------------------- | ------------------------------------------------------------------ |
| 仅改 PRD / 文档                          | 读回检查即可                                                       |
| i18n resource / 前端普通迁移             | `npm run verify:local` + i18n 定向测试                             |
| 设置页 / 主导航 / Workspace 可见改动     | `npm run verify:local` + 稳定 UI 回归 + `npm run verify:gui-smoke` |
| Tauri config schema / 命令 / Bridge 变化 | `npm run verify:local` + `npm run test:contracts`                  |
| Rust 错误结构变化                        | Rust 定向测试 + 前端错误展示回归 + contracts                       |
| RTL 或主路径交互变化                     | GUI smoke 后进入 Playwright 续测                                   |

### 9.3 关键回归场景

1. 首次启动：`auto` 能解析到受支持 locale，无法解析则 fallback。
2. 设置页切换：语言立即生效、持久化、重启后保留。
3. Fallback：某 locale 缺少 key 时显示 `zh-CN`，不白屏。
4. `Trans`：带链接/代码/强调的文案在各语言正常渲染。
5. Interpolation：变量顺序在英文、日文、韩文中可调整。
6. Plural：英文复数和中文无复数都能正确展示。
7. Format：日期、数字、相对时间随 UI locale 变化。
8. Agent：UI locale 与 response language 分离。
9. Browser：UI locale 与 `Accept-Language` preset 分离。
10. Patch fallback：未迁移历史页面不阻塞主路径。

## 10. 指标

### 10.1 产品指标

- 首期核心路径 key-based 覆盖率：P1 达到 80%，P2 达到 95%。
- 设置页语言切换成功率：本地 smoke 100%。
- 首屏语言闪烁：核心 namespace 预加载后不出现明显中文/英文闪回。
- 用户可见 hard-coded 文案新增数：current 主路径为 0。

### 10.2 工程指标

- resources 中 `zh-CN` / `en-US` 缺 key 数为 0。
- i18n check 可在本地与 CI 复用。
- Patch Layer 命中量逐阶段下降，并可在 P3 后输出报告。
- 自动翻译 PR 不覆盖人工修改。

## 11. 风险与决策

### 11.1 Source locale 选择

推荐 `zh-CN` 作为 source locale。

理由：Lime 当前产品、文档、注释和用户主路径以中文为事实源；强行改成 `en-US` 会扩大迁移范围。LobeHub 使用 `en-US` 是可参考的成熟形态，但不应机械照搬。

风险：从中文自动翻译到多语言时，需要更强 glossary 与人工 review。

### 11.2 Lazy vs eager load

推荐混合策略：核心 namespace eager，业务 namespace lazy。桌面端如果出现运行时加载抖动，可参考 LobeHub desktop loader 使用 `{ eager: true }`。

### 11.3 Patch Layer 退出条件

Patch Layer 不能无限期作为事实源。建议退出条件：

- P2 后禁止新增 patch key。
- P3 后输出 Patch 命中量报告。
- 核心路径迁移完成后，仅允许 legacy 页面临时保留。
- 当剩余 Patch key 低于约 10% 且无 current 主路径依赖时，拆除 DOM replacer。

### 11.4 自动翻译质量

自动翻译只能降低初稿成本，不能替代 review。必须维护 glossary 与 protected key pattern，并通过 PR 审核进入主分支。

### 11.5 配置迁移

`Config.language` 已存在，首期不新增命令。若新增 response language 字段，必须同步 Rust schema、前端类型、默认 mock、配置文档和验证入口。

## 12. 里程碑建议

| 阶段 | 目标                       | 预计收益                 |
| ---- | -------------------------- | ------------------------ |
| P0   | 建骨架，保兼容             | 新旧 i18n 并存但边界清晰 |
| P1   | 设置与 GUI shell           | 用户能真实切换语言       |
| P2   | Agent / Browser / Artifact | 本地化进入核心产品能力   |
| P3   | 自动化治理                 | 新增语言可持续、可校验   |
| P4   | 扩展与发布材料             | 全球发布闭环             |

## 13. 第一刀建议

第一刀不要直接翻译全仓，也不要先接自动翻译。建议先做最小 current skeleton：

1. 建 `src/i18n/locales.ts`，完成 locale registry 与 normalize 单测。
2. 建 `src/i18n/resources/zh-CN` 与 `en-US` 的核心 namespace 最小集。
3. 建 `createI18n.ts` / provider，替换根部 i18next 初始化，但继续包住 legacy Patch Layer。
4. 设置页新增 UI language 选择，复用 `getConfig` / `saveConfig`。
5. 补 `settings` 与 `navigation` 的稳定回归，再跑 `npm run verify:local` 与 `npm run verify:gui-smoke`。

这一刀的价值是把事实源从 DOM Patch 拉回 key-based resources，同时不要求一次性迁移全仓。

## 14. 当前第一刀落地状态

> 记录日期：2026-05-10
> 口径：本节只记录 P0/P1 起步骨架，不代表全仓本地化完成。

已落地：

1. `src/i18n/locales.ts` 已建立 locale registry，支持 `auto`、`zh-CN`、`en-US`、`zh-TW`、`ja-JP`、`ko-KR`，并兼容旧值 `zh` / `en`。
2. `src/i18n/createI18n.ts` 已把 i18next current 主路径初始化到 key-based resources，核心 namespace 包含 `common`、`navigation`、`settings`、`workspace`、`agent`、`errors`。
3. `src/i18n/loadNamespace.ts` 已使用 Vite `import.meta.glob` 建立 bundled core namespace loader，并由 `createI18n.ts` 消费。
4. `src/i18n/format.ts` 已建立日期、数字、相对时间、列表与 locale-sensitive sort 的统一封装。
5. `src/i18n/resources/<locale>/*.json` 已建立核心资源骨架；`settings` 与基础 `common` key 可支撑设置页和语言选择首期迁移。
6. `src/i18n/config.ts` 与 `src/i18n/withI18nPatch.tsx` 已接入 current i18next，同时保留 DOM Patch 作为 legacy fallback。
7. 设置页外观分组与侧边栏语言选择已改为写入 BCP 47 locale，并同步 legacy Patch 的 `"zh" | "en"` 兼容语言。
8. 设置页 About 区块已从自然语言 key 迁移到 `settings.about.*` namespace key，并补齐 5 个 locale 资源。
9. 设置页 Profile 区块已迁移到 `settings.profile.*` namespace key，字段说明、状态、头像提示、偏好标签和资料使用说明均进入 5 个 locale 资源。
10. 设置页 Stats 区块已迁移到 `settings.stats.*` namespace key，时间范围、概览、模型排行、趋势图和活跃日历文案均进入 5 个 locale 资源，并开始使用 `format.ts` 的 locale-aware 日期格式化。
11. `Config.language` 默认值与注释已从旧 `"zh" / "en"` 语义迁移到 BCP 47 / `auto` 语义；Rust 默认 UI locale 改为 `zh-CN`，前端类型和 mock 默认配置同步说明，legacy `"zh" / "en"` 仅保留为读兼容。
12. 设置页 `_layout` 共享壳层已迁移到 `settings.layout.*` namespace key，顶部回首页按钮、所有 lazy fallback 文案和 not-found 占位文案均进入 5 个 locale 资源。
13. `.gitignore` 已放行 `docs/roadmap/i18n/*.md`，确保本 PRD 可作为版本化工件进入仓库。
14. Patch Layer 已物理搬入 `src/i18n/legacy-patch/`，根层只保留 current i18next、resources、format、locale registry 与 bootstrap；旧 DOM Patch 路径正式归类为迁移期 compatibility/deprecated surface。
15. `src/lib/governance/legacySurfaceCatalog.json` 已把旧根层 Patch 文件纳入 `i18n-dynamic-template-legacy-surface` dead-candidate 守卫，防止 `@/i18n/I18nPatchProvider`、`@/i18n/text-map` 与根层 `patches/*` 回流。
16. 侧边栏主导航、底部系统入口、导航折叠 / 展开、搜索任务、插件扩展分组与语言二级菜单的可见文案已迁入 `navigation` namespace；切换到 `en-US` 后主导航会显示 `New Task` / `Project Knowledge` 等 key-based 文案，不再依赖 DOM Patch。
17. 侧栏搜索弹窗与会话列表起步文案已迁入 `navigation` namespace，覆盖搜索输入 / 空态 / 加载 / 更多按钮、新建对话、最近 / 归档分组、会话操作菜单、多选 toolbar、收藏 badge 与操作菜单 aria/title 文案。
18. 会话列表与搜索结果的空标题兜底、更新时间 meta、归档 meta 已改为 current i18n + `Intl.RelativeTimeFormat` / `Intl.DateTimeFormat`，英文界面会显示 `Untitled conversation`、`2m ago`、`Archived 3h ago` 等 locale-aware 文案，不再由 `sidebarSessionFormatting.ts` 手写中文单位。
19. 会话重命名 prompt、删除 confirm、重命名 / 删除 toast 已迁入 `navigation` namespace；英文界面删除空标题会话时会展示 `Delete "Untitled conversation"? This cannot be undone.`，并继续复用同一套会话标题兜底。
20. 账号菜单的未登录开源卡片、云端状态、连接云端、用户中心、模型设置、关于、退出登录、云端登录 / 用户中心 toast 已迁入 `navigation` namespace；英文界面未登录账号菜单会显示 `Local ready`、`Open Source Use`、`Connect Lime Cloud` 等 key-based 文案。
21. `src/i18n/types.d.ts` 已接入 i18next `CustomTypeOptions`，把 `zh-CN` source resource 绑定到 `common`、`navigation`、`settings`、`workspace`、`agent`、`errors` namespace，并保持 `keySeparator: false` 的 flat dotted key 策略；`src/i18n/__tests__/types.test.ts` 用 `@ts-expect-error` 覆盖缺失 key，确保 `tsc` 能发现未登记 key。
22. `src/i18n/legacy-patch/dom-replacer.ts` 已补充 Patch 命中量指标基础 API，记录每次 DOM Patch 的 language、root kind、耗时、替换节点数和命中文本段数，并提供 `getI18nPatchMetricsReport()` / `resetI18nPatchMetrics()`，作为 P3 Patch 退出报告的数据来源；`I18nPatchProvider` 的语言切换计数也改为复用同一指标入口。
23. `scripts/i18n-patch-metrics-report.mjs` 与 `scripts/lib/i18n-patch-metrics-report-core.mjs` 已把导出的 Patch runtime metrics 转成稳定 text / JSON 报告，支持 `--check` 与 `maxMatchedSegments` / `maxReplacedNodes` / `maxRuns` 门限，`package.json` 已新增 `npm run i18n:patch-report` 与 `npm run i18n:patch-report:json`。
24. `npm run verify:gui-smoke` 已把 `smoke:knowledge-gui` 接成 Patch metrics 真实 GUI 样本导出入口，默认写入 `.lime/i18n/patch-metrics.json` 并生成 `.lime/i18n/patch-metrics-report.json`；调试无关 GUI smoke 失败时可用 `--skip-i18n-patch-metrics` 跳过。
25. 设置页 Home 首页已迁移到 `settings.home.*` namespace key，覆盖首页 hero、统计 chip、常用入口、桌宠入口、current 入口卡、分组说明与 item 状态文案，并补齐 5 个 locale 资源；测试通过 mock `useTranslation("settings")` 保持稳定回归。
26. 设置页 Developer Lab 合并页已迁移到 `settings.developerLab.*` namespace key，覆盖合并页标题、说明、开发者工具 / 实验功能 tab 文案，并补齐 5 个 locale 资源；测试通过 mock `useTranslation("settings")` 保持稳定回归。
27. 设置页 Skills 高级入口说明已迁移到 `settings.agent.skills.*` namespace key，覆盖高级技能入口标题、Tips aria / 内容和问题反馈链接文案，并补齐 5 个 locale 资源；`SkillsPage` 主体仍按独立 Skills 工作台后续迁移，不在本条完成范围内。
28. 设置页 Hotkeys 已迁移到 `settings.hotkeys.*` namespace key，覆盖页面 hero、状态 chip、错误态、分区摘要、快捷键条目、scope/source/condition 元信息和 `hotkeyCatalog` 共享状态文案，并补齐 5 个 locale 资源；测试通过 mock `useTranslation("settings")` 保持稳定回归。
29. 设置页图片 / 视频服务模型已迁移到 `settings.mediaGeneration.*` namespace key，覆盖 ImageGen / VideoGen 页面标题、说明、Provider 不可用提示、保存结果、空态、回退策略与共享 `MediaPreferenceSection` 的 Tips aria、恢复默认和自动选择文案，并补齐 5 个 locale 资源；测试通过 mock `useTranslation("settings")` 保持稳定回归。
30. 设置页 Service Models 总页 `agent/media-services` 已迁移到 `settings.mediaServices.*` namespace key，覆盖服务模型总览、8 个服务模型分区、当前行为说明、服务模型空态、自定义提示词、AI 图片默认数量与保存结果文案，并补齐 5 个 locale 资源；测试通过 mock `useTranslation("settings")` 保持稳定回归。
31. 设置页 Voice 区块 `agent/voice` 已迁移到 `settings.voice.*` namespace key，覆盖语音输入、Fn / 翻译模式快捷键状态、本地 SenseVoice 模型下载与测试转写、语音处理、语音服务模型和所有保存 / 失败提示文案，并补齐 5 个 locale 资源；测试通过稳定 `useTranslation("settings")` mock 保持 11 个交互回归。
32. 设置页 Providers 内的 `CompanionCapabilityPreferencesCard` 已迁移到 `settings.providers.companion.preference.*` namespace key，覆盖桌宠能力偏好标题说明、当前主链摘要、桌宠通用模型选择、回退策略、空态、重置按钮和保存 / 失败提示文案，并补齐 5 个 locale 资源；测试通过稳定 `useTranslation("settings")` mock 保持独立卡片回归。
33. 设置页 Providers 主体入口已开始迁移到 `settings.providers.*` namespace key，当前覆盖 workspace 顶部切换器的服务商设置 / 云端服务 / 桌宠管理标签与摘要、云端品牌 fallback、登录页 / 用户中心打开成功和失败反馈文案。
34. 设置页 Providers 的 Companion Bridge 诊断区已迁移到 `settings.providers.companion.bridge.*` namespace key，覆盖桌宠连接状态、能力声明、桥接摘要、接入检查、同步建议、脱敏预览、安装引导、刷新 / 开启 / 同步反馈和 Tips aria 文案，并把最近同步时间改为复用 locale-aware `formatDate()`；当前 5 个 locale 均补齐 112 个 bridge key。
35. 设置页 Account / User Center Session 已迁移到 `settings.userCenterSession.*` namespace key，覆盖账户资料 hero、登录状态 chip、云端服务未配置 / 恢复态、会话摘要、账号中心资料维护说明、Google 登录、浏览器授权同步说明、备用邮箱验证码 / 账号密码登录表单和所有输入占位 / 操作按钮文案，并补齐 5 个 locale 资源。
36. 设置页 System / Developer 已迁移到 `settings.developer.*` namespace key，覆盖开发者页标题、调试状态 chip、工作台 / 组件调试开关、诊断日志操作、懒加载 fallback、服务型技能目录、站点脚本目录与 Workspace 自愈记录入口文案；本条只迁移开发者页壳层，懒加载子工具自身文案按独立组件后续迁移。
37. 设置页 System / shared `WorkspaceRepairHistoryCard` 已迁移到 `settings.system.workspaceRepair.*` namespace key，覆盖默认标题说明、记录计数、刷新 / 清空 / 复制操作、空态、来源标签、复制成功 / 失败 / 权限提示和 locale-aware 时间展示；底层 `workspaceHealthTelemetry` 摘要构造仍保持原有诊断事实源，不在本条扩大迁移。
38. 根 `AGENTS.md` 与 `docs/aiprompts/quality-workflow.md` 已新增 current i18n 规则：后续新功能的按钮、标题、空态、toast、confirm、prompt、placeholder、aria/title 与错误提示必须进入 key-based resources，legacy DOM Patch 只允许作为迁移期兜底，不得作为新功能本地化事实源。
39. 设置页 System / Channels 的 `ChannelLogTailPanel` 已迁移到 `settings.channels.logTail.*` namespace key，覆盖日志 Tail 标题说明、暂停 / 继续、复制视图、清空日志、过滤模式、自定义正则、复制 / 清空反馈、确认弹窗、加载 / 空态与错误提示，并把日志时间展示改为 locale-aware；底层 channels runtime / log API 保持原事实源，不在本条扩大命令边界。
40. 设置页 System / Channels 的 `ChannelsDebugWorkbench` 外层工作台壳已迁移到 `settings.channels.workbench.*` namespace key，覆盖日志与检查标题说明、当前查看范围、收口说明、网关 / 日志子页入口、网关与隧道提示、当前摘要、日志排查提示、运行分区 tab、底部未保存栏和保存结果文案；内部网关表单、运行控制与微信兼容扫码排障等长表单文案仍按后续独立小刀迁移。
41. 设置页 System / Channels 的 `GatewayTunnelPanel` 网关与隧道表单已迁移到 `settings.channels.gatewayTunnel.*` namespace key，覆盖公共隧道标题说明、表单字段、placeholder、ngrok 预留选项、操作按钮、cloudflared 系统安装危险确认、执行中状态和最近结果空态；底层 `gatewayTunnel*` runtime 命令和系统安装确认流程保持原行为，不在本条扩大命令边界。
42. 设置页 System / Web Search 已迁移到 `settings.webSearch.*` namespace key，覆盖页面 hero、搜索链路、Provider 凭证、MSE 聚合、图片搜索、观测面板、密钥显示 / 隐藏、外链操作、toast / error、sticky footer、tip aria 与动态状态文案；本条只迁移 Web Search 设置页 UI 文案，底层搜索 provider / app config 命令边界保持原事实源。
43. 设置页 System / Developer 的目录联调懒加载工具已迁移到 `settings.developer.serviceSkillCatalog.*` 与 `settings.developer.siteAdapterCatalog.*` namespace key，覆盖服务型技能目录、站点脚本目录、外部 YAML 导入、Bootstrap Payload 调试、动态状态、示例 placeholder、aria 与操作反馈；本条只迁移 Developer 页的 catalog 联调子工具，底层 crash diagnostic 文案仍按后续共享诊断面收口。
44. 设置页 System / shared `ClipboardPermissionGuideCard` 已迁移到 `settings.system.clipboardPermission.*` namespace key，覆盖 macOS / Windows / Linux / generic 四类剪贴板权限指引、打开系统设置按钮和打开失败提示；底层 crash diagnostic 复制失败消息、导出提示词和诊断摘要已在条目 48 收口到 `errors.crashDiagnostic.*`。
45. 全局 `CrashRecoveryPanel` 恢复模式外壳已迁移到 `errors.crashRecovery.*` namespace key，覆盖恢复模式标题说明、最近错误、模块资源加载失败提示、诊断复制 / 导出 / 清理 / 下载目录操作、workspace 路径修复反馈和强制刷新资源入口；底层 `crashDiagnostic.ts` 构造的诊断正文、复制失败归一化消息和下载目录 fallback 已在条目 48 收口到 `errors.crashDiagnostic.*`。
46. 设置页 System / Channels 的 Telegram / Feishu Gateway 运行控制已迁移到 `settings.channels.gatewayRuntime.*` namespace key，覆盖运行控制标题说明、账号 ID、轮询超时、状态查询 / 启动 / 停止 / 重启按钮、执行中状态、成功 / 失败反馈、stop warning 与最近结果空态；底层 `gatewayChannel*` runtime 命令保持原事实源，不在本条扩大命令边界。
47. 设置页 System / Channels 的微信 Gateway 运行控制与兼容扫码排障已迁移到 `settings.channels.wechatRuntime.*` namespace key，覆盖微信运行控制标题说明、账号 / Base URL / Bot Type / 登录参数字段、列出账号 / 生成二维码 / 等待登录 / 删除账号操作、危险确认、二维码状态、账号目录、运行状态、轮询时间与最近结果空态；底层 `wechatChannel*` / `gatewayChannel*` runtime 命令保持原事实源，不在本条扩大命令边界。
48. 共享 `src/lib/crashDiagnostic.ts` 底层诊断文案已迁移到 `errors.crashDiagnostic.*` namespace key，覆盖诊断采集说明、AI 诊断提示词正文、自动摘要标签、复制失败归一化消息、剪贴板权限指引和下载目录 fallback；诊断 payload 字段名、runtime 命令与日志采集事实源保持原结构，不在本条扩大协议边界。
49. 设置页 System / Chrome Relay 的独立连接引导窗口 `BrowserConnectorGuideWindow` 已迁移到 `settings.chromeRelay.guide.*` namespace key，覆盖扩展安装引导、CDP 直连引导、状态标签、复制 / 打开 / 同步操作、错误反馈、剪贴板提示和源码目录警告；底层浏览器连接器、扩展安装、远程调试和开窗命令保持原事实源，不在本条扩大命令边界。
50. 设置页 General / Memory 的首屏 hero、记忆总开关与偏好画像问卷已迁移到 `settings.memory.*` namespace key，覆盖状态 chip、画像完成度、来源命中摘要、保存操作、问卷题目、选项标签与选择状态；本条只覆盖记忆页首屏与画像问卷，来源链、memdir 写入、自动索引与工作记忆长尾区块仍按后续独立小刀迁移。
51. 设置页 System / Chrome Relay 主设置页核心首屏已迁移到 `settings.chromeRelay.main.*` namespace key，覆盖浏览器列表、系统环境、Chrome 连接能力、扩展连接 / CDP 直连入口、连接器安装状态、常用操作按钮、核心 toast / error、剪贴板反馈和高级工具入口；本条只覆盖主设置页核心浏览器列表与共享操作反馈，高级工具内的 Profile / Bridge / Backend / Debug 长尾面板仍按后续独立小刀迁移。
52. 设置页 System / Chrome Relay 主设置页高级工具起步区已迁移到 `settings.chromeRelay.main.*` namespace key，覆盖高级控制壳层、Overview 卡片、Profile 会话面板、使用建议、实时调试面板、tab 标签、后端类型 label / description 与相关操作文案；本条仍未覆盖高级工具里的连接方式卡、系统连接器、扩展桥接详情、后端策略详情和浏览器动作配置长尾。
53. 设置页 System / Automation 的当前焦点条与概览焦点卡已迁移到 `settings.automation.focus.*` namespace key，覆盖“现在先继续这条”标题 / badge、空态、加载态、最近结果、下一步摘要和查看结果 / 治理 / 详情操作文案；本条只覆盖 Automation 当前焦点条与概览焦点卡，调度器、运行历史、Job Dialog、Details Dialog 与 HealthPanel 长尾仍按后续独立小刀迁移。
54. 设置页 System / Chrome Relay 主设置页高级工具连接方式卡已迁移到 `settings.chromeRelay.main.connectionMethod.*` namespace key，覆盖连接方式标题说明、浏览器扩展 / CDP 直连卡片、推荐 / 待完成 / 已就绪 / 待接入状态、扩展页与远程调试快捷入口、复制配置和断开扩展操作文案；本条只覆盖高级工具顶部连接方式卡，系统连接器、扩展桥接详情、后端策略详情和浏览器动作配置长尾仍按后续独立小刀迁移。
55. 设置页 System / Automation 的 `AutomationHealthPanel` 已迁移到 `settings.automation.health.*` namespace key，覆盖风险提醒标题说明、轮询状态、累计执行、汇总 pill、最近 / 下次轮询、风险任务失败重试、冷却 / 更新时间、状态枚举和空态；时间展示已从硬编码 `toLocaleString("zh-CN")` 收口到 `src/i18n/format.ts` 的 `formatDate()`。
56. 设置页 System / Chrome Relay 主设置页高级工具系统连接器卡已迁移到 `settings.chromeRelay.main.systemConnector.*` namespace key，覆盖系统连接器说明、启用计数、平台 / 授权 / 启用状态标签、能力列表前缀与切换开关 aria；底层 system connector 的 label / description / capabilities 仍保持 runtime 返回事实源，本条不扩大浏览器连接器命令边界。
57. 设置页 System / Chrome Relay 主设置页高级工具浏览器动作配置面板已迁移到 `settings.chromeRelay.main.browserAction.*` namespace key，覆盖动作配置标题说明、读取 / 写入分组标题与能力开关 aria；底层 action capability 的 label / description 仍保持 runtime 返回事实源，本条不扩大浏览器动作命令边界。
58. 设置页 System / Automation 主页面壳层与调度器设置已迁移到 `settings.automation.main.*` / `settings.automation.scheduler.*` namespace key，覆盖页面 hero、加载失败态、刷新 / 新建 / 设置 / 打开入口、顶部状态 pill、tabs、调度器设置卡、调度器保存 toast 与主加载错误 toast；本条不覆盖开始模板、任务列表、运行历史、Job Dialog 与 Details Dialog 长尾。
59. 设置页 System / Chrome Relay 主设置页高级工具后端策略详情面板已迁移到 `settings.chromeRelay.main.backendPolicy.*` namespace key，覆盖后端策略标题说明、默认测试目标、自动回退、优先级、测试 / 保存 / 刷新按钮、当前可用性、能力等待态、native-host 配置状态与平台支持标签；底层 backend status reason / capabilities 仍保持 runtime 返回事实源，本条不扩大浏览器后端策略命令边界。
60. 设置页 System / Chrome Relay 主设置页高级工具扩展桥接详情面板已迁移到 `settings.chromeRelay.main.bridge.*` namespace key，覆盖扩展桥接标题说明、桥接服务状态、observer 接入状态、扩展接入信息、复制配置、端点缺失、observer 最近页面 / 未连接 / 空态提示、扩展测试与刷新扩展状态按钮；底层 WebSocket 端点、Bridge Key、client id 与页面标题仍保持 runtime 返回事实源，本条不扩大扩展桥接命令边界。
61. 设置页 System / Automation 主页面开始模板与任务列表已迁移到 `settings.automation.tasks.*` namespace key，覆盖开始这条卡片、旧浏览器流程下线提醒、三类模板卡与预填默认值、任务列表标题说明、表头、描述兜底、技能流程摘要、状态 badge、下次 / 最近执行、运行 / 详情操作、空态以及创建 / 更新 / 删除 / 立即运行反馈；本条不覆盖运行历史、Job Dialog 与 Details Dialog 长尾。
62. 设置页 System / Automation 运行历史区已迁移到 `settings.automation.history.*` namespace key，覆盖最近运行标题、刷新按钮、run id / session / 完成时间元信息、技能流程运行上下文、参数摘要、补充要求、输出投递状态、失败原因与空态；Details Dialog 其余头部、输出契约、当前起手内容和 Scene App 结果区仍按后续独立小刀迁移。
63. Skills 工作台顶部入口、active scaffold 续用条、搜索输入、搜索空态分流与错误横幅已迁移到 `agent` namespace 的 `skills.workspace.*` key，覆盖页头标题 / 副标题、刷新 / 查看全部操作、续用 / 回到生成按钮、搜索 placeholder、推荐 / 本地 Skills 错误提示，以及“结果模板无匹配但右侧有可用 Skill”的空态说明；本条只覆盖 `SkillsWorkspacePage` 的顶部入口与搜索错误起步区，推荐卡片、最近 / 本地 Skills 卡片、能力草稿面板、启动弹窗与 toast 长尾仍按后续独立小刀迁移。
64. Skills 工作台主体 chrome 已继续迁移到 `agent` namespace 的 `skills.workspace.*` key，覆盖推荐区标题 / 副标题、最近判断横幅、推荐 badge、沿用结果、进入生成、分组详情标题 / 返回 / 空态、分类标题 / 入口、最近侧栏、能力草案 / 已注册能力折叠标题、本地 Skills 侧栏标题 / 调整 / 刚沉淀 / 继续操作、空态以及调整 Skills 弹窗标题与 Tips；本条仍不覆盖推荐卡片内部 runtime 动态摘要、最近 / 本地 Skills 卡片的 runtime 数据、能力草稿面板内部文案、启动弹窗与 toast 长尾。
65. Skills 工作台事件反馈与生成入口提示已迁移到 `agent` namespace 的 `skills.workspace.*` key，覆盖刷新成功 / 失败 toast、本地 Skill 回到生成 entry banner、Workspace Skill runtime enable 失败与授权 banner、Managed Job 草案创建失败 / 成功 / unsupported mode 文案、Skill scaffold 创建成功 / 默认标题、最近判断 launcher prefill hint，以及结果模板回到生成 entry banner；本条仍不覆盖 `buildWorkspaceRuntimeEnablePrompt()` 这类模型执行提示正文、推荐卡片内部 runtime 动态摘要、能力草稿面板内部和启动弹窗内部文案。
66. Skills 工作台 helper 动态摘要已继续迁移到 `agent` namespace 的 `skills.workspace.*` key，覆盖能力草稿缺本地目录错误、本地 Skill 最近目标摘要、分类 starter summary、最近判断行动按钮，以及结果基线 compact summary 的 source title / highlight / count 拼接；本条仍不覆盖 `buildWorkspaceRuntimeEnablePrompt()` 这类模型执行提示正文、外部 presentation helper 返回的 runtime 数据、能力草稿面板内部和启动弹窗内部文案。
67. Skills 工作台已安装 Skill presentation helper 已支持调用方注入本地化兜底文案，并在 `SkillsWorkspacePage` 内接入 `agent` namespace copy，覆盖默认 promise、required inputs、output hint 与“需要 / 交付”前缀；存量非 i18n 调用方仍保持旧中文兜底，避免扩大到 Agent 输入能力选择器，本条只收口 Skills 工作台可见路径。

68. 设置页 System / Automation 的 `AutomationJobDialog` 已迁移到 `settings.automation.jobDialog.*` namespace key，覆盖新建 / 编辑弹窗标题说明、summary pill、基础表单字段、调度提示、旧浏览器流程下线快照、权限模式、输出投递契约、目标地址 placeholder、投递说明、校验错误和底部保存操作；本条只覆盖 Job Dialog，Details Dialog 头部、输出契约、当前起手内容和 Scene App 结果区仍按后续独立小刀迁移。

69. 设置页 System / Automation 的 `AutomationJobDetailsDialog` 长尾已迁移到 `settings.automation.details.*` namespace key，覆盖详情弹窗头部、summary pill、基础元信息、旧浏览器流程下线提示、技能流程上下文、Scene App 回流摘要、输出契约、最近投递结果、当前起手内容、运行历史里的本地时间格式与权限 / 调度 / 投递动态 label；`AutomationJobDetailsDialog.test.tsx` 已补稳定 `useTranslation` mock，避免测试受全局 locale 漂移影响。
70. 设置页 General / Memory 的来源链状态与策略长尾已迁移到 `settings.memory.source.*` / `settings.memory.layers.*` / `settings.memory.action.refresh` namespace key，覆盖记忆命中层可用性、来源链状态总览、来源链策略、运行时 AGENTS 模板与 `.gitignore` 反馈、来源链命中详情、来源分类和相对更新时间；本条只覆盖来源链与分层状态区，`memdir` 写入、自动索引卡片、校验 / 初始化 / 整理反馈仍按后续独立小刀迁移。
71. Skills 工作台 ServiceSkill presentation helper 已支持调用方注入本地化 copy，并在 `SkillsWorkspacePage` 内接入 `agent` namespace 的 `skills.workspace.serviceSkill.*` key，覆盖 ServiceSkill 类型、runner label / description、action label、required inputs 摘要、output destination、readiness dependency 与 fact list 省略格式；同时补齐已安装 Skill helper 之前只靠 `defaultValue` 兜底的 `skills.workspace.installedSkill.defaultPromise` / `fallbackRequiredInputs` / `fallbackOutputHint` 资源 key。存量 Agent Chat / Home 等非 Skills 工作台调用方不传 copy 时仍保持旧中文兜底，避免本轮扩大迁移范围。

本轮验证记录：

1. `npm test -- "src/components/settings-v2/system/about/index.test.tsx" "scripts/detect-missing-translations.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/format.test.ts" "src/i18n/__tests__/locales.test.ts" "src/i18n/withI18nPatch.test.tsx" "src/components/settings-v2/general/appearance/index.test.tsx" "src/components/AppSidebar.test.tsx" "src/components/settings-v2/hooks/useSettingsCategory.test.tsx"` 通过，覆盖 9 个文件、82 个用例。
2. `npm run lint` 通过。
3. `npm run typecheck` 通过。
4. `npm run verify:gui-smoke -- --reuse-running --timeout-ms 300000` 通过，覆盖 workspace ready、Browser Runtime、site adapters、Agent service skill entry、Agent runtime tool surface、Knowledge GUI 与 design canvas smoke。
5. `npm run detect-translations -- --verbose` 通过，确认 `src/i18n/resources` 下 5 个 locale、6 个 namespace、51 个 source key 结构一致。
6. `npx eslint "scripts/detect-missing-translations.ts" "scripts/detect-missing-translations.test.ts" --max-warnings 0` 通过，补足仓库默认 `npm run lint` 只扫描 `src` 的脚本校验缺口。
7. `npm test -- "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/locales.test.ts" "src/i18n/__tests__/format.test.ts"` 通过，覆盖 bundled resources、namespace 存在性与 fallback。
8. 2026-05-10 续测：`npm run detect-translations -- --verbose` 通过；`npm test -- "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/locales.test.ts" "src/i18n/__tests__/format.test.ts" "scripts/detect-missing-translations.test.ts"` 通过，覆盖 4 个文件、13 个用例。
9. 2026-05-10 续测：`npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 曾因当时 `127.0.0.1:3030/health` 无可复用 DevBridge listener 未完成；恢复 headless Tauri / DevBridge 后已在后续记录中复跑通过。
10. 2026-05-10 Profile 迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、126 个 source key 结构一致；`npm test -- "src/components/settings-v2/account/profile/index.test.tsx" "scripts/detect-missing-translations.test.ts" "src/i18n/__tests__/loadNamespace.test.ts"` 通过，覆盖 3 个文件、11 个用例。
11. 2026-05-10 Profile 迁移续测：`npx eslint "src/components/settings-v2/account/profile/index.tsx" "src/components/settings-v2/account/profile/index.test.tsx" --max-warnings 0` 通过；`npm run lint` 通过；`npm run typecheck` 通过。
12. 2026-05-10 Profile 迁移续测：`npm test -- "src/components/settings-v2/account/profile/index.test.tsx" "src/components/settings-v2/system/about/index.test.tsx" "src/components/settings-v2/general/appearance/index.test.tsx" "src/components/AppSidebar.test.tsx" "scripts/detect-missing-translations.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/locales.test.ts" "src/i18n/__tests__/format.test.ts"` 通过，覆盖 8 个文件、85 个用例。
13. 2026-05-10 Stats 迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、202 个 source key 结构一致；`npm test -- "src/components/settings-v2/account/stats/index.test.tsx"` 通过，覆盖 3 个用例。
14. 2026-05-10 Stats 迁移续测：`npm test -- "src/components/settings-v2/account/profile/index.test.tsx" "src/components/settings-v2/account/stats/index.test.tsx" "src/components/settings-v2/system/about/index.test.tsx" "src/components/settings-v2/general/appearance/index.test.tsx" "src/components/AppSidebar.test.tsx" "scripts/detect-missing-translations.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/locales.test.ts" "src/i18n/__tests__/format.test.ts"` 通过，覆盖 9 个文件、88 个用例；`npm run lint` 通过；`npm run typecheck` 通过。
15. 2026-05-10 GUI smoke 复跑：`curl http://127.0.0.1:3030/health` 返回 `status=ok`；`npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过，覆盖 workspace ready、Browser Runtime、site adapters、Agent service skill entry、Agent runtime tool surface、Agent runtime tool surface page、Knowledge GUI 与 Design Canvas smoke。
16. 2026-05-10 全量本地验证尝试：`npm run verify:local` 已启动并通过 `verify:app-version`、`lint`、`typecheck` 以及前 17 个 smart vitest 批次；第 18 批在非 i18n 文件 `src/lib/base-setup/seededServiceSkillPackage.test.ts` 失败，原因是当前工作区 seeded service skill 目录项数量从 16 变为 17，而测试仍断言 16。该失败属于已有非本轮 i18n 脏改动口径，未在本轮修复。
17. 2026-05-10 Config language 迁移续测：`cd src-tauri && cargo test -p lime-core config::` 通过，覆盖 106 个 config 相关测试；`npm test -- "src/i18n/withI18nPatch.test.tsx" "src/components/settings-v2/general/appearance/index.test.tsx" "src/components/AppSidebar.test.tsx" "src/components/settings-v2/account/profile/index.test.tsx" "src/components/settings-v2/account/stats/index.test.tsx" "scripts/detect-missing-translations.test.ts"` 通过，覆盖 6 个文件、74 个用例；`npm run detect-translations -- --verbose`、`npm run lint`、`npm run typecheck` 通过。
18. 2026-05-10 Settings layout 迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、219 个 source key 结构一致；`npm test -- "src/components/settings-v2/_layout/index.test.tsx"` 通过，覆盖 9 个用例；`npx eslint "src/components/settings-v2/_layout/index.tsx" "src/components/settings-v2/_layout/index.test.tsx" --max-warnings 0` 与 `npm run typecheck` 通过。
19. 2026-05-10 Settings 主路径组合续测：`npm test -- "src/components/settings-v2/_layout/index.test.tsx" "src/components/settings-v2/account/profile/index.test.tsx" "src/components/settings-v2/account/stats/index.test.tsx" "src/components/settings-v2/system/about/index.test.tsx" "src/components/settings-v2/general/appearance/index.test.tsx" "src/components/AppSidebar.test.tsx" "src/i18n/withI18nPatch.test.tsx" "scripts/detect-missing-translations.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/locales.test.ts" "src/i18n/__tests__/format.test.ts"` 通过，覆盖 11 个文件、98 个用例。
20. 2026-05-10 Settings layout 迁移后 GUI smoke：`npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过，覆盖 workspace ready、Browser Runtime、site adapters、Agent service skill entry、Agent runtime tool surface、Agent runtime tool surface page、Knowledge GUI 与 Design Canvas smoke。
21. 2026-05-10 Legacy Patch 物理迁移续测：`npm test -- "src/i18n/withI18nPatch.test.tsx" "src/components/settings-v2/general/appearance/index.test.tsx" "src/components/AppSidebar.test.tsx" "src/i18n/__tests__/config-validation.test.ts" "src/i18n/__tests__/edge-cases.test.ts" "src/i18n/__tests__/translation-coverage.test.ts"` 通过，覆盖 6 个文件、90 个通过用例、1 个跳过用例；`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、219 个 source key 结构一致；`npm run lint` 与 `npm run typecheck` 通过。
22. 2026-05-10 Legacy Patch 物理迁移后 GUI smoke：`npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过，覆盖 workspace ready、Browser Runtime、site adapters、Agent service skill entry、Agent runtime tool surface、Agent runtime tool surface page、Knowledge GUI 与 Design Canvas smoke。
23. 2026-05-10 Legacy Patch 物理迁移后全量本地验证尝试：`npm run verify:local` 已通过 `verify:app-version`、`lint`、`typecheck` 以及前 17 个 smart vitest 批次；第 18 批仍在非 i18n 文件 `src/lib/base-setup/seededServiceSkillPackage.test.ts` 失败，原因仍是 seeded service skill 目录项数量从 16 变为 17，而测试断言仍为 16。
24. 2026-05-10 Legacy Patch 根层回流守卫续测：`npm test -- "src/lib/governance/legacySurfaceCatalog.test.ts"` 通过，覆盖 142 个用例；`npm run governance:legacy-report` 通过，摘要为边界违规 0、分类漂移候选 0、零引用候选 0；更新守卫后再次执行 `npm run lint` 通过。
25. 2026-05-10 Navigation namespace 迁移续测：`npm test -- "src/components/AppSidebar.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts"` 通过，覆盖 2 个文件、57 个用例；`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、239 个 source key 结构一致；`npm run typecheck` 与 `npm run lint` 通过；`npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过，覆盖 workspace ready、Browser Runtime、site adapters、Agent service skill entry、Agent runtime tool surface、Agent runtime tool surface page、Knowledge GUI 与 Design Canvas smoke。
26. 2026-05-10 Navigation 搜索 / 会话列表续测：`npm test -- "src/components/AppSidebar.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts"` 通过，覆盖 2 个文件、57 个用例；`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、273 个 source key 结构一致；`npm run lint` 与 `npm run typecheck` 通过；`npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过，覆盖 workspace ready、Browser Runtime、site adapters、Agent service skill entry、Agent runtime tool surface、Agent runtime tool surface page、Knowledge GUI 与 Design Canvas smoke。
27. 2026-05-10 Navigation 会话 meta / prompt / confirm / toast 续测：`npm test -- "src/components/app-sidebar/sidebarSessionFormatting.test.ts" "src/components/AppSidebar.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts"` 通过，覆盖 3 个文件、61 个用例；`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、281 个 source key 结构一致；`npm run lint`、`npm run typecheck` 与 `git diff --check` 通过；`npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过，覆盖 workspace ready、Browser Runtime、site adapters、Agent service skill entry、Agent runtime tool surface、Agent runtime tool surface page、Knowledge GUI 与 Design Canvas smoke。
28. 2026-05-10 Navigation 账号菜单续测：`npm test -- "src/components/AppSidebar.test.tsx" "src/components/app-sidebar/sidebarSessionFormatting.test.ts" "src/i18n/__tests__/loadNamespace.test.ts"` 通过，覆盖 3 个文件、62 个用例；`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、307 个 source key 结构一致；`npm run lint`、`npm run typecheck` 与 `git diff --check` 通过；`npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过，覆盖 workspace ready、Browser Runtime、site adapters、Agent service skill entry、Agent runtime tool surface、Agent runtime tool surface page、Knowledge GUI 与 Design Canvas smoke。
29. 2026-05-10 最终调研复核与 PRD 2.9 写入后续测：`git diff --check -- "docs/roadmap/i18n/prd.md"` 通过；`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、307 个 source key 结构一致；`npm test -- "src/components/AppSidebar.test.tsx" "src/components/app-sidebar/sidebarSessionFormatting.test.ts" "src/i18n/__tests__/loadNamespace.test.ts"` 通过，覆盖 3 个文件、62 个用例；`npm run lint`、`npm run typecheck` 与 `npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过。
30. 2026-05-10 i18next 类型绑定续测：`npm test -- "src/i18n/__tests__/types.test.ts" "src/i18n/__tests__/loadNamespace.test.ts"` 通过，覆盖 2 个文件、5 个用例；`npm run typecheck` 通过，确认缺失 key 的 `@ts-expect-error` 仍被类型系统识别；`npm run lint`、`npm run detect-translations -- --verbose` 与 `git diff --check -- "src/i18n/types.d.ts" "src/i18n/__tests__/types.test.ts"` 通过。
31. 2026-05-10 Legacy Patch 命中量指标续测：`npm test -- "src/i18n/__tests__/legacyPatchMetrics.test.ts" "src/i18n/__tests__/edge-cases.test.ts" "src/i18n/__tests__/types.test.ts" "src/i18n/__tests__/loadNamespace.test.ts"` 通过，覆盖 4 个文件、16 个通过用例、1 个跳过用例；`npm run typecheck`、`npm run lint`、`npm run detect-translations -- --verbose` 与 `git diff --check` 通过；`npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过。
32. 2026-05-10 Legacy Patch metrics 离线报告续测：`npm test -- "scripts/lib/i18n-patch-metrics-report-core.test.ts" "src/i18n/__tests__/legacyPatchMetrics.test.ts" "src/i18n/__tests__/edge-cases.test.ts"` 通过，覆盖 3 个文件、14 个通过用例、1 个跳过用例；临时 metrics JSON 执行 `node scripts/i18n-patch-metrics-report.mjs --format json` 通过并返回 `status=no-hit` / `retirementCandidate=true`；`npm run lint` 与 `git diff --check -- "scripts/lib/i18n-patch-metrics-report-core.mjs" "scripts/lib/i18n-patch-metrics-report-core.test.ts" "scripts/i18n-patch-metrics-report.mjs" "package.json"` 通过。
33. 2026-05-10 GUI smoke metrics 导出链续测：`node --check "scripts/knowledge-gui-smoke.mjs"` 与 `node --check "scripts/verify-gui-smoke.mjs"` 通过；`npm test -- "scripts/lib/i18n-patch-metrics-report-core.test.ts"` 通过，覆盖 1 个文件、3 个用例；`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、355 个 source key 结构一致；`git diff --check -- "scripts/knowledge-gui-smoke.mjs" "scripts/verify-gui-smoke.mjs"` 通过。
34. 2026-05-10 Settings Home 迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、355 个 source key 结构一致；`npm test -- "src/components/settings-v2/home/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、11 个用例；`npm run typecheck`、`npm run lint`、`git diff --check` 与 `npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过。
35. 2026-05-10 Developer Lab 迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、359 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/developer-lab/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、8 个用例；`npm run typecheck`、`npm run lint`、定向 `git diff --check` 与 `npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过，GUI smoke 同步导出 Patch metrics 且状态仍为 `no-hit`。
36. 2026-05-10 Settings Skills 高级入口迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、363 个 source key 结构一致；`npm test -- "src/components/settings-v2/agent/skills/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、6 个用例；`npm run typecheck`、`npm run lint` 与 `git diff --check -- "src/components/settings-v2/agent/skills/index.tsx" "src/components/settings-v2/agent/skills/index.test.tsx" "src/i18n/resources/zh-CN/settings.json" "src/i18n/resources/en-US/settings.json" "src/i18n/resources/ja-JP/settings.json" "src/i18n/resources/ko-KR/settings.json" "src/i18n/resources/zh-TW/settings.json"` 通过。
37. 2026-05-10 Settings Hotkeys 迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、476 个 source key 结构一致；`npm test -- "src/components/settings-v2/general/hotkeys/index.test.tsx" "src/components/settings-v2/general/hotkeys/hotkeyCatalog.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 4 个文件、12 个用例；`npm run typecheck`、`npm run lint`、定向 `git diff --check` 与 `npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 通过，GUI smoke 同步导出 Patch metrics 且状态仍为 `no-hit`。
38. 2026-05-10 Settings 图片 / 视频服务模型迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、499 个 source key 结构一致；`npm test -- "src/components/settings-v2/agent/image-gen/index.test.tsx" "src/components/settings-v2/agent/video-gen/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 4 个文件、12 个用例；`npm run typecheck`、`npm run lint` 与定向 `git diff --check` 通过。
39. 2026-05-10 Settings 图片 / 视频服务模型迁移后 GUI smoke 复跑：`npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000` 连续两次在 `smoke:claw-chat-ready-streaming` 阶段失败；前置 `bridge:health`、workspace ready、Browser Runtime、site adapters、Agent service skill entry 与 runtime tool surface 已通过，失败证据指向 Agent streaming smoke 断言 `streamGrowthObserved=false` / provider-follow 断言不满足，属于当前运行时 smoke 阻塞项，不是 Settings i18n 文案迁移的定向回归依据；本轮未修复该无关阻塞。
40. 2026-05-10 Settings Service Models 总页迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、543 个 source key 结构一致；`npm test -- "src/components/settings-v2/agent/media-services/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、10 个用例；`npm run typecheck`、`npm run lint` 与定向 `git diff --check` 通过。由于记录 39 的 `smoke:claw-chat-ready-streaming` 仍是当前运行时 smoke 阻塞项，本轮未重复消耗 GUI smoke，待该无关 blocker 收口后再复跑设置页主路径 GUI smoke。
41. 2026-05-10 Settings Voice 迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、661 个 source key 结构一致；`npm test -- "src/components/settings-v2/agent/voice/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、16 个用例；`npm run typecheck`、`npm run lint` 与定向 `git diff --check` 通过。GUI smoke 仍受记录 39 的 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Voice 文案迁移阻塞项。
42. 2026-05-10 Settings Providers 桌宠能力偏好卡迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、684 个 source key 结构一致；`npm test -- "src/components/settings-v2/agent/providers/CompanionCapabilityPreferencesCard.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、7 个用例；`npm run typecheck`、`npm run lint` 与定向 `git diff --check` 通过。本条只覆盖 Providers 页内独立桌宠偏好卡，`agent/providers/index.tsx` 主体仍待后续迁移。
43. 2026-05-10 Settings Providers 顶部入口与云端反馈迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、696 个 source key 结构一致；`npm test -- "src/components/settings-v2/agent/providers/index.test.tsx" "src/components/settings-v2/agent/providers/CompanionCapabilityPreferencesCard.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 4 个文件、24 个用例；`npm run typecheck`、`npm run lint` 与定向 `git diff --check` 通过。本条只覆盖 Providers 顶部 workspace 切换器与云端打开反馈，Companion Bridge 诊断区仍需继续迁移。
44. 2026-05-10 Settings Providers Companion Bridge 迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、808 个 source key 结构一致；`npm test -- "src/components/settings-v2/agent/providers/index.test.tsx" "src/components/settings-v2/agent/providers/CompanionCapabilityPreferencesCard.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 4 个文件、24 个用例；`npm run typecheck`、`npm run lint` 与定向 `git diff --check` 通过；`npm run verify:local` 已通过 `verify:app-version`、`lint`、`typecheck` 和前 20 个 smart vitest 批次，随后仍在非 i18n 文件 `src/lib/base-setup/seededServiceSkillPackage.test.ts` 因 16 / 17 seeded service skill 数量断言失败，本轮未修复该无关 blocker。
45. 2026-05-10 Settings User Center Session 迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、891 个 source key 结构一致；`npm test -- "src/components/settings-v2/account/user-center-session/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、10 个用例；`npm run typecheck`、`npm run lint` 与定向 `git diff --check` 通过。
46. 2026-05-10 Settings Developer 壳层迁移续测：`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、940 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/developer/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、19 个用例；`npm run typecheck`、`npm run lint` 与定向 `git diff --check` 通过。
47. 2026-05-10 Settings Workspace 自愈记录共享卡片与新增文案规则续测：`npm test -- "src/components/settings-v2/system/shared/WorkspaceRepairHistoryCard.test.tsx" "src/components/settings-v2/agent/skills/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 4 个文件、9 个用例；`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、940 个 source key 结构一致；`npm run typecheck`、`npm run lint` 与定向 `git diff --check` 通过。
48. 2026-05-10 Settings Environment 页迁移续测：`src/components/settings-v2/system/environment/index.tsx` 已接入 `useTranslation("settings")`，覆盖页面 hero、Shell 导入状态、显式覆盖表单、合并规则、使用提示、生效预览、来源标签、按钮、tip aria 与空态；新增 `settings.environment.*` 共 107 个 key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1070 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/environment/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、10 个用例；`npm run lint` 与定向 `git diff --check` 通过。该记录中曾受并行进程新增的 `src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx` `Timeout` 类型不匹配影响，后续已在记录 49 随 Channels Log Tail 本刀复跑 `npm run typecheck` 收口；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，未把该无关失败作为 Environment 文案迁移阻塞项。
49. 2026-05-10 Settings Channels Log Tail 迁移续测：`src/components/settings-v2/system/channels/ChannelLogTailPanel.tsx` 已接入 `useTranslation("settings")`，覆盖日志 Tail 标题说明、暂停 / 继续、复制 / 清空、过滤 / 自定义正则、copy / clear / error / confirm、loading / empty 与 locale-aware 时间；新增 `settings.channels.logTail.*` 并同步 5 个 locale。`npm test -- "src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx" "src/components/settings-v2/system/channels/channel-log-filter.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 4 个文件、14 个用例；`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1070 个 source key 结构一致；`npm run typecheck`、`npm run lint` 与定向 `git diff --check` 通过。GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Channels Log Tail 文案迁移阻塞项。
50. 2026-05-10 Settings Experimental 页迁移续测：`src/components/settings-v2/system/experimental/index.tsx` 已接入 `useTranslation("settings")`，覆盖实验功能 hero、Tool Calling 2.0、截图对话、macOS 屏幕录制权限提示、WebMCP 预留、崩溃上报与诊断、剪贴板权限指引、更新提醒、Workspace 自愈记录入口、按钮、aria、toast / error / export message 与 deferred fallback；新增 `settings.experimental.*` 共 82 个 key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1152 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/experimental/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、10 个用例；`npm run lint` 与定向 `git diff --check` 通过。`npm run typecheck` 本轮尝试时遇到多个并行 typecheck 进程长时间占用，已终止本轮进程，未把它记为通过证据；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Experimental 文案迁移阻塞项。
51. 2026-05-10 Settings Channels Workbench 壳层迁移续测：`src/components/settings-v2/system/channels/ChannelsDebugWorkbench.tsx` 已接入 `useTranslation("settings")`，覆盖工作台标题说明、范围提示、网关 / 日志入口、摘要、日志排查提示、运行 tab、未保存栏和保存结果；新增 `settings.channels.workbench.*` 并同步 5 个 locale。`npm test -- "src/components/settings-v2/system/channels/ChannelsDebugWorkbench.test.tsx" "src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx" "src/components/settings-v2/system/channels/channel-log-filter.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 5 个文件、15 个用例；`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1196 个 source key 结构一致；`npm run lint` 与定向 `git diff --check` 通过。`npm run typecheck` 本轮单独尝试超过 11 分钟无诊断输出，且当时隔壁进程正在跑 `verify:local` / Rust check / 另一条 typecheck，为避免抢占资源已终止本轮进程；本条不把 typecheck 记为通过证据。GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Channels Workbench 壳层文案迁移阻塞项。
52. 2026-05-10 Settings Web Search 页迁移续测：`src/components/settings-v2/system/web-search/index.tsx` 已接入 `useTranslation("settings")`，覆盖页面 hero、tabs、搜索链路、Provider 凭证、MSE 聚合、图片搜索、观测面板、密钥显示 / 隐藏、外链申请 / 文档入口、动态状态、保存 / 失败反馈和 sticky footer；新增 `settings.webSearch.*` 共 113 个 key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1309 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/web-search/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、18 个用例；`npm run lint` 通过。`npm run typecheck` 本轮发现隔壁进程已有运行中的 typecheck，为避免和并行任务抢占资源，暂未重复启动；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Web Search 文案迁移阻塞项。
53. 2026-05-10 Settings Channels Gateway Tunnel 迁移续测：`GatewayTunnelPanel` 已接入 `useTranslation("settings")`，覆盖公共隧道标题说明、Provider / mode / host / port / public URL / Cloudflare 字段、Run Token / Credentials File / Feishu account、cloudflared 检测 / 安装 / 探测 / 创建 / 启停 / 同步回调按钮、危险确认、执行中状态和最近结果空态；新增 `settings.channels.gatewayTunnel.*` 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1339 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/channels/ChannelsDebugWorkbench.test.tsx" "src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx" "src/components/settings-v2/system/channels/channel-log-filter.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 5 个文件、16 个用例；`npx eslint "src/components/settings-v2/system/channels/ChannelsDebugWorkbench.tsx" "src/components/settings-v2/system/channels/ChannelsDebugWorkbench.test.tsx" "src/components/settings-v2/system/channels/ChannelLogTailPanel.tsx" "src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx" "src/components/settings-v2/system/channels/channel-log-filter.ts" "src/components/settings-v2/system/channels/channel-log-filter.test.ts" --max-warnings 0` 与定向 `git diff --check` 通过。`npm run typecheck` 仍有隔壁运行中的 typecheck / verify:local，本轮未重复启动；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Gateway Tunnel 文案迁移阻塞项。
54. 2026-05-10 Settings Developer 目录联调懒加载工具迁移续测：`src/components/settings-v2/system/developer/ServiceSkillCatalogTools.tsx` 与 `src/components/settings-v2/system/developer/SiteAdapterCatalogTools.tsx` 已接入 `useTranslation("settings")`，覆盖服务型技能目录摘要、站点脚本目录摘要、Bootstrap Payload 调试、外部 YAML 导入、示例 placeholder、按钮、aria、动态计数与成功 / 失败反馈；新增 `settings.developer.serviceSkillCatalog.*` / `settings.developer.siteAdapterCatalog.*` 共 79 个 key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1436 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/developer/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、19 个用例；`npx eslint "src/components/settings-v2/system/developer/ServiceSkillCatalogTools.tsx" "src/components/settings-v2/system/developer/SiteAdapterCatalogTools.tsx" --max-warnings 0` 通过。`npm run typecheck` 本轮仍由隔壁 `verify:local` / typecheck 进程占用，未重复启动；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为目录联调文案迁移阻塞项。
55. 2026-05-10 Settings Clipboard 权限指引共享卡迁移续测：`src/components/settings-v2/system/shared/ClipboardPermissionGuideCard.tsx` 已接入 `useTranslation("settings")`，覆盖 macOS / Windows / Linux / generic 剪贴板权限指引、打开系统设置按钮和失败提示；新增 `settings.system.clipboardPermission.*` 共 19 个 key并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1455 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/shared/ClipboardPermissionGuideCard.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、7 个用例；`npx eslint "src/components/settings-v2/system/shared/ClipboardPermissionGuideCard.tsx" "src/components/settings-v2/system/shared/ClipboardPermissionGuideCard.test.tsx" --max-warnings 0` 通过。`npm run typecheck` 本轮仍由隔壁 `verify:local` / typecheck 进程占用，未重复启动；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为剪贴板权限指引文案迁移阻塞项。
56. 2026-05-10 Crash Recovery 恢复模式外壳迁移续测：`src/components/layout/CrashRecoveryPanel.tsx` 已接入 `useTranslation("errors")`，覆盖恢复模式标题说明、最近错误、模块资源加载失败提示、诊断复制 / JSON / 导出 / 清理 / 下载目录操作、workspace 路径修复反馈和强制刷新资源入口；新增 `errors.crashRecovery.*` 共 35 个 key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1490 个 source key 结构一致；`npm test -- "src/components/layout/CrashRecoveryPanel.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、10 个用例；`npx eslint "src/components/layout/CrashRecoveryPanel.tsx" "src/components/layout/CrashRecoveryPanel.test.tsx" --max-warnings 0` 通过。`npm run typecheck` 本轮仍由隔壁 `verify:local` / typecheck 进程占用，未重复启动；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为恢复模式外壳文案迁移阻塞项。
57. 2026-05-10 Settings Channels Telegram / Feishu Gateway Runtime 迁移续测：`TelegramGatewayDebugPanel` 与 `FeishuGatewayDebugPanel` 已接入 `useTranslation("settings")`，覆盖运行控制标题说明、账号 ID、轮询超时、状态查询 / 启动 / 停止 / 重启按钮、执行中状态、成功 / 失败反馈、stop warning 与最近结果空态；新增 `settings.channels.gatewayRuntime.*` 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1455 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/channels/ChannelsDebugWorkbench.test.tsx" "src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx" "src/components/settings-v2/system/channels/channel-log-filter.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 5 个文件、17 个用例；`npx eslint "src/components/settings-v2/system/channels/ChannelsDebugWorkbench.tsx" "src/components/settings-v2/system/channels/ChannelsDebugWorkbench.test.tsx" "src/components/settings-v2/system/channels/ChannelLogTailPanel.tsx" "src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx" "src/components/settings-v2/system/channels/channel-log-filter.ts" "src/components/settings-v2/system/channels/channel-log-filter.test.ts" --max-warnings 0` 与定向 `git diff --check` 通过。`npm run typecheck` 本轮未作为通过证据；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Gateway Runtime 文案迁移阻塞项。
58. 2026-05-10 Settings Channels 微信 Gateway Runtime 迁移续测：`WechatGatewayDebugPanel` 与 `QrCodePreview` 已接入 `useTranslation("settings")`，覆盖微信运行控制、兼容扫码排障、二维码状态、账号目录、危险删除确认、动态状态、失败反馈和 locale-aware 时间；新增 `settings.channels.wechatRuntime.*` 共 68 个 key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1622 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/channels/ChannelsDebugWorkbench.test.tsx" "src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx" "src/components/settings-v2/system/channels/channel-log-filter.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 5 个文件、18 个用例；`npx eslint "src/components/settings-v2/system/channels/ChannelsDebugWorkbench.tsx" "src/components/settings-v2/system/channels/ChannelsDebugWorkbench.test.tsx" "src/components/settings-v2/system/channels/ChannelLogTailPanel.tsx" "src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx" "src/components/settings-v2/system/channels/channel-log-filter.ts" "src/components/settings-v2/system/channels/channel-log-filter.test.ts" --max-warnings 0` 与定向 `git diff --check` 通过。`npm run typecheck` 本轮未作为通过证据；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为微信 Gateway Runtime 文案迁移阻塞项。
59. 2026-05-10 Crash Diagnostic 底层诊断文案迁移续测：`src/lib/crashDiagnostic.ts` 已通过 `errors.crashDiagnostic.*` 读取 current locale 下的 key-based resource，覆盖自动摘要、诊断提示词、采集说明、复制失败、剪贴板权限指引与下载目录 fallback；新增 crash diagnostic key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1622 个 source key 结构一致；`npm test -- "src/lib/crashDiagnostic.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、25 个用例；`npx eslint "src/lib/crashDiagnostic.ts" "src/lib/crashDiagnostic.test.ts" --max-warnings 0` 与 `npm run typecheck` 通过；定向 `git diff --check` 通过。GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为底层诊断文案迁移阻塞项。
60. 2026-05-10 Settings Chrome Relay 独立连接引导窗口迁移续测：`src/components/settings-v2/system/chrome-relay/guide-window.tsx` 已接入 `useTranslation("settings")`，覆盖扩展安装引导、CDP 直连引导、状态标签、复制 / 打开 / 同步操作、错误反馈、剪贴板提示和源码目录警告；新增 `settings.chromeRelay.guide.*` 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1746 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/chrome-relay/guide-window.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、13 个用例；`npx eslint "src/components/settings-v2/system/chrome-relay/guide-window.tsx" "src/components/settings-v2/system/chrome-relay/guide-window.test.tsx" --max-warnings 0`、`npm run typecheck` 与定向 `git diff --check` 通过。GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Chrome Relay 引导窗口文案迁移阻塞项。
61. 2026-05-10 Settings Memory 首屏与偏好画像迁移续测：`src/components/settings-v2/general/memory/index.tsx` 已接入 `useTranslation("settings")`，覆盖首屏 hero、记忆总开关、保存操作、状态摘要、偏好画像问卷题目与选项；补齐并行写入后缺失的 `zh-TW` / `ja-JP` / `ko-KR` `settings.memory.*` keys。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1749 个 source key 结构一致；`npm test -- "src/components/settings-v2/general/memory/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、17 个用例；`npx eslint "src/components/settings-v2/general/memory/index.tsx" "src/components/settings-v2/general/memory/index.test.tsx" --max-warnings 0`、`npm run typecheck` 与定向 `git diff --check` 通过。GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Memory 首屏文案迁移阻塞项。
62. 2026-05-10 Settings Chrome Relay 主设置页核心首屏迁移续测：`src/components/settings-v2/system/chrome-relay/index.tsx` 已接入 `useTranslation("settings")`，覆盖核心浏览器列表、系统环境、Google Chrome 能力说明、扩展连接 / CDP 直连入口、连接器安装状态、浏览器协助 / 连接引导 / 剪贴板 / 连接器开关等共享操作反馈；新增 `settings.chromeRelay.main.*` 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1846 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/chrome-relay/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、17 个用例；`npx eslint "src/components/settings-v2/system/chrome-relay/index.tsx" "src/components/settings-v2/system/chrome-relay/index.test.tsx" --max-warnings 0` 与定向 `git diff --check` 通过。`npm run typecheck` 本轮已有隔壁进程在跑，为避免抢占资源未重复启动；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Chrome Relay 核心首屏文案迁移阻塞项。
63. 2026-05-10 Settings Chrome Relay 高级工具起步区迁移续测：`src/components/settings-v2/system/chrome-relay/index.tsx` 继续收口 `settings.chromeRelay.main.*`，覆盖高级控制壳层、Overview 卡片、Profile 会话面板、使用建议、实时调试面板、tab 标签以及后端类型 label / description；新增 key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1914 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/chrome-relay/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、17 个用例；`npx eslint "src/components/settings-v2/system/chrome-relay/index.tsx" "src/components/settings-v2/system/chrome-relay/index.test.tsx" --max-warnings 0` 与 `npm run typecheck` 通过。第一次测试曾因 `getBackendLabel` 在初始化前被 `testBackendAction` dependency array 读取而失败，已移动 helper 定义顺序并复跑通过。GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为高级工具起步区文案迁移阻塞项。
64. 2026-05-10 Settings Automation 当前焦点条与概览焦点卡迁移续测：`src/components/settings-v2/system/automation/AutomationJobFocusStrip.tsx` 与 `AutomationOverviewFocusCard.tsx` 已接入 `useTranslation("settings")`，覆盖当前焦点标题 / badge、空态、加载态、最近结果、下一步摘要和查看结果 / 治理 / 详情操作文案；新增 `settings.automation.focus.*` 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1930 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/automation/AutomationJobFocusStrip.test.tsx" "src/components/settings-v2/system/automation/AutomationOverviewFocusCard.test.tsx" "src/components/settings-v2/system/automation/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 5 个文件、26 个用例；`npx eslint "src/components/settings-v2/system/automation/AutomationJobFocusStrip.tsx" "src/components/settings-v2/system/automation/AutomationJobFocusStrip.test.tsx" "src/components/settings-v2/system/automation/AutomationOverviewFocusCard.tsx" "src/components/settings-v2/system/automation/AutomationOverviewFocusCard.test.tsx" "src/components/settings-v2/system/automation/index.test.tsx" --max-warnings 0` 与定向 `git diff --check` 通过。`npm run typecheck` 本轮仍由隔壁进程占用，未重复启动；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Automation 焦点组件文案迁移阻塞项。
65. 2026-05-10 Settings Chrome Relay 高级工具连接方式卡迁移续测：`src/components/settings-v2/system/chrome-relay/index.tsx` 继续收口 `settings.chromeRelay.main.*`，覆盖高级工具连接方式卡中的扩展 / CDP 状态、快捷入口、复制配置与断开扩展操作文案；新增 `settings.chromeRelay.main.connectionMethod.*` 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1974 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/chrome-relay/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、17 个用例；`npx eslint "src/components/settings-v2/system/chrome-relay/index.tsx" --max-warnings 0` 通过。`npm run typecheck` 本轮已有隔壁 `verify:local` 进程在跑，为避免抢占资源未重复启动；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Chrome Relay 连接方式卡文案迁移阻塞项。
66. 2026-05-10 Settings Automation Health Panel 迁移续测：`src/components/settings-v2/system/automation/AutomationHealthPanel.tsx` 已接入 `useTranslation("settings")`，覆盖风险提醒标题说明、轮询状态、累计执行、汇总 pill、最近 / 下次轮询、风险任务失败重试、冷却 / 更新时间、状态枚举和空态；新增 `settings.automation.health.*` 并同步 5 个 locale，时间展示改为复用 `formatDate()`。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1954 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/automation/AutomationHealthPanel.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、6 个用例；`npx eslint "src/components/settings-v2/system/automation/AutomationHealthPanel.tsx" "src/components/settings-v2/system/automation/AutomationHealthPanel.test.tsx" --max-warnings 0` 与定向 `git diff --check` 通过。`npm run typecheck` 未作为本轮通过证据；为避免和隔壁进程抢占资源，本轮未重复启动 `npm run verify:local` / 全量 `cargo test`。
67. 2026-05-11 Settings Chrome Relay 高级工具系统连接器卡迁移续测：`src/components/settings-v2/system/chrome-relay/index.tsx` 继续收口 `settings.chromeRelay.main.*`，覆盖系统连接器卡片说明、启用计数、状态标签、能力前缀和切换 aria，并补充系统连接器切换回归；新增 `settings.chromeRelay.main.systemConnector.*` key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1984 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/chrome-relay/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、18 个用例；`npx eslint "src/components/settings-v2/system/chrome-relay/index.tsx" "src/components/settings-v2/system/chrome-relay/index.test.tsx" --max-warnings 0` 与 `npm run typecheck` 通过。GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Chrome Relay 系统连接器卡文案迁移阻塞项。
68. 2026-05-11 Settings Chrome Relay 高级工具浏览器动作配置迁移续测：`src/components/settings-v2/system/chrome-relay/index.tsx` 继续收口 `settings.chromeRelay.main.*`，覆盖浏览器动作配置标题说明、读取 / 写入分组和能力开关 aria，并补充动作配置标题 / 分组断言；新增 `settings.chromeRelay.main.browserAction.*` key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、1989 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/chrome-relay/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、18 个用例；`npx eslint "src/components/settings-v2/system/chrome-relay/index.tsx" "src/components/settings-v2/system/chrome-relay/index.test.tsx" --max-warnings 0` 与 `npm run typecheck` 通过。GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Chrome Relay 浏览器动作配置文案迁移阻塞项。
69. 2026-05-11 Settings Automation 主页面壳层与调度器设置迁移续测：`src/components/settings-v2/system/automation/index.tsx` 已接入 `useTranslation("settings")`，覆盖 Automation 页面 hero、加载失败态、刷新 / 新建 / 设置 / 打开入口、顶部状态 pill、tabs、调度器设置卡、调度器保存 toast 与主加载错误 toast；新增 `settings.automation.main.*` 与 `settings.automation.scheduler.*` 共 57 个 key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、2046 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/automation/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、20 个用例；`npx eslint "src/components/settings-v2/system/automation/index.tsx" "src/components/settings-v2/system/automation/index.test.tsx" --max-warnings 0` 与定向 `git diff --check -- "src/components/settings-v2/system/automation/index.tsx"` 通过。`npm run typecheck` 与 `npm run verify:local` 未作为本轮通过证据；仍避免触碰隔壁正在推进的 Chrome Relay / Skills 主线。
70. 2026-05-11 Settings Chrome Relay 高级工具后端策略详情迁移续测：`src/components/settings-v2/system/chrome-relay/index.tsx` 继续收口 `settings.chromeRelay.main.*`，覆盖后端策略详情面板的策略配置、自动回退、优先级、后端测试、当前可用性、capabilities waiting、native-host 与平台支持文案，并补充后端策略页渲染回归；新增 `settings.chromeRelay.main.backendPolicy.*` key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、2071 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/chrome-relay/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、19 个用例；`npx eslint "src/components/settings-v2/system/chrome-relay/index.tsx" "src/components/settings-v2/system/chrome-relay/index.test.tsx" --max-warnings 0` 与 `npm run typecheck` 通过。GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Chrome Relay 后端策略详情文案迁移阻塞项。
71. 2026-05-11 Settings Chrome Relay 高级工具扩展桥接详情迁移续测：`src/components/settings-v2/system/chrome-relay/index.tsx` 继续收口 `settings.chromeRelay.main.*`，覆盖扩展桥接详情面板的服务状态、observer 状态、接入信息、复制配置、空态提示、observer 最近页面、测试扩展与刷新状态文案，并补充扩展桥接页渲染回归；新增 `settings.chromeRelay.main.bridge.*` key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、2149 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/chrome-relay/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、20 个用例；`npx eslint "src/components/settings-v2/system/chrome-relay/index.tsx" "src/components/settings-v2/system/chrome-relay/index.test.tsx" --max-warnings 0` 通过。`npm run typecheck` 本轮由隔壁 `verify:local` 占用未重复启动；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Chrome Relay 扩展桥接详情文案迁移阻塞项。
72. 2026-05-11 Settings Automation 主页面开始模板与任务列表迁移续测：`src/components/settings-v2/system/automation/index.tsx` 继续收口 `settings.automation.tasks.*`，覆盖开始模板卡、任务列表、旧浏览器流程下线提醒、任务行技能流程摘要、任务状态与运行操作，以及创建 / 更新 / 删除 / 立即运行反馈；新增 `settings.automation.tasks.*` 共 60 个 key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、2131 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/automation/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、20 个用例；`npx eslint "src/components/settings-v2/system/automation/index.tsx" "src/components/settings-v2/system/automation/index.test.tsx" --max-warnings 0` 与定向 `git diff --check -- "src/components/settings-v2/system/automation/index.tsx"` 通过。`npm run typecheck` 与 `npm run verify:local` 仍未作为本轮通过证据；本轮未触碰 Chrome Relay / Skills 文件。
73. 2026-05-11 Settings Automation 运行历史区迁移续测：`src/components/settings-v2/system/automation/AutomationJobDetailsDialog.tsx` 已接入 `useTranslation("settings")`，覆盖最近运行标题、刷新按钮、run id / session / 完成时间元信息、技能流程运行上下文、参数摘要、补充要求、输出投递状态、失败原因与空态；新增 `settings.automation.history.*` 共 13 个 key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、2162 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/automation/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、20 个用例；`npx eslint "src/components/settings-v2/system/automation/AutomationJobDetailsDialog.tsx" "src/components/settings-v2/system/automation/index.test.tsx" --max-warnings 0` 与定向 `git diff --check -- "src/components/settings-v2/system/automation/AutomationJobDetailsDialog.tsx"` 通过。`npm run typecheck` 与 `npm run verify:local` 未作为本轮通过证据；本轮未触碰 Chrome Relay / Skills 文件。
74. 2026-05-11 Skills 工作台顶部入口与搜索错误区迁移续测：`src/components/skills/SkillsWorkspacePage.tsx` 已接入 `useTranslation("agent")`，覆盖页头标题 / 副标题、刷新 / 查看全部、active scaffold 续用条、搜索 placeholder、推荐 / 本地 Skills 错误横幅，以及搜索命中右侧 Skills 时的结果模板 / 分组空态分流；新增 `skills.workspace.*` key 并同步 5 个 locale。为避免隔壁 Automation 并行改动中的 `AutomationJobDialog` 模块初始化错误污染本切片，`src/components/skills/SkillsWorkspacePage.test.tsx` 只在本测试内 mock dialog 外壳，保留 Skills 工作台主渲染、搜索和本地 Skill 断言。`npm test -- "src/components/skills/SkillsWorkspacePage.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、36 个用例；`npx eslint "src/components/skills/SkillsWorkspacePage.tsx" "src/components/skills/SkillsWorkspacePage.test.tsx" --max-warnings 0`、`npm run detect-translations -- --verbose`、5 个 `agent.json` 的 `python3 -m json.tool` 解析与定向 `git diff --check` 通过，最新资源口径为 5 个 locale、6 个 namespace、2305 个 source key。`npm run typecheck` / `npm run verify:local` 本轮仍由隔壁长跑进程占用，未重复启动；GUI smoke 仍按记录 39 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Skills 工作台本地化阻塞项。
75. 2026-05-11 Skills 工作台主体 chrome 迁移续测：`src/components/skills/SkillsWorkspacePage.tsx` 继续收口 `skills.workspace.*`，覆盖推荐区标题 / 副标题、最近判断横幅、推荐 badge、沿用结果、进入生成、分组详情、分类入口、最近 / 本地 Skills 侧栏标题与空态、能力草案 / 已注册能力折叠标题、刚沉淀提示、继续操作和调整 Skills 弹窗标题 / Tips；新增 key 并同步 5 个 locale。`npm test -- "src/components/skills/SkillsWorkspacePage.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、36 个用例；`npx eslint "src/components/skills/SkillsWorkspacePage.tsx" "src/components/skills/SkillsWorkspacePage.test.tsx" --max-warnings 0`、`npm run detect-translations -- --verbose`、5 个 `agent.json` 的 `python3 -m json.tool` 解析与定向 `git diff --check` 通过，最新资源口径为 5 个 locale、6 个 namespace、2339 个 source key。`npm run typecheck` 已尝试但因隔壁 Automation 并行脏改失败：`src/components/settings-v2/system/automation/AutomationJobDialog.tsx:101` 的 `TFunctionDetailedResult` 转 string 与 `:108` 的 `replaceAll` target lib 报错；该失败不来自本切片。隔壁 `verify:local` 本轮已进入 GUI smoke，最终在 `smoke:claw-chat-ready-streaming` 等待恢复结果超时处失败，本轮未把该无关失败作为 Skills 工作台本地化阻塞项。
76. 2026-05-11 Skills 工作台事件反馈与生成入口提示迁移续测：`src/components/skills/SkillsWorkspacePage.tsx` 继续收口 `skills.workspace.*`，覆盖刷新 toast、本地 Skill / runtime enable / curated task 回到生成 entry banner、Managed Job 草案创建反馈、Skill scaffold 创建反馈与默认标题、最近判断 launcher prefill hint；新增 key 并同步 5 个 locale。`npm test -- "src/components/skills/SkillsWorkspacePage.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、36 个用例；`npx eslint "src/components/skills/SkillsWorkspacePage.tsx" "src/components/skills/SkillsWorkspacePage.test.tsx" --max-warnings 0`、`npm run detect-translations -- --verbose`、5 个 `agent.json` 的 `python3 -m json.tool` 解析、定向 `git diff --check` 与 `npm run typecheck` 通过，最新资源口径为 5 个 locale、6 个 namespace、2457 个 source key。隔壁 `verify:local` 的 GUI smoke 仍按记录 75 停在 `smoke:claw-chat-ready-streaming` 超时，本轮未把该无关失败作为 Skills 工作台本地化阻塞项。
77. 2026-05-11 Skills 工作台 helper 动态摘要迁移续测：`src/components/skills/SkillsWorkspacePage.tsx` 继续收口 `skills.workspace.*`，覆盖能力草稿缺本地目录错误、本地 Skill 最近目标摘要、分类 starter summary、最近判断行动按钮、结果基线 source title / highlight / count 拼接；新增 key 并同步 5 个 locale。`npm test -- "src/components/skills/SkillsWorkspacePage.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、36 个用例；`npx eslint "src/components/skills/SkillsWorkspacePage.tsx" "src/components/skills/SkillsWorkspacePage.test.tsx" --max-warnings 0`、`npm run detect-translations -- --verbose`、5 个 `agent.json` 的 `python3 -m json.tool` 解析与定向 `git diff --check` 通过，最新资源口径为 5 个 locale、6 个 namespace、2464 个 source key。`npm run typecheck` 已尝试但被隔壁 Memory 来源链并行脏改阻塞：`src/components/settings-v2/general/memory/index.tsx` 多个 `settings.memory.source.*` / `settings.memory.layers.*` key 尚未进入类型资源，且部分 helper 参数顺序与 `TFunction<"settings">` 不一致；该失败不来自本切片。
78. 2026-05-11 Settings Automation Job Dialog 迁移续测：`src/components/settings-v2/system/automation/AutomationJobDialog.tsx` 已接入 `useTranslation("settings")`，覆盖新建 / 编辑弹窗标题说明、summary pill、基础表单字段、调度提示、旧浏览器流程下线快照、权限模式、输出投递契约、目标地址 placeholder、投递说明、校验错误和底部保存操作；新增 `settings.automation.jobDialog.*` 共 124 个 key 并同步 5 个 locale。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、2305 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/automation/AutomationJobDialog.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、10 个用例；`npx eslint "src/components/settings-v2/system/automation/AutomationJobDialog.tsx" "src/components/settings-v2/system/automation/AutomationJobDialog.test.tsx" --max-warnings 0` 通过。`npm run typecheck` / `npm run verify:local` 未作为本轮通过证据；本轮未触碰 Chrome Relay / Skills 文件。

79. 2026-05-11 Settings Automation Details Dialog 长尾迁移续测：`src/components/settings-v2/system/automation/AutomationJobDetailsDialog.tsx` 继续收口 `settings.automation.details.*`，覆盖详情弹窗头部、summary pill、基础元信息、旧浏览器流程下线提示、技能流程上下文、Scene App 回流摘要、输出契约、最近投递结果、当前起手内容、运行历史里的本地时间格式与权限 / 调度 / 投递动态 label；新增 `settings.automation.details.*` 共 101 个 key 并同步 5 个 locale，同时修复 `AutomationJobDialog` / Details Dialog interpolation helper 的返回类型与 `replaceAll` target lib 风险。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、2457 个 source key 结构一致；`npm test -- "src/components/settings-v2/system/automation/AutomationJobDialog.test.tsx" "src/components/settings-v2/system/automation/AutomationJobDetailsDialog.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 4 个文件、17 个用例；`npx eslint "src/components/settings-v2/system/automation/AutomationJobDialog.tsx" "src/components/settings-v2/system/automation/AutomationJobDialog.test.tsx" "src/components/settings-v2/system/automation/AutomationJobDetailsDialog.tsx" "src/components/settings-v2/system/automation/AutomationJobDetailsDialog.test.tsx" --max-warnings 0` 与 `npm run typecheck` 通过。`npm run verify:local` / GUI smoke 未作为本轮通过证据；本轮未触碰 Chrome Relay / Skills 实现文件。

80. 2026-05-11 Settings Memory 来源链状态与策略长尾迁移续测：`src/components/settings-v2/general/memory/index.tsx` 继续收口 `settings.memory.source.*` / `settings.memory.layers.*` / `settings.memory.action.refresh`，覆盖记忆命中层状态、来源链状态总览、来源链策略、运行时 AGENTS 模板 / `.gitignore` 反馈、来源链命中详情、来源分类与相对更新时间；新增 `settings.memory.source.*` / `settings.memory.layers.*` / `settings.memory.action.refresh` 共 95 个 key 并同步 5 个 locale，本条不覆盖 `memdir` 写入区、自动索引卡片和 memdir 校验 / 初始化 / 整理反馈长尾。`npm run detect-translations -- --verbose` 通过，确认 5 个 locale、6 个 namespace、2561 个 source key 结构一致；`npm test -- "src/components/settings-v2/general/memory/index.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 3 个文件、17 个用例；`npx eslint "src/components/settings-v2/general/memory/index.tsx" "src/components/settings-v2/general/memory/index.test.tsx" --max-warnings 0`、`npm run typecheck` 与定向 `git diff --check` 通过。`npm run verify:local` / GUI smoke 未作为本轮通过证据；GUI smoke 仍按记录 39 / 75 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Memory 文案迁移阻塞项。
81. 2026-05-11 Skills 已安装 Skill presentation helper 本地化 copy 迁移续测：`src/components/skills/installedSkillPresentation.ts` 新增可选 `copy` 注入，并在 `src/components/skills/SkillsWorkspacePage.tsx` 传入 `skills.workspace.installedSkill.*` copy，覆盖默认 promise、required inputs、output hint、required / output 前缀；存量调用方不传 copy 时行为保持不变。`npm test -- "src/components/skills/installedSkillPresentation.test.ts" "src/components/skills/SkillsWorkspacePage.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 4 个文件、39 个用例；`npx eslint "src/components/skills/installedSkillPresentation.ts" "src/components/skills/installedSkillPresentation.test.ts" "src/components/skills/SkillsWorkspacePage.tsx" "src/components/skills/SkillsWorkspacePage.test.tsx" --max-warnings 0`、`npm run detect-translations -- --verbose`、5 个 `agent.json` 的 `python3 -m json.tool` 解析、定向 `git diff --check` 与 `npm run typecheck` 通过，最新资源口径为 5 个 locale、6 个 namespace、2561 个 source key。
82. 2026-05-11 Skills ServiceSkill presentation helper 本地化 copy 迁移续测：`src/components/agent/chat/service-skills/skillPresentation.ts` 新增 `ServiceSkillPresentationCopy` 注入，保持默认中文兜底不破坏 Agent Chat / Home 等存量调用；`src/components/skills/SkillsWorkspacePage.tsx` 在 Skills 工作台可见路径传入 `skills.workspace.serviceSkill.*` copy，覆盖推荐卡 / 最近侧栏的 runner、action、类型、required inputs、output destination 与可读摘要，同时补齐 `skills.workspace.installedSkill.defaultPromise` / `fallbackRequiredInputs` / `fallbackOutputHint` 的 5 语种资源。`npm test -- "src/components/agent/chat/service-skills/skillPresentation.test.ts" "src/components/skills/installedSkillPresentation.test.ts" "src/components/skills/SkillsWorkspacePage.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"` 通过，覆盖 5 个文件、46 个用例；`npx eslint "src/components/agent/chat/service-skills/skillPresentation.ts" "src/components/agent/chat/service-skills/skillPresentation.test.ts" "src/components/skills/installedSkillPresentation.ts" "src/components/skills/installedSkillPresentation.test.ts" "src/components/skills/SkillsWorkspacePage.tsx" "src/components/skills/SkillsWorkspacePage.test.tsx" --max-warnings 0`、`npm run detect-translations -- --verbose`、定向 `git diff --check` 与 `npm run typecheck` 通过，最新资源口径为 5 个 locale、6 个 namespace、2666 个 source key。`npm run verify:local` / GUI smoke 未作为本轮通过证据；GUI smoke 仍按记录 39 / 75 受 Agent streaming runtime blocker 影响，本轮未把该无关失败作为 Skills ServiceSkill helper 本地化阻塞项。

仍未完成：

1. `navigation` namespace 已覆盖侧边栏主入口、搜索弹窗、会话列表起步路径、会话 meta 格式化、会话重命名 / 删除的 prompt / confirm / toast，以及账号菜单的核心未登录 / 已登录操作文案；但邀请入口 / 邀请弹窗、外观快捷面板、账号套餐 usage 兜底、复制邀请 toast 等侧栏周边文案仍有硬编码；`workspace`、`agent` namespace 还只是骨架，`errors` namespace 已覆盖 Crash Recovery 外壳与 crashDiagnostic 共享诊断摘要 / 复制失败 / 下载目录 fallback；Workspace / Agent Chat 仍需 P1/P2 逐步迁移；Settings 共享壳层、home、developer-lab、system/developer 壳层与目录联调懒加载工具、system/shared Clipboard 权限指引、CrashRecoveryPanel 恢复模式外壳、system/environment 主体、system/experimental 主体、system/channels 工作台壳层、网关与隧道表单、Telegram / Feishu / 微信运行控制、微信兼容扫码排障与日志 Tail 面板、system/web-search 主体、system/chrome-relay 独立连接引导窗口 / 主设置页核心首屏 / 高级工具起步区 / 高级工具连接方式卡 / 高级工具系统连接器卡 / 高级工具浏览器动作配置面板 / 高级工具后端策略详情面板 / 高级工具扩展桥接详情面板、system/shared Workspace 自愈记录共享卡片、system/automation 当前焦点条 / 概览焦点卡 / HealthPanel / 主页面壳层与调度器设置 / 主页面开始模板与任务列表 / 运行历史区、general/memory 首屏与偏好画像 / 来源链状态与策略长尾、general/hotkeys、account/profile/stats/user-center-session、appearance/about、agent/skills 高级入口、agent/image-gen、agent/video-gen、agent/media-services、agent/voice、agent/providers 的顶部切换器 / 云端反馈 / 桌宠能力偏好卡 / Companion Bridge 诊断区已完成起步迁移，但 Providers 页内残留硬编码、general/memory memdir 写入 / 自动索引长尾、Skills 工作台的 ServiceSkill launch prefill 与 CuratedTask presentation helper 返回的 runtime 数据、能力草稿面板内部文案、启动弹窗内部与模型执行提示正文长尾仍需继续。
2. `legacy-patch/` 已完成物理隔离，并已有运行时命中量指标 API、GUI smoke metrics 导出链与离线 text / JSON 报告脚本；但 CI 尚未把 `i18n:patch-report --check` 接入删除门禁，也尚未把 `no-hit` 报告和 current 主路径依赖审计绑定为 DOM replacer 删除条件。退出条件仍是 P3 后按命中量和 current 主路径依赖清零逐步拆除。
3. 类型绑定已覆盖当前 source resource，`AGENTS.md` / 质量工作流也已封住新增功能必须走 current i18n 的人工规则；但尚未接入官方 `i18next-cli` 的抽取 / hardcoded string lint / type generation，也尚未评估 selector API 或 `@i18next-selector/codemod` 是否适合资源规模扩大后的 P3 阶段。
4. 最终合并前仍应基于届时工作区状态复跑 `npm run verify:local`；历史 `verify:local` 曾被非 i18n 的 seeded service skill 数量断言阻塞；最新隔壁 `verify:local` 已推进到 GUI smoke，但仍受 Agent streaming runtime blocker 影响。`ChannelLogTailPanel.test.tsx` 的 `Timeout` 类型不匹配已在记录 49 收口，当前不再作为 i18n PRD 的 typecheck blocker；记录 50 / 51 / 52 / 53 / 54 / 55 / 56 / 57 / 58 的 typecheck 因并行重验证负载或本轮未单独启动而未取得通过证据，后续收口时需复跑；记录 59 / 60 / 61 已重新取得 `npm run typecheck` 通过证据；记录 65 / 66 因隔壁 `verify:local` 长跑占用未重复启动 typecheck；记录 67 / 68 已重新取得 `npm run typecheck` 通过证据；记录 69 / 71 / 72 / 73 / 74 未单独启动 typecheck / verify:local；记录 75 已尝试 `npm run typecheck` 但当时被 AutomationJobDialog 并行脏改阻塞，且隔壁 `verify:local` 在 `smoke:claw-chat-ready-streaming` 超时失败；记录 76 已重新取得 `npm run typecheck` 通过证据；记录 77 已尝试 `npm run typecheck` 但被 Memory 来源链并行脏改阻塞；记录 78 / 79 / 81 / 82 已重新取得 `npm run typecheck` 通过证据；记录 80 已补齐 Memory 来源链资源并通过 detect / 定向测试 / ESLint，但未单独启动 typecheck / verify:local；记录 70 已重新取得 `npm run typecheck` 通过证据。
