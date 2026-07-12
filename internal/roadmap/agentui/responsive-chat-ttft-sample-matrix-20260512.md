# AgentUI responsive_chat TTFT 样本矩阵

> 状态：completion gate 已通过；2026-06-14 已追加 App Server stream append 热路径复测、稀疏校验上下文、文本 delta schema fast-path、external append 单锁、批内 terminal guard、文本 delta helper bypass、事件入库 move、终态早返回与事件类型归一复用优化；v15 非 live 静态 / 矩阵 / SVG、schema 定向与 append 定向复核均已通过
> 更新时间：2026-06-14 11:28 CST
> 范围：`agentui-stream-latency-map-20260509.svg` 所指的“真实 answer 首字慢”主线；只记录 provider/model 路由、状态聚合与 TTFT 证据，不记录用户 prompt、assistant 正文、密钥、`error_message` 或 run id。

## 目标审计

整体目标不是“UI 看起来有状态”，而是让 AgentUI 简单对话在真实 provider 下进入可解释的 answer 首字链路：快路径有 first-text TTFT 基线，慢 / error / unsupported 路径能作为 routing fallback evidence 被 current 事实源消费，并在 AgentUI 可靠性面板可见。

| 成功标准 | 当前证据 | 判定 |
| --- | --- | --- |
| Runtime status 百毫秒级可见 | Playwright 复测与 GUI smoke 已证明 submit/runtime status 在百毫秒级；最新 GUI 复核样本 `durationMs=1953ms` | 已达标，不是主瓶颈 |
| 真实 TTFT 进入唯一事实源 | `agent_runs.metadata.model_first_visible_delta_ms / model_first_thinking_delta_ms / model_first_text_delta_ms`；样本矩阵也按 Rust 逻辑支持 `agent_thread_items` timeline fallback | 已闭环 |
| `responsive_chat` 消费历史样本 | Rust `load_responsive_chat_auto_latency_hints` 的口径为 `responsive_chat_auto` / `serviceModelSlot=responsive_chat` / `settingsSource=service_models.responsive_chat`；矩阵脚本已对齐该事实源 | 已闭环 |
| AgentUI 可见 routing / TTFT / fallback reason | Playwright 复核打开 Harness：`agent-thread-reliability-panel` 与 `agent-thread-reliability-routing-evidence` 均存在；面板显示 selected provider/model、首个可见 / 思考 / 正文、decision reason 与 fallback chain | 已闭环 |
| 路线图图像同步最新结论 | `agentui-stream-latency-map-20260509.svg` v15 指向 App Server stream append 热路径收缩：external append 单锁、文本 delta schema fast-path、事件类型归一复用、批内 terminal guard、校验上下文引用复用、文本 delta 跳过大输出 / checkpoint 通用 helper、事件入库 move、终态 turn 早返回、current fixture smoke 与 live TTFT 剩余缺口 | 已闭环 |
| 多 provider 真实样本矩阵 | `--preset agentui-responsive-chat-ttft` 退出码 `0`；`additional first-text samples needed=0`；`8 / 11` 个 latency group 有 first-text 基线，`3` 个 error-only group 保留为 fallback evidence | 已达标 |
| 工具流 panic 防回归 | Agent OpenAI-compatible stream parser 已覆盖 `choices: []` usage chunk 与空 `data:` heartbeat；namespace tool / native alias / contracts / GUI tool surface / Playwright MCP 均已复测 | 已达标 |

结论：工程主链与产品证据链仍保持闭环。2026-06-14 复核发现“首字又慢”不应再只归因于 provider/model：App Server current event append 在每个流式事件上复制并重放整段 turn 历史，长会话 / 长输出会把 `turn.started -> first message.delta` 之间的同步 CPU / 内存开销放大。该回归已通过九刀收缩修复：移除每事件无条件 `stored.events.clone()`；纯 `message.delta / message.delta_batch / message.batch` 不再为每个 token 构造全量状态机上下文；文本 delta 只走轻量 payload / schemaVersion fast-path，不再构造通用 AgentUI runtime event JSON 并跑 `jsonschema`，且 fast-path 先于 coding payload 分支返回；`event_store` 每条事件只做一次 event class 归一化并复用给 sequence、policy、tool lifecycle、text delta 与 terminal 判断；`append_external_runtime_events` 从每批两次 state mutex 收敛为一次写锁，并把终态 turn 判断从每事件扫描降到每批一次；批内 terminal 检查从 pending events 线性扫描改成布尔 guard，且同一工具 / 动作事件的校验上下文按引用复用，不再在 sequence verifier 与 tool lifecycle verifier 之间重复 clone；文本 delta 不再进入大输出归档判断和 file checkpoint snapshot 通用 helper；批处理完成后只克隆一份返回给 JSON-RPC 通知，原始 `AgentEvent` 直接 move 进 `stored.events`；空批或已终态 turn 直接早返回空事件，避免 late stream 继续分配和遍历。需要跨事件状态机校验时，上下文仍保留工具、动作、patch、命令、测试、权限、sandbox 与 turn 终态事件，不夹带大量文本历史。

## 2026-06-14 追加复测

本轮复测源于用户反馈“最新版本又变得很慢首字”。对照 `agentui-stream-latency-map-20260509.svg` v7 后，前端首字 flush / overlay 单元测试仍通过，恢复历史会话 hydration 也有内存短路；新的热点落在 App Server `append_runtime_events_to_state`：流式回调路径每收到一个 runtime event 都先 clone `stored.events` 并重建 sequence / tool lifecycle 校验上下文，然后才回调前端。

处理结果：

- `lime-rs/crates/app-server/src/runtime/event_store.rs`：移除每事件无条件 `stored.events.clone()`；按事件类型延迟构造同 turn 校验上下文。文本 delta 快路径不再扫描历史；跨事件状态机事件只扫描状态机相关历史，不再复制大量 `message.delta`。
- `lime-rs/crates/app-server/src/runtime/event_store.rs`：`append_external_runtime_events` 由“读锁取 `thread_id` + 写锁 append”收敛为单次写锁；外部流式每 token 一批时少一次 mutex 获取，并且 terminal turn 判断只在批次开始做一次。
- `lime-rs/crates/app-server/src/runtime/event_store.rs`：批内 terminal 事件检测由每事件扫描 pending events 改为 `pending_terminal_for_turn` 布尔 guard；工具 / 动作事件的稀疏校验上下文只构造一次，并在 schema sequence 与 tool lifecycle 校验之间按引用复用，减少长会话工具事件的重复 clone。
- `lime-rs/crates/app-server/src/runtime/event_store.rs`：纯 `message.delta / message.delta_batch / message.batch` 直接保留 payload，不再调用 `normalize_large_output_payload` 或 `persist_runtime_file_checkpoint_snapshot`；这两个 helper 分别只处理 tool terminal 与 `file.changed`，因此文本流语义不变。
- `lime-rs/crates/app-server/src/runtime/event_store.rs`：批处理完成后先克隆一份 `appended_events` 作为 JSON-RPC 通知返回值，再把原始事件 move 到 `stored.events`；避免在入库阶段逐事件 clone 后继续保留原件。
- `lime-rs/crates/app-server/src/runtime/event_store.rs`：空批或已终态 turn 直接返回空事件，不再进入 `events` / `output_records` 分配与 runtime event 循环；late stream 行为仍保持“忽略并不改变 read model”。
- `lime-rs/crates/app-server/src/runtime/event_store.rs`：每条事件只归一化一次 event class，并复用到 sequence context、policy normalization、tool lifecycle、text delta 与 terminal 判断；纯文本 token 不再重复进入多组 helper match。
- `lime-rs/crates/app-server/src/agent_ui_event_schema.rs`：为 `message.delta / message.delta_batch / message.batch` 增加 schema fast-path，只校验 payload 为对象、timestamp 非空、`runtimeEventSchemaVersion` 仍为 `lime-runtime-event/v0.1`；该 fast-path 先于 coding payload 分支返回，`state.delta`、coding、tool、action、permission、sandbox 与 turn terminal 仍走原校验。
- `lime-rs/crates/app-server/src/runtime/tests/external_events.rs`：新增并扩展 `append_external_runtime_events_keeps_text_delta_fast_path_and_terminal_guards`，覆盖工具前后大量 `message.delta` 后 `turn.completed` 仍能拒绝未闭合工具；新增 `append_external_runtime_events_keeps_tool_lifecycle_guards_with_sparse_context`，证明稀疏上下文仍能拦截 pending action 未解除前的工具输出。

追加验证：

| 检查 | 结果 |
| --- | --- |
| `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server agent_ui_event_schema -- --nocapture` | v15 通过，10 tests |
| `CARGO_TARGET_DIR="/tmp/lime-agentui-append-target" CARGO_INCREMENTAL=0 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server append_external_runtime_events -- --nocapture` | v15 通过，27 tests；0 failed；220 filtered out |
| `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_tool_inventory_ -- --nocapture` | 通过，2 tests |
| `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server append_external_runtime_events_keeps_text_delta_fast_path_and_terminal_guards -- --nocapture` | 通过 |
| `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server append_external_runtime_events_keeps_tool_lifecycle_guards_with_sparse_context -- --nocapture` | 通过 |
| `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server append_external_runtime_events_rejects_unclosed_tool_at_turn_terminal -- --nocapture` | 通过 |
| `npm test -- --run src/components/agent/chat/hooks/agentStreamTextRenderFlushController.test.ts src/components/agent/chat/hooks/agentStreamTimerController.test.ts src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts` | 通过，40 tests |
| `npm run smoke:agent-runtime-current-fixture` | 通过；`liveProviderUsed=false` |
| `node scripts/agentui-ttft-sample-matrix.mjs --preset agentui-responsive-chat-ttft --format markdown --limit-groups 12` | 通过；11 groups；8 first-text baseline；3 fallback-only；need=0 |
| `xmllint --noout internal/roadmap/agentui/images/agentui-stream-latency-map-20260509.svg` | 通过 |
| `git diff --check -- ...` | 通过，本轮触碰文件无 whitespace error |

未执行项：

- live provider TTFT 采样未跑；该入口会调用真实模型并消耗额度，需要显式授权后再用 `scripts/agentui-ttft-live-sample.mjs` 复测。
- `MessageList.test.tsx` 与 `agentStreamRuntimeHandler.unit.test.ts` 合跑时出现 i18n 全局语言污染，单跑均通过；该问题不是本轮首字热路径改动引入，后续应单独收测试隔离。

## 2026-05-29 追加复测

本轮复测源于模型切换后真实 GUI 报错：`runtime turn 后台任务 panic: index out of bounds: the len is 0 but the index is 0`。定位到 OpenAI-compatible stream 兼容网关会在工具参数流中发送 `choices: []` 的 usage / heartbeat / 尾包；Agent 旧 parser 在工具流内直接读取 `choices[0]`，导致正在生成工具输入时 panic。

处理结果：

- `lime-rs/crates/agent-rust/crates/agent/src/providers/formats/openai.rs`：生产路径不再直接 `choices[0]`；空 `choices` 只保留 usage 并继续等待 tool chunk；空 `data:` heartbeat 跳过；空 content 的结束包带 usage 时继续向上产出 usage。
- `lime-rs/src/commands/agent_cmd/request_model_resolution/tests.rs`：OpenAI-compatible provider fixture 改为中性 provider/model/host，移除真实外部 URL 与固定第三方 provider 名。
- `agentui-stream-latency-map-20260509.svg`：更新到 v7，图上同时标注工具流 panic 修复、TTFT 矩阵、contracts、GUI / Playwright MCP 复测和剩余全量 GUI smoke 阻塞。

追加验证：

| 检查 | 结果 |
| --- | --- |
| `responsive_chat_provider_filter_keeps_openai_compatible_provider_named_codex` | 通过 |
| Agent `test_streaming_tool_call_ignores_empty_choices_usage_chunks_until_finish` | 通过 |
| Agent `streaming_tool_call` 过滤 | 4 passed |
| Agent `response_to_message` 过滤 | 22 passed |
| Agent `namespace` 过滤 | 9 passed |
| Agent `categorize_tool_requests` 过滤 | 7 passed |
| `npm run test:contracts` | 通过 |
| `node scripts/agentui-ttft-sample-matrix.mjs --preset agentui-responsive-chat-ttft --format markdown --limit-groups 12` | pass；11 groups；8 first-text baseline；3 fallback-only；need=0 |
| `npm run bridge:health -- --timeout-ms 120000` | 通过 |
| `npm run smoke:agent-runtime-tool-surface` | 通过 |
| `npm run smoke:agent-runtime-tool-surface-page -- --app-url http://127.0.0.1:1420/ --health-url http://127.0.0.1:3030/health --invoke-url http://127.0.0.1:3030/invoke --timeout-ms 300000 --interval-ms 1000` | 通过 |
| Playwright MCP | Code runtime fixture / Harness 可见工具输出 6 条、命令执行、文件写入、文件读取、文件活动、routing evidence；console error=0；页面不含 `panic` / `index out of bounds` / `-32603` / `-32002` |

剩余缺口：

- `npm run verify:gui-smoke -- --reuse-running --timeout-ms 300000 --interval-ms 1000` 未全绿：前置 workspace / browser runtime / site adapters / Skill Forge 前端与多段 Rust 定向通过，但聚合流程在 `smoke:agent-service-skill-entry` 的 `tools::skill_tool_gate::tests::` 段超过 330s 后被脚本清理。
- 本机磁盘剩余约 2.9GiB，`/tmp/lime-agent-target` 约 11GiB，`lime-rs/target` 约 121GiB，且当时存在其它 Cargo / Clippy 构建进程。全量 GUI smoke 需要释放 target/磁盘或等待构建结束后复跑。

## 可复跑导出工具

只读审计入口：

```bash
node scripts/agentui-ttft-sample-matrix.mjs --format markdown --limit-groups 12
node scripts/agentui-ttft-sample-matrix.mjs --format json --output /tmp/agentui-ttft-sample-matrix.json
node scripts/agentui-ttft-sample-matrix.mjs --preset agentui-responsive-chat-ttft
```

边界：

- 默认读取当前平台的 Lime SQLite 数据库：macOS `~/Library/Application Support/lime/lime.db`、Windows `%APPDATA%/lime/lime.db`、Linux `${XDG_DATA_HOME:-~/.local/share}/lime/lime.db`。
- 使用 SQLite `-readonly`，只查询 `agent_runs` 与 `agent_thread_items` 的聚合证据。
- first-text 口径与 Rust 事实源对齐：优先 `agent_runs.metadata.model_first_text_delta_ms`，成功样本缺该字段时回退到 `agent_thread_items` user -> agent timeline；不使用 `duration_ms` 替代 answer 首字。
- `responsive_chat latency group` 的纳入条件与 Rust parser 对齐：`decisionSource=responsive_chat_auto`，或 `serviceModelSlot=responsive_chat`，或 `settingsSource=service_models.responsive_chat`。
- error-only / unsupported-like group 不进入 first-text baseline 目标；它们作为 routing fallback evidence 保留，不能用 duration 冒充首字。
- Markdown / JSON 不导出 prompt、assistant 正文、`error_message`、密钥、run id；本机用户目录缩写为 `~`，custom provider id 只展示截断形式。
- 该脚本是开发审计工具，不新增 GUI 文案；若后续接入 AgentUI，presentation 必须走 `agent.json` 五语言 key。

## Completion gate 快照

来源：

```bash
node scripts/agentui-ttft-sample-matrix.mjs \
  --format json \
  --output /tmp/agentui-ttft-final.json \
  --preset agentui-responsive-chat-ttft
```

结果：退出码 `0`。

| 指标 | 值 |
| --- | ---: |
| 扫描 run | 2194 |
| 聚合 group | 47 |
| 含 routing evidence 的 run | 582 |
| 含 first-text 证据的 run | 1007 |
| `responsive_chat` latency run | 71 |
| `responsive_chat` latency group | 9 |
| passing first-text group | 6 |
| fallback-only group | 3 |
| `totalNeededFirstTextSamples` | 0 |
| preset status | `pass` |

## 真实样本矩阵

| provider/model | runs | sources | status | first-text 样本 | text min/p50/avg/max | 结论 |
| --- | ---: | --- | --- | ---: | --- | --- |
| `deepseek/deepseek-v4-flash` | 18 | `request_override` / `responsive_chat_auto` | success:17 / running:1 | 17 | `1377 / 2296 / 8007 / 91275ms` | 快路径主基线；存在历史 outlier，p50 仍可用 |
| `custom-0f61e11f.../MiniMax-M2.7` | 14 | `request_override` / `responsive_chat_auto` | success:14 | 14 | `2023 / 3249 / 4023 / 6622ms` | 有稳定 first-text 基线，可用于跨 provider 对照 |
| `siliconflow-cn/deepseek-ai/DeepSeek-V4-Flash` | 11 | `request_override` / `responsive_chat_auto` | success:9 / running:2 | 9 | `1641 / 2796 / 3615 / 6957ms` | 已补足 first-text；整体可作为可用候选但波动高于 deepseek |
| `custom-f74b38b5.../sensenova-6.7-flash-lite` | 4 | `request_override` / `responsive_chat_auto` | success:4 | 4 | `5683 / 7065 / 8121 / 10055ms` | 可用但慢，应被低延迟路由降权 |
| `custom-02edcbdf.../astron-code-latest` | 4 | `request_override` / `responsive_chat_auto` | success:4 | 4 | `2509 / 10552 / 11643 / 18284ms` | 可用但慢，作为 slow fallback 证据 |
| `custom-da3283c4.../claude-sonnet-4-6` | 4 | `request_override` / `responsive_chat_auto` | success:4 | 4 | `2709 / 3830 / 8577 / 18729ms` | 可用但波动明显，作为慢候选证据 |
| `custom-cae6e762.../mimo-v2-flash` | 7 | `request_override` / `responsive_chat_auto` | error:6 / running:1 | 0 | n/a | fallback-only；不作为 first-text baseline |
| `lime-hub/claude-sonnet-4-6` | 5 | `request_override` / `responsive_chat_auto` | error:5 | 0 | n/a | fallback-only；满足必测 provider 的错误证据，不冒充首字 |
| `openrouter/aion-labs/aion-1.0` | 4 | `request_override` / `responsive_chat_auto` | error:4 | 0 | n/a | fallback-only；满足必测 provider 的错误证据，不冒充首字 |

## 授权后采样结果

用户已明确授权外部 provider API 采样。本轮按小批次执行，未记录 prompt、assistant 正文、密钥、`error_message` 或 run id。

| 批次 | 结果 |
| --- | --- |
| responsive-auto 探针 | `deepseek/deepseek-v4-flash` 成功，`firstTextDeltaMs=1579ms`，证明 live sampler 与 read model 可用 |
| SiliconFlow | 补 `2` 条 `deepseek-ai/DeepSeek-V4-Flash` first-text，矩阵累计达标 |
| MiniMax | 补 `3` 条 `MiniMax-M2.7` first-text，矩阵累计达标 |
| custom Claude / Astron / SenseNova | 各补 `3` 条 first-text，矩阵累计达标 |
| Mimo / Lime Hub / OpenRouter | 多次真实调用进入 error-only / running 证据；保留为 fallback-only group，不用 duration 冒充首字 |
| GUI 复核 | 最新 responsive-auto 样本：selected `deepseek/deepseek-v4-flash`，`firstVisible=1533ms`、`firstThinking=1533ms`、`firstText=1938ms`；Harness 可靠性面板与 routing evidence 均可见，console error 为 `0` |

## 不接受为完成证据的信号

- `duration_ms` 不是 answer 首字；只能辅助定位，不能替代 `model_first_text_delta_ms` 或 timeline first-text。
- `responsive_chat_auto` run count 不是首字秒级证据；必须看到 first-text 或明确 fallback-only 分类。
- 单测覆盖 fallback 规则，不等于真实 provider 延迟矩阵；必须有本地 DB 聚合证据与 GUI read model 复核。
- Runtime status 百毫秒级不代表 provider 首 token 快；它只能证明 DevBridge / runtime 接收快。
- error-only group 不能被包装成成功 baseline；只能作为 routing fallback evidence。

## 下一刀

主目标已完成。后续如果继续优化，优先做低风险减法而不是继续扩 provider 样本：

1. 将 `scripts/agentui-ttft-live-sample.mjs` 保持为开发采样工具，不接入 GUI；如需产品化必须先补五语言 i18n。
2. 针对 fallback-only group 补错误分类枚举，但仍不写 `error_message` 到路线图。
3. 把 `responsive_chat` 慢候选阈值可视化为“低延迟 / 慢 / fallback-only”三段，避免用户把慢模型误认为首字达标。
