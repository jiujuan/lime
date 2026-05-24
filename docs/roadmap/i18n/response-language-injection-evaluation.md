# AI response language 注入评估

> 关联 PRD：`docs/roadmap/i18n/prd.md`
> 关联进度：`docs/roadmap/i18n/implementation-progress.md`
> 评估时间：2026-05-23

## 评估目标

在实现 PRD P2 的 “AI response language 设置与 request metadata 注入” 前，先确定它应落在哪条 Query Loop 主链，避免把 UI locale、内容产物语言、Browser Environment `Accept-Language` 或 ASR 语言混成同一个事实源。

## 当前事实

- `docs/aiprompts/query-loop.md` 明确当前提交主链是 `agent_runtime_submit_turn -> runtime_turn 归一化与组包 -> TurnInputEnvelope -> runtime_queue -> stream_reply_once`。
- 该文档同时规定：`@` 命令、场景启动、service skill 等专题能力只能在提交前补 `request_metadata.harness.*`，不能绕开 submit turn 新建第二条执行链。
- 前端集中构造入口是 `src/components/agent/chat/utils/harnessRequestMetadata.ts` 的 `buildHarnessRequestMetadata()`；`src/components/agent/chat/workspace/workspaceSendHelpers.ts` 会把它包装成最终 `requestMetadata.harness`。
- `src/components/agent/chat/AgentChatWorkspace.tsx` 当前生成 steady-state harness metadata，`src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 在发送前合并 command / skill / fast response metadata。
- Rust 归一化边界是 `src-tauri/src/commands/aster_agent_cmd/runtime_turn.rs` 的 `normalize_runtime_turn_request_metadata(...)` 与 `build_full_runtime_system_prompt(...)`。
- `src-tauri/crates/agent/src/turn_input_envelope.rs` 的 `TurnInputEnvelope` 已能快照最终 system prompt、prompt augmentation stages 与 turn context metadata。
- `docs/roadmap/i18n/language-boundary-evaluation.md` 已确认当前不能复用 `Config.language` 作为 AI response language 或内容产物语言事实源。

## 事实源边界

AI response language 的产品语义是 “当前 Agent 默认用什么语言回复”。它不应复用下列字段：

| 字段 / 场景 | 不复用原因 |
| --- | --- |
| `Config.language` | 这是 UI locale；用户可能中文界面、英文回复，或英文界面、中文回复。 |
| Browser Environment `locale` / `accept_language` | 这是站点环境暴露给外站的语言，不应自动跟随 Agent 回复语言。 |
| Artifact / media / Knowledge `language` / `target_language` | 这是内容或产物语言，通常是任务级参数，不是默认回复偏好。 |
| ASR / transcription `language` | 这是识别或转写语言，不能反向决定模型回复语言。 |
| code fence `language` | 这是代码高亮标签，不是自然语言偏好。 |

推荐新增独立事实源，首期命名应避免泛化为 `language`：

- 用户偏好层：`workspace_preferences.agent_response_language` 或等价 workspace/session preference。
- 请求层：`request_metadata.harness.agent_response_language`。
- 兼容读取层：短期可接受 `response_language` 作为迁移 alias，但 current 写入只使用 `agent_response_language`。

## 注入方案

建议分三步落地，避免一次性扩散 schema、UI、Rust prompt 与 replay 快照：

1. **前端 metadata builder 最小接线**
   - 在 `BuildHarnessRequestMetadataOptions` 增加 `agentResponseLanguage?: string | null`。
   - `buildHarnessRequestMetadata()` 只在值为非空 trimmed string 时写入 `agent_response_language`。
   - `buildWorkspaceRequestMetadata()` 从显式 send options 或已有 harness metadata 读取并保留该字段。
   - 不从 `Config.language` 自动派生该字段；UI locale 只能作为 `auto` 策略的候选输入，而不是硬绑定事实源。

2. **Rust 归一化与 prompt stage**
   - 在 `runtime_turn.rs` 增加一个小的 `ResponseLanguage` prompt stage，读取 `request_metadata.harness.agent_response_language`。
   - 当值为 `auto` 时，系统提示只说明 “根据用户最近输入语言与上下文选择自然回复语言”；不要把 `auto` 写成某个固定 UI locale。
   - 当值为具体 BCP 47 locale 时，系统提示要求模型默认使用该语言回复；但不覆盖用户在当前消息里的显式语言要求。
   - prompt 文案应明确它只影响 Agent 回复，不影响 Artifact target language 或 Browser `Accept-Language`。

3. **TurnInputEnvelope 快照**
   - 在 `TurnInputEnvelope` 的 turn context metadata 中保留归一化后的 `harness.agent_response_language`。
   - 如后续需要更强审计，可再增加 diagnostics 字段；首期不必先改公开 schema。
   - evidence / replay / review 只消费同一份 turn metadata，不另建 response language 解析逻辑。

## 自动策略

`auto` 的实现不应在首期做复杂语言检测。建议按保守顺序：

1. 如果用户当前消息明确要求某种回复语言，当前消息优先。
2. 否则由模型根据用户最近输入语言自然回复。
3. UI locale 只作为弱提示或最后兜底，不作为唯一事实源。
4. 任何内容生成命令若已有 `target_language`，该字段只约束产物语言，不自动改写 `agent_response_language`。

## 验收建议

最小验收应覆盖：

- 前端 metadata builder 单测：`agentResponseLanguage="en-US"` 写入 `agent_response_language`；空值不写；base alias 保留但 current 写入 snake_case。
- Rust prompt 定向测试：`agent_response_language="en-US"` 时 final system prompt 包含回复语言约束；`auto` 时不固化为 UI locale。
- TurnInputEnvelope 定向测试：turn context metadata 保留 `harness.agent_response_language`，便于 replay / evidence 复核。
- 产品组合验证：UI `zh-CN` + Agent `en-US` 可用；Browser preset `ja-JP` 不影响 Agent response language；Artifact `target_language=ko-KR` 不反写 Agent response language。

## 本轮结论

本轮完成注入设计评估，并已把前端 `buildHarnessRequestMetadata()` 的最薄字段、设置页偏好持久化、Rust prompt stage 与定向测试落地。当前 `TurnInputEnvelope` 已能通过现有 turn metadata 快照该值，`SessionExecutionRuntime.recent_response_language` 也已把它继续投影进 evidence / replay / review 可读的 runtime 事实链；下一刀应转向其他 P2/P3 主缺口，不要从 `Config.language` 直接硬接到 Query Loop。
