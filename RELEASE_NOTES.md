## Lime v1.48.0

发布日期：`2026-05-24`
递交范围：当前完整 worktree，包含 `v1.47.0` 后 2 个已提交 commit，以及本轮发布前 tracked / untracked / deletion 改动；本次重点收口 i18n 工具链、回复语言边界、Markdown 渲染安全、Agent App Host Bridge artifact 回放、质量工作流与旧证据清理。

> 发布说明：上一版 release note 事实源为 `v1.47.0`。本版升级到 `v1.48.0`，并继续按 current release note 口径清理旧历史堆叠内容：`RELEASE_NOTES.md` 只保留当前版本说明，旧 `v1.47.0` 及更早发布说明不再作为当前 release note 事实源保留。

### 发布概览

- 应用版本从 `1.47.0` 升级到 `1.48.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- i18n 工具链补齐 translation coverage JSON、source locale export、translation PR pack、hardcoded scan、unused key check、language boundary、bundle、release docs、app metadata、RTL readiness 与 patch retirement gate 等脚本和证据文件。
- 质量工作流把 i18n 结构校验、用户可见硬编码扫描、unused key 检查与 patch retirement gate 纳入本地任务选择、`local-ci` 和 GUI smoke 主链。
- 回复语言从配置、设置页、前端 request metadata、Rust runtime snapshot 到 system prompt 注入形成独立事实源，避免把 UI locale、浏览器环境语言和内容产物语言混用。
- Markdown 渲染继续收敛为 current 安全路径：统一外链拦截、复制 / 图片 / 引用文案本地化、代码块视觉与 markdown table fence 处理，并补齐 Preview 回归。
- Agent App Host Bridge 对 `studioLogoGenerate` 这类图片 artifact 任务等待 artifact 回放后再推送终态，避免 App 先收到无结果完成态。
- 删除旧 Agent App prototype 图、旧 v2 release evidence，以及 legacy translation coverage 单测，避免旧证据继续伪装成当前发布事实源。

### 用户可见更新

- 设置页新增独立的“回复语言”偏好，可选择自动判断或固定为 current 五语言之一；该偏好只影响对话回复，不改变界面语言、浏览器站点语言或内容产物目标语言。
- Agent 对话 Markdown 代码块、图片说明、引用 / 复制操作文案进入五语言资源，交互文案不再硬编码中文。
- Markdown 中的 HTTP 外链点击在聊天与预览中走统一拦截逻辑，桌面环境下打开外部链接更一致。
- Markdown 表格如果被包在 `markdown` fence 中，会按正文表格渲染，减少模型输出表格被误当代码块的问题。
- RTL 语言 readiness、source locale export 与翻译 PR pack 有独立报告和 evidence，便于后续翻译交付复核。

### 开发者与治理更新

- `scripts/detect-missing-translations.ts` 增加 coverage 统计与 JSON report，`package.json` 暴露 i18n 检查、扫描、导出和报告命令。
- `scripts/quality-task-planner.mjs`、`scripts/quality-task-selector.mjs`、`scripts/local-ci.mjs` 与 `.github/workflows/quality.yml` 同步 i18n 任务选择和 CI 输出字段。
- `scripts/verify-gui-smoke.mjs` 在写出 Patch metrics 后联动 `governance:legacy-report` 与 `i18n:patch-retirement-gate`。
- `src/i18n/loadNamespace.ts` 将 bundled namespace parts 独立到 `bundledNamespaceParts.ts`，并在 `locales.ts` 增加 RTL direction helper。
- Rust runtime 增加 `recent_response_language` 投影与 `【AI 回复语言】` prompt stage，测试覆盖 turn / thread metadata fallback。
- `src-tauri/crates/aster-rust/crates/aster/src/tools/shell_runtime.rs` 与相关 bash / PowerShell / task 工具继续收敛跨平台 shell runtime 行为，并补 Windows shell runtime 回归。
- `src-tauri/src/commands/skill_cmd.rs` 的本地 skill 包管理测试补齐进程环境变量隔离，避免 Rust 并行测试互相覆盖 `HOME/XDG/APPDATA`。
- `docs/roadmap/i18n/` 新增 app metadata、Chrome extension、language boundary、release docs、response language、RTL、toolchain 评估和 evidence 记录。

### 当前校验状态

- 已通过 `npm run verify:app-version`
- 已通过 `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all`
- 已通过 `cargo clippy --manifest-path "src-tauri/Cargo.toml" --all-targets --all-features -- -D warnings`
- 已通过 `cargo check --manifest-path "src-tauri/Cargo.toml" --no-default-features --features local-sensevoice`
- 已通过 `cargo test --manifest-path "src-tauri/Cargo.toml"`
- 已通过 `npm run lint`
- 已通过 `npm test`
- 已通过 `npm run test:contracts`
- 已通过 `npm run verify:gui-smoke`

---

**完整变更**: `v1.47.0` -> `v1.48.0`
