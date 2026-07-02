# 图片能力 v2 实施与清理计划

更新时间：2026-07-02
状态：设计中

## 原则

开发期没有历史包袱，本计划按替换 current 主链执行：

- 不做长期双轨。
- 不把旧 prompt-driven 链路继续修成“看起来稳定”。
- 需要清理误导命名时直接清理。
- 旧入口只允许短期 test-only / retired guard，不能作为生产 fallback。

## 目标主线

```text
Renderer ImageCommandIntent
  -> App Server ImageCommandWorkflow
  -> mediaTaskArtifact/image/create
  -> Media Runtime worker
  -> UI task projection
```

## 阶段 0：设计冻结

状态：已完成

任务：

- [x] 写入 v2 设计文档。
- [x] 对齐 `internal/aiprompts/command-runtime.md` 中图片条款，把旧 `Skill(image_generate)` 首发规则改为 v2 workflow。
- [x] 同步 modality runtime contract / execution profile，把 current executor 从 `skill:image_generate` 改为 `workflow:image_command`。
- [x] 梳理现有相关文件写集，避免并行改动互相覆盖。

退出条件：

- v2 文档明确产品需求、架构、流程、清理策略和验证门禁。
- current 治理事实源明确 `ImageCommandWorkflow` 是图片命令首发 owner，旧 `image_skill_launch` 只作为短期输入桥。

## 阶段 1：协议与命名收口

目标：把 `image_skill_launch` 从“Skill launch”语义升级为 `ImageCommandIntent`。

状态：前端写入侧已完成，后端仍短期双读新旧 metadata。

建议改动：

- 前端 intent builder：
  - [x] `src/components/agent/chat/workspace/imageCommandIntent.ts`
  - [x] 图片命令写入 `harness.image_command_intent.image_task`
  - [x] 图片命令写入侧不再打开 `allow_model_skills`
- 新增 App Server intent parser：
  - [x] `lime-rs/crates/app-server/src/runtime_backend/image_command/mod.rs` 首期解析器
- request metadata 同时短期读取：
  - [x] 新：`harness.image_command_intent`
  - [x] 旧：`harness.image_skill_launch`
- [x] 写入侧优先写新字段。

清理：

- `modelSkillLaunchDescriptors` 中图片专属逻辑迁出。
- `image_skill_launch` 只作为短期输入兼容读取，不能继续作为代码主概念。
- 后续应继续删除 Rust `agent_skills_context.rs` / `skill_runtime_enable.rs` 中围绕旧图片 Skill 首发的测试和特殊分支。

测试：

- 前端 unit：`@配图`、plain intent、模型标签、文稿 inline 都输出 `ImageCommandIntent`。
- Rust unit：metadata parser 能读取新字段，旧字段只作为 compat 输入。

## 阶段 2：App Server ImageCommandWorkflow

目标：不经过模型自由调用，确定性创建 task artifact。

新增模块建议：

```text
lime-rs/crates/app-server/src/runtime_backend/image_command/
  mod.rs
  intent.rs
  gate.rs
  route.rs
  workflow.rs
  events.rs
```

职责：

- `intent.rs`：解析 / 标准化 intent。
- `gate.rs`：校验 prompt、参考图、项目、slot。
- `route.rs`：解析 provider/model/executor_mode。
- `workflow.rs`：调用现有 `mediaTaskArtifact/image/create` 内部服务。
- `events.rs`：输出 tool-like / image workflow events。

关键要求：

- 复用现有图片 task 创建逻辑，不复制 worker 或 Provider adapter。
- task 创建成功后立即输出 GUI 可消费 projection。
- task 创建失败不进入普通 Agent 文本回复。

测试：

- Rust unit：参数完整时创建 task。
- Rust unit：缺 provider/model fail closed。
- Rust unit：修图缺参考图返回 requires parameters。
- Rust unit：普通文本请求不进入 workflow。

## 阶段 2.5：Workflow Audit Projection

目标：把一次图片命令投影为一个可审计 workflow run，支持多结果分支，但只写入 JSONL / read model / evidence，不直接渲染到聊天区或右侧 UI。

新增 / 调整：

- App Server read model 写入 `ImageCommandRunSnapshot`。
- `count > 1` 或多方向生成时创建 `ImageGenerationBranch[]`。
- branch 与 task artifact / output slot 建立稳定引用。
- worker 状态回写时同步更新 branch 状态。
- App Server / fixture backend 追加 `image_command.*` / `image_task.*` JSONL 审计事件。
- UI 只消费适合展示的轻量 task/read model projection；run steps、branches、provider/model、task path 只进入审计。

UI 最小验收：

- 聊天区能看到自然 assistant 铺垫和图片轻卡。
- 图片轻卡 running 状态不因 `turn.completed` 变成假完成。
- 右侧不展示步骤导轨、分支板、task id、artifact path、provider/model 或原始 JSON。
- 单个分支失败时，JSONL 能证明其它分支是否成功；UI 只展示轻量成功 / 失败结果。
- 技术状态只进入 JSONL / evidence，不在主 UI 暴露为实现词。

测试：

- Rust unit：count=2 生成一个 run + 两个 branch。
- 前端 unit：图片轻卡不展示 workflow steps / branch count / raw JSON。
- fixture：商品图生成两张主图时 JSONL ledger 记录同一 run 下两个 branch。

## 阶段 3：Agent Runtime 接线

目标：`agentSession/turn/start` 在流式模型执行前先处理图片 command workflow。

建议逻辑：

```text
handle_turn_start
  -> parse ImageCommandIntent
  -> if none: normal runtime
  -> if image intent:
       run ImageCommandWorkflow
       emit events
       emit turn.completed / turn.failed
       return
```

可选后续：

- 对需要 prompt refinement 的场景，再引入受控 Agent 子步骤。
- 首期不做 refinement，先保障确定性任务创建。

清理：

- 移除图片命令为了阻止 fast-response 的特殊补丁。
- 移除图片命令 selected Agent Skill body 注入作为 current 必要条件。
- 移除 `runtime_control.stop_after_tool_result` 对图片命令的依赖。

测试：

- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server image_command -- --nocapture`
- `cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server`

## 阶段 4：UI Projection 收口

目标：前端只根据 workflow/task projection 展示任务卡。

改动：

- `taskPreviewFromToolResult` 保留对 workflow tool-like event 的解析。
- MessageList 图片任务卡必须支持 `image_task.created` / task artifact projection。
- MessageList 必须过滤图片 task JSON、workflow step summary、branch summary 和 `.lime/tasks` 路径。
- 文稿 inline slot 从 task artifact 恢复。

清理：

- 删除从 assistant 普通文本推断“图片正在生成”的逻辑。
- 删除聊天区和右侧 workflow chrome 展示。
- 删除 renderer 旧执行器残余命名。

测试：

- `MessageList.imageTasks.test.tsx`
- `taskPreviewFromToolResult.test.ts`
- `useWorkspaceImageTaskPreviewRuntime` 相关单测
- 文稿 inline 回填单测

## 阶段 5：旧 Skill 首发链路退场

目标：`Skill(image_generate)` 不再是 current 首发路径。

清理对象：

- App Server selected skill body 注入中图片命令专属分支。
- `skill_runtime_enable` 中图片命令打开 `image_generate` allowlist 的 current 依赖。
- 默认 `image_generate/SKILL.md` 中“首刀必须调用工具”的 current 叙述。

保留方式：

- 如必须保留 `image_generate`，只能标记为 manual compat / test-only guard。
- 任何 production 图片命令不得依赖它。

验证：

- 删除后 `@配图` fixture 仍通过。
- `Skill(image_generate)` 不可用时图片 command workflow 仍能创建 task。

## 阶段 6：Fixture 与门禁

必须通过：

```bash
npm run smoke:claw-chat-current-fixture -- --scenario image-command --timeout-ms 180000
npm run smoke:claw-chat-current-fixture -- --scenario plain-image-intent --timeout-ms 180000
npm run smoke:claw-chat-current-fixture -- --scenario expert-panel-skills-runtime --timeout-ms 180000
npm run smoke:agent-runtime-current-fixture
git diff --check --
```

按改动补充：

```bash
npm run test:related -- src/components/agent/chat/workspace/imageCommandIntent.ts
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server image_command -- --nocapture
cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server
```

## 删除清单

以下内容不应在 v2 完成后继续作为 current：

| 对象 | 处理 |
| --- | --- |
| `image_skill_launch` 写入侧 | 替换为 `image_command_intent` |
| `Skill(image_generate)` 首发依赖 | 删除 current 依赖 |
| prompt 强制模型调工具 | 删除 |
| fast-response 图片特殊拦截 | workflow 接管后删除 |
| stop-after-tool-result 图片规则 | workflow 接管后删除 |
| renderer-side 图片执行器 | 保持已退场，只保留 projection |
| provider/model 占位 task | fail closed |

## 风险控制

| 风险 | 缓解 |
| --- | --- |
| workflow 事件不能被 UI 识别 | 首期输出 tool-like event，复用 task preview parser |
| App Server 直接 return 导致缺 assistant 文本 | 图片命令本来应以 task card 为主，可附加一条短状态消息 |
| 删除 Skill 影响其他入口 | 先用 rg 确认 production 引用，必要时保留 test-only guard |
| plain intent 误判 | 只启用高置信规则，歧义走普通 Agent |
| 文稿 slot 丢失 | gate 对 document_inline 必须校验 slot/context |

## 完成判定

v2 完成不是“图片能生成一次”，而是：

- 图片入口创建任务不依赖模型自由调用。
- 创建、失败、补参、执行、恢复都有结构化状态。
- UI 没有纯文本假成功。
- 旧 Skill 首发链路从 current 移除。
- 聚合 smoke 通过。
