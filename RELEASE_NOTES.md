## Lime v1.41.0

发布日期：`2026-05-16`
递交范围：当前完整 worktree，包含 tracked 与新增文件；本次先按要求提交并推送 GitHub，完整发布门禁将在后续补跑后再更新结论。

> 发布说明：上一版 release tag 为 `v1.40.0`。本版升级到 `v1.41.0`，并继续清理旧 `RELEASE_NOTES.md` 历史堆叠内容，只保留当前版本说明；旧 v1.40.0 发布说明不再作为当前 release note 事实源保留。

### 发布概览

- 应用版本从 `1.40.0` 升级到 `1.41.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- Agent App P18 Typed Capability SDK 进入可交接状态：新增 package-side handoff gate、SDK public surface、Host Bridge SDK client、Capability Adapter 与内容工厂 SDK 回归，避免 App 继续依赖私有 bridge transport。
- Agent App Runtime facade 继续收敛到 `agent_app_runtime_*` current 主链，补齐 task lifecycle、Host response、artifact / evidence refs、workspace patch replay、跨刷新恢复与 hidden session 边界。
- Runtime evidence / handoff / review / replay 导出结果可投影回 Agent App task event，Evidence Pack、analysis、review decision、replay case 等制品不再停留在只读导出侧。
- Claw capability 复用从命令文件中拆出 catalog service，首批 `image / cover / research / report / pdf / summary` capability hint 只映射到既有 Claw launch metadata，不新增垂直 `content_factory_*` 命令。
- 正式 `Agent Apps` GUI smoke 形成独立证据，覆盖正式入口、registration blocker、Cloud install review、lifecycle disable / enable、runtime surface、uninstall rehearsal 和 flag-off regression。

### 用户可见更新

- `Agent Apps` 正式入口具备独立 smoke 锚点和正式页面可达性校验，Lab 入口不再替代正式入口证据。
- 内容工厂 App 可通过 Host Bridge 订阅 AgentRuntime task update，并从 artifact / snapshot / event payload 中回放 `workspacePatch` / `contentFactoryWorkspacePatch`。
- App 内任务结果支持展示 artifact、evidence、verification outcome 与运行进度，减少“任务 accepted 后长期 idle”的误导状态。
- Agent App hidden runtime session 不再污染普通最近对话，任务恢复和 Host response 继续使用 app / task scope。

### 开发者与治理更新

- 新增 `src/features/agent-app/sdk/` 相关 facade、contract、adapter 与 public surface 回归，固定 SDK-only consumer 边界。
- 新增 `scripts/agent-app-package-handoff-check.mjs` 与 `scripts/lib/agent-app-package-handoff-core.mjs`，机械检查外部 Agent App package 的 dirty 状态、私有 bridge marker、SDK marker、高风险脚本和 `src -> dist` 产物漂移。
- 新增 `src-tauri/src/services/agent_app_runtime_capability_catalog_service.rs` 与 `src-tauri/src/services/runtime_evidence_projection_service.rs`，把 capability catalog 与 evidence projection 从 runtime command 里拆成单一职责服务。
- `docs/roadmap/agentapp/` 与 `docs/roadmap/agentruntime/` 补齐 P17.5、P18 handoff、package SDK migration、completion audit、raw worker pre-gate 与 AgentRuntime completion audit，当前事实源回到 versioned artifact。
- `agent_app_runtime_cmd` 增加模型偏好解析、最近成功 Agent run fallback、provider catalog fallback、runtime event emit、artifact replay、evidence projection 与 content factory output contract。

### 当前校验状态

- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all`：已通过。
- `cargo test --manifest-path "src-tauri/Cargo.toml"`：已启动但按用户要求先提交，后台进程已终止；尚未形成通过结论。
- `npm run verify:app-version`：待本次提交前快速复核。
- `cargo clippy` / Rust lint、`npm run lint`、`npm test`、`npm run test:contracts`、`npm run verify:gui-smoke`：本次先提交 GitHub，尚未补跑完整结论。

---

**完整变更**: `v1.40.0` -> `v1.41.0`
