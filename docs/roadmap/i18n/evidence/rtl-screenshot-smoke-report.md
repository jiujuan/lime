# RTL screenshot / smoke evidence

> 关联 PRD：`docs/roadmap/i18n/prd.md`
> 关联进度：`docs/roadmap/i18n/implementation-progress.md`
> 生成时间：2026-05-23

## 范围

本证据记录一次在现有 Lime 主页面上强制 `document.documentElement.dir = "rtl"` 后的截图与最小交互 smoke。
对应的自动化 smoke 报告见 [rtl-playwright-smoke-report.json](./rtl-playwright-smoke-report.json)。

## 观测到的页面

1. 首页 / Sidebar shell
2. 设置页 / Settings shell
3. 用户菜单 dialog

## 截图证据

- [rtl-home-fullpage.png](./rtl-home-fullpage.png)
- [rtl-settings-fullpage.png](./rtl-settings-fullpage.png)
- [rtl-user-menu-fullpage.png](./rtl-user-menu-fullpage.png)

## smoke 结论

- 首页在 `rtl` 下仍可加载，控制台 error 为 0。
- 侧栏在 `rtl` 下已整体翻转到右侧，说明 `dir` 语义已真正作用到主壳布局。
- 设置页在 `rtl` 下可打开，设置导航与内容区仍能继续交互。
- 用户菜单 dialog 在 `rtl` 下可打开，未见新增控制台 error。

## 局限

- 这次 smoke 使用的是强制 `rtl` 的页面方向，而不是已支持的 RTL locale 选择器。
- 仍未引入 `ar` / `fa-IR` 到主支持列表。
- 这份截图证据对应的自动化断言已经落在 `i18n:rtl-smoke`，但它仍然是页面级方向 smoke，不等于已经支持 RTL locale。
