# S7aa Client Factory Export Locale Fixture

## 结论

`clientFactory.test.ts` 未控制全局 Lime i18n locale，却硬断言 handoff export 使用
`en-US`。单文件因环境默认值通过，smart single-fork 组合中当前 locale 为 `zh-CN` 时失败。

production `exportClient` 正确采用显式 `options.locale`，缺省时才读取当前 GUI locale。本
slice 只让 factory 路由测试显式传入 `{ locale: "en-US" }`，使输入与断言由同一测试拥有；
production fallback、normalization 与全局 i18n setup 均未修改。

## 分类

- `current`：显式 locale 输入和 exportClient current-locale fallback。
- `test-only`：factory handoff route fixture。
- `compat / deprecated / dead`：无新增 surface。

## 验证

- `clientFactory.test.ts`：`10/10`。
- `clientFactory + exportClient` single-fork：`20/20`。
- fresh frontend batch 60：16 files / `147/147`。
- fresh frontend 110/110 batches、GUI smoke 与 legacy governance `0/0/0`：通过。
- ESLint、Prettier 与 claimed diff check：通过。
- `verify:local` changed-Rust 的外部 MCP stdio stack overflow 与本 test-only slice 无关。
