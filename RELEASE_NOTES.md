## Lime v1.49.0

发布日期：`2026-05-24`
递交范围：`v1.48.0` 后的发布收口修复。本版只保留当前 release note 事实源，旧 `v1.48.0` 发布说明不再作为当前发布说明保留。

### 发布概览

- 应用版本从 `1.48.0` 升级到 `1.49.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- Mimo / xiaomimimo Anthropic-compatible Provider 完成 SGP host 识别、模型别名归一、模型列表兜底与 Prompt Cache catalog 对齐，避免 `/models` 404 或旧别名导致模型不可选。
- API Key Provider 保存逻辑支持替换当前 Provider 的旧密钥，设置页保存时不再追加重复 key，避免界面已改但运行时仍调用旧密钥。
- 任务中心删除旧 hover / search 预取链路，打开历史会话时不再被旧预取请求抢占；新建任务首页和历史会话切换保留 current 任务中心主路径。
- GUI smoke 发布门禁加固：增加单 runner 锁、延长 CI 超时、拆分并验证 Skill Forge Rust 定向测试实际运行，避免 release 前冒烟被并发或长编译误判。
- `@` 命令注册表 smoke 改为在提交前显式过滤并确认 `@配图` badge，确保发布门禁真实覆盖 `@配图 -> image_generate` 主链。
- Knowledge GUI smoke 的种子阶段关闭 Builder Runtime 外部模型依赖，使发布冒烟不再受租户白名单影响。

### 用户可见更新

- Mimo SGP / CN 等 xiaomimimo Host 可以重新保存和切换，模型下拉可在上游不提供标准模型枚举时显示当前可用模型。
- Provider 详情页保存 API Key 后会替换旧 key，避免保存后结尾仍显示旧 key 或运行时继续使用旧凭证。
- AI 服务商左侧“启用的模型”区域保持独立滚动，长模型列表不再拖动整个设置页。
- 任务中心从侧边栏或搜索结果打开历史会话时更稳定，不再先清空消息或被 hover 预取打断。

### 开发者与治理更新

- `.github/workflows/quality.yml` 的 GUI Smoke 超时调整为 90 分钟，并同步本地建议命令为 `npm run verify:gui-smoke -- --timeout-ms 900000`。
- `scripts/verify-gui-smoke.mjs` 新增 `.lime/locks/gui-smoke.lock` 运行锁，避免多个 GUI smoke 同时争用 headless Tauri、Chrome profile 和 DevBridge。
- `scripts/agent-service-skill-entry-smoke.mjs` 改为按 Rust test filter 分组运行，并检查目标测试名实际通过，防止过滤器空跑。
- `scripts/at-command-registry-e2e.mjs` 在选择 `@配图` 后断言输入栏命令 badge 和提示词已就绪，再等待 `execute_skill image_generate` 请求，避免普通文本误提交流程被当成发布冒烟。
- `scripts/knowledge-gui-smoke.mjs` seed pack 时显式设置 `builderRuntime.enabled=false`，避免 smoke 依赖外部模型白名单。
- Windows / Rust warning 收口：`runner.rs` 未使用变量、`skill_cmd.rs` 平台限定常量与 URL helper、`voice_asr_service.rs` 测试 import 都已按平台 cfg 收紧。
- `fixture_adapter.rs` 写 fixture log 后显式 flush，减少 connector fixture 日志丢失风险。

### 当前校验状态

- 已通过 `npm run verify:app-version`
- 已通过 `npm test`
- 已通过 `npm run lint`
- 已通过 `npm run typecheck`
- 已通过 `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all -- --check`
- 已通过 `cargo test --manifest-path "src-tauri/Cargo.toml"`
- 已通过 `npm run test:contracts`
- 已通过 `npm run lint:rust`
- 已通过 `git diff --check`
- 已通过敏感信息扫描，真实 API Key 未写入仓库或 release note。
- 已通过 Mimo SGP live `/anthropic/v1/messages` smoke：`mimo-v2.5-pro` 返回 HTTP 200。
- 已通过 `npm run verify:gui-smoke -- --timeout-ms 900000`

---

**完整变更**: `v1.48.0` -> `v1.49.0`
