## Lime v1.36.0

发布日期：`2026-05-12`
递交范围：当前完整 worktree，包含 tracked、deleted 与新增文件；本次按发布要求完成版本号、release note、校验、提交、tag 与推送。

> 发布说明：上一版 release tag 为 `v1.35.0`。本版升级到 `v1.36.0`，并继续清理旧 `RELEASE_NOTES.md` 历史堆叠内容，只保留当前版本说明；旧 v1.35.0 发布说明不再作为当前 release note 事实源保留。

### 发布概览

- 应用版本从 `1.35.0` 升级到 `1.36.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- AgentRuntime Profile 从路线图提案推进到 current MVP 工程闭环：`agent_runtime_submit_turn -> AgentRuntimeProfileStream -> ThreadReadModel -> Evidence Pack -> Replay / Analysis / Review -> AgentUI projection`。
- Runtime evidence pack 主编排完成拆分，request telemetry、profile projection、completion audit、modality contract、auxiliary runtime、verification、observability、known gaps、artifact index、Markdown locale copy 与输出渲染拆入专门服务，减少单文件巨型事实源。
- AgentUI、Harness、可靠性诊断、Artifact timeline 与 Team Workbench 继续收敛到 key-based projection presentation，不再把 runtime stable facts 翻译回写到 read model。
- 全球本地化规则升级为发布硬约束：前端 current resources 与 Rust/Tauri Markdown、copy prompt、artifact title presentation 覆盖 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR`。

### 用户可见更新

- Agent 工作台新增/强化 routing evidence、可靠性诊断、timeline artifact、team workspace、general workbench workflow、图片附件预览与场景技能入口展示。
- 修复截图触发后的 React 队列崩溃恢复路径，Crash Recovery 面板与 RootRouter 自动恢复不再把已初始化 i18n 状态重置回默认语言。
- 快速响应与模型路由能力增强，request model resolution 支持更明确的 fast response profile、视觉模型能力推断与 routing not possible/decided 诊断。
- Skills、Memory、项目创建、模型能力徽标、账号资料、自动化、渠道日志、Web Search 等页面补齐用户可见回归与多语言资源。
- 全局截图/语音快捷键增加统一 shortcut guard，降低桌面快捷键注册冲突和重复触发风险。

### 开发者与治理更新

- `docs/roadmap/agentruntime` 增加完成审计，明确 current / compat / deprecated / dead 分类和后续非阻塞弱项，避免继续从旧 GUI 自拼状态或旧 evidence 摘要长出平行事实源。
- Evidence / Replay / Analysis / Review 导出统一消费 `agent_runtime_export_evidence_pack`，request telemetry 无匹配请求时输出空摘要，不再保留伪 `unlinked`。
- Rust AgentRuntime profile 增加 task、routing、permission、tool、subagent、job、remote channel 等结构测试；前端 projection 与 i18n 增加稳定回归。
- 质量工作流与仓库规则同步更新：用户可见 presentation 文案必须走 current 五语言资源或 locale copy service。

### 校验状态

- `npm run verify:app-version`：通过，版本一致为 `1.36.0`。
- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all --check`：通过。
- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all`：通过。
- `npm run format`：通过。
- `cargo test --manifest-path "src-tauri/Cargo.toml" --workspace --locked`：通过。
- `cargo clippy --manifest-path "src-tauri/Cargo.toml" --workspace --all-targets -- -D warnings`：通过。
- `npm run lint`：通过。
- `npm test`：通过。
- `npm run test:contracts`：通过。
- `npm run governance:legacy-report`：通过，边界违规 `0`。
- `npm run verify:gui-smoke`：通过，包含 workspace ready、browser runtime、site adapters、agent service skill entry、runtime tool surface、`@` command registry、Claw chat ready streaming、knowledge GUI 与 design canvas smoke。

---

**完整变更**: `v1.35.0` -> `v1.36.0`
