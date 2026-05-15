## Lime v1.40.0

发布日期：`2026-05-16`
递交范围：当前完整 worktree，包含 tracked、deleted 与新增文件；本次按发布要求完成版本号、release note、Rust / 前端核心质量校验、命令契约与 GUI smoke，不包含 tag / push / 正式分发。

> 发布说明：上一版 release tag 为 `v1.39.0`。本版升级到 `v1.40.0`，并继续清理旧 `RELEASE_NOTES.md` 历史堆叠内容，只保留当前版本说明；旧 v1.39.0 发布说明不再作为当前 release note 事实源保留。

### 发布概览

- 应用版本从 `1.39.0` 升级到 `1.40.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- Agent App 从 Lab / 草案能力推进到正式主入口：新增 `Agent Apps` 管理页、已安装 App 侧栏入口、运行页与内容工厂样板，支持安装预览、启动入口、运行状态和任务提交闭环。
- Agent App Host Bridge / Runtime 面补齐前后端命令：新增 app inspect / install / uninstall / state / runtime task 命令、DevBridge dispatcher、浏览器 mock、治理目录册和前端 API 网关，保持命令契约同源。
- Agent App 安装链路补齐 cloud bootstrap、package cache、setup state store、lifecycle action、cleanup rehearsal / residual audit 和 package identity，减少“已安装但不可启动”的假入口。
- 专家广场进入主导航：新增专家目录、详情面板、安装覆盖层、运行绑定、analytics 投影和 Agent 对话内专家启动参数，支持从专家入口恢复或创建专属对话。
- 旧 SceneApp GUI / Rust 命令 / DevBridge / lib API 主体清退，保留必要 legacy summary / follow-up 兼容投影，避免 current Agent App 主线继续与旧入口双轨并存。

### 用户可见更新

- 左侧导航新增 `专家` 与 `Agent Apps`，并可根据已安装 Agent App 动态展示可启动入口；原 `场景应用` 独立页面不再作为当前主入口。
- Agent App 管理页支持查看安装状态、来源、入口、能力就绪度、卸载排练与运行启动结果；内容工厂样板可作为默认演示 App 跑通入口体验。
- Agent App 运行页可基于 entry runtime guard 检查权限、能力与入口状态，并把任务提交到 Agent runtime，避免 UI 只展示静态预览。
- 专家广场提供种子专家目录、专家详情、安装提示和对话启动入口；Agent 对话区可展示专家信息面板并携带专家启动上下文。
- 自动化、记忆、Agent Home、工作区和设置页同步移除 SceneApp 旧文案 / 入口残留，五语言资源补齐 `agentExperts`、Agent App 与导航相关文案。

### 开发者与治理更新

- 新增 `src/features/agent-app/runtime/`、`src/features/agent-app/sdk/`、`src/features/agent-app/adapters/` 与 schema gate，明确 Host Capability、CapabilityHost、runtime package loader、workflow runtime host 与 UI extension host 的边界。
- 新增 `src-tauri/src/commands/agent_app_cmd.rs`、`src-tauri/src/commands/agent_app_runtime_cmd.rs`、`src-tauri/src/dev_bridge/dispatcher/agent_apps.rs` 与 `src-tauri/crates/core/src/agent_app_runtime_token.rs`，让 Agent App state / runtime token / task 命令进入 Rust current 主路径。
- `src/lib/api/agentApps.ts` 与 `src/lib/api/agentAppRuntime.ts` 成为前端 Agent App 命令事实源，并与 `src/lib/tauri-mock/agentAppMocks.ts`、`mockPriorityCommands`、`agentCommandCatalog` 同步。
- `docs/roadmap/agentapp/` 扩展 P5-P17 执行计划，补齐 cloud bootstrap、schema gate、setup resolver、package cache、runtime loader、entry guard、正式入口、生命周期清理和 GUI smoke 演练路线。
- `.gitignore` 放行 `docs/roadmap/zuanjia/*.md`，专家方向文档与 Agent App 路线图一并进入版本化事实源。
- 测试修复覆盖 Inputbar 语音录制最短时长、AgentThreadMemoryPrefetchPreview locale、manifest / content factory fixture、ExpertInfoPanel hook 依赖与 schema / analytics lint 边界。

### 校验状态

- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all`：通过。
- `npm run verify:app-version`：通过，目标版本 `1.40.0`。
- `CARGO_TARGET_DIR="$HOME/.cache/lime-cargo-target-v140" cargo test --manifest-path "src-tauri/Cargo.toml"`：通过，主库 `1320 passed; 0 failed; 1 ignored`，集成测试通过；真实联网测试保持 ignored。
- `CARGO_TARGET_DIR="$HOME/.cache/lime-cargo-target-v140" cargo clippy --manifest-path "src-tauri/Cargo.toml" --workspace --all-targets -- -D warnings`：通过。
- `npm run lint`：通过。
- `npm test`：通过，`57/57` 批次通过。
- `npm run test:contracts`：通过；命令契约、Harness 契约、modality contracts 与 cleanup report contract 均通过。
- `npm run verify:gui-smoke`：通过；覆盖 DevBridge、workspace ready、browser runtime、site adapters、Skill Forge / Service Skill、runtime tool surface、`@` 命令注册、Claw streaming、knowledge GUI 与 design canvas。
- `git diff --check`：通过。

---

**完整变更**: `v1.39.0` -> `v1.40.0`
