# Lime installer / app metadata i18n 评估

> 关联 PRD：`docs/roadmap/i18n/prd.md`
> 关联进度：`docs/roadmap/i18n/implementation-progress.md`
> 关联 inventory：`docs/roadmap/i18n/evidence/app-metadata-workflow-inventory.json`
> 评估时间：2026-05-23

## 评估目标

判断 Lime 的 installer、应用元数据和壳层描述，是否已经具备独立的多语言工作流。

## 当前事实

- 根级 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/tauri.conf.headless.json` 与 `src-tauri/capabilities/agent-app-shell.json` 都存在稳定文本字段。
- 这些字段目前都是单语事实源，没有 locale registry、locale 目录或 metadata translator workflow。
- `src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json` 的 `productName`、窗口标题和 identifier 都是固定值。
- `package.json` 与 `src-tauri/Cargo.toml` 的 description 仍是单一英文描述，不是分 locale 的 metadata bundle。
- `agent-app-shell.json` 的 description 仍是单一中文说明，没有 companion 版本。

## 结论

当前**没有**独立的 installer / app metadata 翻译工作流。

## 现状评价

1. app / installer 元数据确实已经有若干文本字段，但它们不是可按 locale 切换的资源。
2. 当前仓库更接近“单份元数据 + 少量 companion 文档”形态，而不是“多语言 metadata workflow”形态。
3. 若要做多语言 installer / metadata，必须先定义 source locale、哪些字段允许本地化、哪些字段必须保持稳定，以及发布链路如何消费这些值。

## 建议工作流

- 先把 installer / app metadata 的 owner、source locale 与发布边界写成单独规则。
- 再决定是继续维持单份元数据，还是把字段抽成生成式资源。
- 若未来接入多语言发布链路，应优先产出 build-time inventory / generator，而不是手工维护多份配置。

## 重新评估条件

满足以下任一条件时，再推进独立 workflow：

1. 安装包和 App Store / Release 发布需要稳定的 `zh-CN / en-US` 元数据对照。
2. Tauri 配置、Windows installer 或 macOS bundle 需要按 locale 生成不同 title / description。
3. 公开发布材料开始要求和桌面 App 保持同一套术语和语言覆盖。
4. installer / app metadata 进入 CI 校验或发布前审核门禁。

## 证据链接

- [app-metadata-workflow-inventory.json](</Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/evidence/app-metadata-workflow-inventory.json>)
- [package.json](</Users/coso/Documents/dev/ai/aiclientproxy/lime/package.json>)
- [src-tauri/Cargo.toml](</Users/coso/Documents/dev/ai/aiclientproxy/lime/src-tauri/Cargo.toml>)
- [src-tauri/tauri.conf.json](</Users/coso/Documents/dev/ai/aiclientproxy/lime/src-tauri/tauri.conf.json>)
- [src-tauri/tauri.conf.headless.json](</Users/coso/Documents/dev/ai/aiclientproxy/lime/src-tauri/tauri.conf.headless.json>)
- [src-tauri/capabilities/agent-app-shell.json](</Users/coso/Documents/dev/ai/aiclientproxy/lime/src-tauri/capabilities/agent-app-shell.json>)
