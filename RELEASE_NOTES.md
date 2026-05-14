## Lime v1.39.0

发布日期：`2026-05-15`
递交范围：当前完整 worktree，包含 tracked、deleted 与新增文件；本次按发布要求完成版本号、release note、核心质量校验与发布提交，不包含 tag / push / 正式分发。

> 发布说明：上一版 release tag 为 `v1.38.0`。本版升级到 `v1.39.0`，并继续清理旧 `RELEASE_NOTES.md` 历史堆叠内容，只保留当前版本说明；旧 v1.38.0 发布说明不再作为当前 release note 事实源保留。

### 发布概览

- 应用版本从 `1.38.0` 升级到 `1.39.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- Agent Chat / Workbench 主路径继续拆分巨型渲染面，`MessageList`、输入栏、历史水合、滚动控制、任务轻卡、图片预览和 Team Workspace 选择器收敛到更小的组件、selector 与 hook。
- i18n 资源按 Agent 子域拆包，新增并同步 `agentHome`、`agentInputbar`、`agentMessageList`、`agentRuntime`、`agentSkills`、`agentTeamWorkspace` 五语言资源，原 `agent.json` 大幅瘦身。
- Tauri mock / DevBridge mock 从单体 `core.ts` 拆分为多个域模块，命令契约检查支持识别 `defaultMocks` 的 spread registry，避免 mock 拆分后契约扫描失真。
- Release updater manifest 强化 macOS DMG / Windows installer URL 处理，缺失 macOS DMG 时阻断错误清单，避免官网下载页错误回退到 updater 包。
- Agent App 方向新增路线图与技术设计文档，明确 capability SDK、AI 内容工程和 P0 技术闭环的后续主线。

### 用户可见更新

- 聊天消息区在历史恢复、运行中消息、图片 / 音频 / 转写任务卡和 artifact 入口上更稳定，避免新草稿、历史水合或旧会话恢复时串入上一轮轻卡状态。
- 输入栏与 Team 选择体验继续收敛：Team selector、工作流状态、技能选择、图片附件和多模态提示补齐五语言文案与回归断言。
- 图片、音频、转写等媒体任务轻卡继续以统一 media task index 为事实源，LimeCore policy 输入缺口、阻断和 allow 状态展示进入本地化资源。
- Skill Forge / Service Skill 入口链路继续补齐挂起参数、A2UI 表单、runtime binding 和显式 session enable 证据，减少“已注册”与“已可自动执行”之间的误解。
- GUI smoke 覆盖 workspace ready、browser runtime、site adapter、runtime tool surface、`@` 命令注册、Claw streaming、知识库 GUI 和设计画布主路径。

### 开发者与治理更新

- `src/lib/tauri-mock/` 拆出 agent runtime、browser、knowledge、media task、memory、provider、skill forge、update、voice、workspace 等 mock registry，降低单文件复杂度。
- `scripts/check-command-contracts.mjs` 适配拆分后的 mock 事实源，继续检查前端命令、Rust 注册、mock priority 与 default mock 的一致性。
- `scripts/release-updater-manifest.mjs` 和对应测试覆盖 installer_url、macOS DMG 缺失、Windows 安装包与 updater manifest 组合边界。
- Rust runtime、Skill 执行与 timeline 服务补充 sequence 归一化、synthetic item、fast response model routing、workspace skill runtime enable 等定向测试。
- 删除旧 Playwright 调试 JSON 快照，并通过 `.gitignore` 收敛临时调试产物，避免 release 提交继续携带一次性浏览器状态文件。

### 校验状态

- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all`：通过。
- `npm run verify:app-version`：通过，目标版本 `1.39.0`。
- `CARGO_TARGET_DIR="$HOME/.cache/lime-cargo-target-v139" cargo test --manifest-path "src-tauri/Cargo.toml"`：通过，主库 `1347 passed; 0 failed; 1 ignored`，集成测试通过；真实联网测试保持 ignored。
- `CARGO_TARGET_DIR="$HOME/.cache/lime-cargo-target-v139" cargo clippy --manifest-path "src-tauri/Cargo.toml" --workspace --all-targets -- -D warnings`：通过。
- `npm run lint`：通过。
- `npm run typecheck`：通过。
- `npm test`：通过，`56/56` 批次通过。
- `npm run test -- "src/components/agent/chat/workspace/useWorkspaceAudioTaskPreviewRuntime.test.tsx" "src/components/agent/chat/workspace/useWorkspaceTranscriptionTaskPreviewRuntime.test.tsx"`：通过，用于锁定媒体任务 policy meta 本地化回归。
- `npm run test:contracts`：通过；命令契约、Harness 契约、modality contracts 与 cleanup report contract 均通过。
- `npm run verify:gui-smoke`：通过；复用 headless Tauri / DevBridge，覆盖 workspace、browser runtime、site adapters、Skill Forge、runtime tool surface、`@` 命令、Claw streaming、knowledge GUI 与 design canvas。
- `git diff --check`：通过。

---

**完整变更**: `v1.38.0` -> `v1.39.0`
