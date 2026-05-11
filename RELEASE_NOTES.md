## Lime v1.35.0

发布日期：`2026-05-12`
递交范围：当前完整 dirty worktree，包含 tracked、deleted 与新增文件；本次按用户要求先递交并推送代码，暂不打 tag。

> 发布说明：上一版 release tag 为 `v1.34.0`。本版升级到 `v1.35.0`，并清理旧 `RELEASE_NOTES.md` 历史堆叠内容，只保留当前版本说明；`v1.35.0` tag 等全量校验跑通后再打。

### 发布概览

- 应用版本从 `1.34.0` 升级到 `1.35.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- 本次发布直接纳入当前主线 dirty worktree 的完整源码与文档改动，重点覆盖插件中心清退、Agent Runtime / Skills / i18n / 设置页回归、Rust runtime 与前端命令面同步收口。
- 旧插件文档、旧插件命令、旧插件 UI 和大量 provider model 资源索引已从 current 路径移除，减少 legacy/compat 面继续回流。
- 设置 v2、Agent 对话工作台、Skills 页面、资源渲染器、快捷键、环境与系统面板补齐一批用户可见测试与结构调整。
- `RELEASE_NOTES.md` 旧版本累积内容已清理，后续发布将以单版本事实源维护，避免历史内容继续混入新发布。

### 用户可见更新

- Agent 对话工作台补齐 timeline、incident、workspace notice、session overview、fast response routing 与 harness summary 相关回归。
- 设置 v2 的账号、Provider、媒体服务、语音、快捷键、环境、开发者、自动化、渠道日志和实验设置继续收口并补齐测试。
- Skills / Repo Manager / Resource Manager / Workspace breadcrumb / Smart Input 快捷键等页面和组件补齐用户可见回归，降低桌面 GUI 主路径回退风险。
- i18n current resources 与启动加载界面继续完善，覆盖 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR` 多语言资源与类型/覆盖测试。

### 开发者与治理更新

- 插件中心相关 Rust 命令、前端 API、页面入口、README 与文档路径继续清退，current 路径不再保留插件中心动态入口。
- `agentCommandCatalog`、DevBridge dispatcher、mockPriorityCommands、tauri mock 与 Agent Runtime 前端类型继续对齐新的 runtime/skills/tool surface 边界。
- Rust 侧围绕 Agent runtime、request model resolution、runtime evidence/review/handoff、skill service 与 app path/config 持续收口。
- 文档导航与质量工作流同步更新，仓库规则继续强调 current 事实源、版本一致性和 GUI 产品交付门槛。

### 校验状态

- `npm run verify:app-version`：通过。
- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all`：通过。
- `npm run format`：通过。
- `cargo test --manifest-path "src-tauri/Cargo.toml" --workspace --locked`：通过。
- `cargo clippy --manifest-path "src-tauri/Cargo.toml"`：通过。
- `npm run lint`：通过。
- `npm test`：未完成；最后一次全量运行被用户中断以先提交当前版本，已暴露失败项已定向修复并通过相关定向测试。

---

**完整变更**: `v1.34.0` -> `v1.35.0`
