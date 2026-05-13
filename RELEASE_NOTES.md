## Lime v1.38.0

发布日期：`2026-05-14`
递交范围：当前完整 worktree，包含 tracked、deleted 与新增文件；本次按发布要求完成版本号、release note 与发布前校验，提交和推送将在获得明确确认后执行。

> 发布说明：上一版 release tag 为 `v1.37.0`。本版升级到 `v1.38.0`，并继续清理旧 `RELEASE_NOTES.md` 历史堆叠内容，只保留当前版本说明；旧 v1.37.0 发布说明不再作为当前 release note 事实源保留。

### 发布概览

- 应用版本从 `1.37.0` 升级到 `1.38.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- `smart-input` 独立浮窗整体下线，删除旧页面、组件、窗口配置、前端 API 与治理回流入口，不再保留可关闭、拖动、圆角、旧 Logo 等旧浮窗问题面。
- 旧 `voice-input` 独立语音窗口下线，`Fn` / 语音快捷键改为进入首页 / Claw 输入框录音按钮同一状态机，通过主窗口事件 `voice-start-recording` / `voice-stop-recording` 驱动输入栏录音。
- 翻译快捷键、截图对话快捷键与截图实验入口清理，保留真正仍属于 current 主链的 `@翻译` skill、`translate_instruction_id` 与首页 `voice-input` guide 语义。
- 命令边界同步清理：移除旧 `open_voice_window` / `close_voice_window`、截图命令与 smart-input 调用面，补齐 Rust 注册、前端网关、DevBridge mock、governance catalog 与 contracts 守卫。

### 用户可见更新

- 首页 / Claw 输入框成为语音识别唯一 current 入口，快捷键不再打开单独快捷输入框，也不会再残留无法关闭或无法停止识别的旧浮窗。
- 设置页快捷键列表移除已过时、未实现或已下线的翻译 / 截图 / smart-input 入口，避免用户看到无效快捷键。
- 输入栏录音按钮、语音润色失败兜底、图片附件、排队回合与工具按钮补齐回归测试，保证快捷键进入同一输入栏状态后仍能稳定发送。
- 历史消息合并修复：只有在 assistant 历史中存在工具、任务预览或过程轨迹缺用户 turn 时才补回用户消息，避免普通分页历史重复补用户消息。
- 图片任务缓存恢复回归补齐：空历史从图片工作台缓存恢复时保留原始用户输入与完成卡，新草稿不再回灌上一条会话的图片轻卡。

### 开发者与治理更新

- 新语音快捷键事实源固定为 `src-tauri/src/voice/events.rs`、`voice/shortcut.rs`、`voice/fn_shortcut.rs` 与前端 `src/lib/api/voiceShortcutEvents.ts` / `useInputbarDictation`。
- 旧 `smart-input` / 旧语音窗口 / 截图对话链路均归类为 `dead`，不再新增 compat 包装层。
- `ShortcutSettings` 收敛到 Settings v2 shared 目录，旧 `src/components/smart-input/ShortcutSettings*` 删除。
- 五语言 i18n 资源清理旧快捷键与旧入口文案，继续保持 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR` 覆盖一致。
- `protocol-fact-source-guard`、`legacySurfaceCatalog` 与 hotkey catalog 回归补齐旧入口防回流断言。

### 校验状态

- `npm run verify:app-version`：通过，目标版本 `1.38.0`。
- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all`：通过。
- `CARGO_TARGET_DIR="/tmp/lime-cargo-target-v138" cargo test --manifest-path "src-tauri/Cargo.toml"`：通过，主库 `1340 passed; 0 failed; 1 ignored`，集成测试通过。
- `CARGO_TARGET_DIR="/tmp/lime-cargo-target-v138" cargo clippy --manifest-path "src-tauri/Cargo.toml" --workspace --all-targets -- -D warnings`：通过。
- `npm run lint`：通过。
- `npm test -- src/components/agent/chat/hooks/agentChatHistory.test.ts src/components/agent/chat/hooks/sessionHistoryMergeController.test.ts`：通过。
- `npm test -- src/components/agent/chat/workspace/useWorkspaceImageTaskPreviewRuntime.test.tsx`：通过。
- `npm test`：通过，55/55 批次通过。
- `npm run test:contracts`：通过，命令契约、Harness 契约、modality contracts 与 cleanup report contract 均通过。
- `npm run governance:legacy-report`：通过，边界违规 `0`；本轮 smart-input / screenshot / onboarding dead surface 作为已删除或零引用清理项受控记录。
- `git diff --check`：通过。
- `npm run verify:local`：通过，包含版本一致性、前端 lint/typecheck/Vitest/contracts、Rust test 与 GUI smoke。

---

**完整变更**: `v1.37.0` -> `v1.38.0`
