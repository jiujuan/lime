## Lime v1.37.0

发布日期：`2026-05-12`
递交范围：当前完整 worktree，包含 tracked、deleted 与新增文件；本次按发布要求完成版本号、release note、校验，并在获得明确确认后执行提交。

> 发布说明：上一版 release tag 为 `v1.36.0`。本版升级到 `v1.37.0`，并继续清理旧 `RELEASE_NOTES.md` 历史堆叠内容，只保留当前版本说明；旧 v1.36.0 发布说明不再作为当前 release note 事实源保留。

### 发布概览

- 应用版本从 `1.36.0` 升级到 `1.37.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- AgentUI / Team Workbench 继续收敛到 current 投影主链：补齐 team workspace canvas、formation、activity preview、selected session detail、team operations 与 live runtime projector 的结构化 selectors 和回归。
- Agent Chat 工作区强化图片生成与视觉任务预览链路，新增图片 workbench 状态文案、普通视觉 brief 确认、service skill entry 操作与消息列表展示回归。
- Settings v2 与 Skills 工作台删除旧入口残留，继续减少过时 surface 对 current 页面导航和技能注册投影的干扰。
- i18n 资源与类型测试扩展到 Agent 工作区新增 presentation keys，维持 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR` 五语言事实源一致。

### 用户可见更新

- Team Workbench 增加更完整的队伍概览、画布分层、会话 inline detail、活动预览、协作状态与操作面板展示。
- 图片生成体验补齐生成状态、素材预览、消息列表承接、workspace image task preview 与发送动作防护。
- App Sidebar / 页面内容 / 设置首页导航继续向 current 页面集合收敛，移除旧 settings 分类和页面类型残留。
- Capability Draft 与 Workspace Registered Skills 面板更新注册技能投影与工作区技能可用性展示。
- `@` command registry smoke 和 TTFT 采样脚本补齐响应式聊天 / stream latency 证据，相关截图作为本轮 GUI 验证证据随 worktree 保留。

### 开发者与治理更新

- `docs/roadmap/agentui` 增加 completion audit、responsive chat TTFT sample matrix 与 stream latency map 更新，记录 AgentUI 主线完成状态和剩余风险。
- `docs/roadmap/i18n/prd.md` 更新本地化主线进度，明确新增 Agent 工作区文案与测试覆盖。
- Rust media / image skill launch 链路整理生成任务参数、CLI bridge 与 media task 命令测试，避免图片工具运行时继续依赖旧参数假设。
- Team Workspace runtime selectors、presentation hooks、operation state、activity previews 与 live runtime projector 增加定向单测，降低 UI 组件直接拼装 runtime facts 的风险。
- Release note 继续按单版本事实源维护，旧版本说明不再堆叠在当前发布文件内。

### 校验状态

- `npm run verify:app-version`：通过，目标版本 `1.37.0`。
- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all`：通过。
- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all -- --check`：通过。
- `npm run format`：通过。
- `npm run lint`：通过。
- `npm test`：通过，55/55 批次通过。
- `npm run test:contracts`：通过。
- `cargo test --manifest-path "src-tauri/Cargo.toml" --workspace --locked`：通过。
- `cargo clippy --manifest-path "src-tauri/Cargo.toml" --workspace --all-targets -- -D warnings`：通过。
- `npm run governance:legacy-report`：通过，零引用候选 `0`、边界违规 `0`。
- `LIME_AGENT_QC_PROVIDER="custom-f74b38b5-6d3f-44ef-aa0f-99d70c3482ed" LIME_AGENT_QC_MODEL="sensenova-6.7-flash-lite" npm run verify:gui-smoke`：通过，覆盖 GUI 主路径发布风险。
- `LIME_AGENT_QC_PROVIDER="custom-f74b38b5-6d3f-44ef-aa0f-99d70c3482ed" LIME_AGENT_QC_MODEL="sensenova-6.7-flash-lite" npm run verify:local`：通过，包含版本一致性、前端 lint/typecheck/test、contracts、Rust test 与 GUI smoke。

---

**完整变更**: `v1.36.0` -> `v1.37.0`
