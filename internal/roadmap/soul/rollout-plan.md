# Lime Soul 个性化实施计划

> 状态：current rollout plan
> 更新时间：2026-06-03
> 目标：用小步方式把全局 Soul 能力接入 Lime 个性化主链，同时避免和 Memory 形成重复事实源。

## 1. 实施原则

1. 先文档边界，再实现。
2. 先交互人格，再正式创作声线。
3. 先 current config，再导入 / 导出。
4. 先短 prompt section，再做摘要和自动建议。
5. 每一刀都必须继续收敛到 `memory_profile_prompt_service` / `runtime_turn` / `Generation Brief`。
6. `SOUL.md` 只能是导入 / 导出格式，不进入运行时读取主链。
7. Expert Plaza 只做当前专家会话的局部 persona / skill / workflow 联动，不写回 Global Soul。

## 2. 当前实施快照

截至 2026-06-03，本路线图按“先全局交互人格、再创作声线”的顺序推进：

1. 已完成 Phase 0 文档边界，`internal/roadmap/soul/` 是当前规划事实源。
2. 已完成 Phase 1 全局 Soul 设置，配置落在 `memory.soul`，复用 current app config 读写，不新增 Tauri 命令。
3. 已完成 Phase 2 普通聊天注入，`memory_profile_prompt_service` 统一构建 `【全局交互人格】` section，关闭或空配置不注入。
4. 已完成 Phase 3 `SOUL.md` 导入 / 导出，导入前预览，导入后写 current config，不保留文件路径依赖。
5. 已接入 Phase 4 current 主链，设置页 `正式内容声线` 写入 `memory.soul.artifact_voice`，hook 只读取保存配置，发送层按“本轮开关 + 无显式 generation_brief”把保存声线作为 fallback 归一化到 `artifact.generation_brief`；正式 Artifact metadata 默认补 `generation_brief` 声线边界，`voice_source=none`，不继承 Global Soul / Expert Persona；显式 `generation_brief` 可独立保留并覆盖保存声线，但不会单独触发 Artifact 生成合同。
6. 已推进 Phase 5 专家联动，`expertRuntimeBinding` 输出 personality boundary metadata，`runtime_turn` 将 `harness.expert` 识别为专家会话上下文。

本轮清理：

1. `normalizeSoulArtifactVoiceConfig` 会在配置层清理缺失 / 未知 `voice_source` 下的孤儿 `creator_voice_id` / `brand_voice_id`，避免保存配置本身变成隐式声线事实源。
2. `artifactGenerationBriefMetadata` 是前端工作区发送层收敛显式 voice metadata、清理 camelCase alias、深合并 `artifact` metadata 的 current helper。
3. `artifact_generation_brief_boundary_service` 是后端 Generation Brief 声线边界默认值、alias normalize 和显式 voice metadata 保留的单一事实源。
4. `artifact_request_metadata_service` 只负责 artifact metadata 归一化并调用该边界服务。
5. `artifact_prompt_service` 只负责把已经归一化的边界投影成 prompt section，不再维护另一份默认值逻辑。
6. 清理了只带 `generation_brief` 时被 request metadata 删除、反向误触发 Stage / Schema prompt、workspace base / sendOptions 浅合并丢 artifact 字段，以及缺失 / 未知 `voice_source` 仍携带 voice ID 的边界风险。
7. 清理了保存 Soul 声线提前 merge 到 `workspaceRequestMetadataBase` 的旧做法；保存声线不再作为基础 metadata 常驻，只在发送瞬间按本轮开关和显式覆盖规则进入请求，并写入 `diagnostics.soul_artifact_voice` 解释来源与 guard 结果。

当前不要宣称完成：

1. Phase 4 自动 voice evidence 投影、诊断层详情展示和完整 GUI / E2E 证据。
2. Phase 6 品牌 / 项目声线包。
3. Phase 7 session-scoped personality overlay。

## 3. Phase 0：口径和路线图落盘

目标：

1. 固定 Soul 是 Memory 个性化子路线。
2. 固定 OpenClaw / Hermes 的参考边界。
3. 固定不新增 `soul_*` 事实源。
4. 固定 `SOUL.md` 只做 import / export。
5. 固定 artifact 默认不受 Product Soul 污染。

主产物：

1. `internal/roadmap/soul/README.md`
2. `internal/roadmap/soul/prd.md`
3. `internal/roadmap/soul/architecture.md`
4. `internal/roadmap/soul/diagrams.md`
5. `internal/roadmap/soul/rollout-plan.md`
6. `internal/roadmap/soul/acceptance.md`

验收：

- 文档明确回链 `internal/roadmap/memory/make-next-generation-more-like-me.md`。
- 文档使用 `current / compat / deprecated / dead` 分类语言。
- 文档明确不新增平行事实源。

## 4. Phase 1：全局 Soul 设置

目标：

1. 在设置页提供 AI 个性 / 声线配置入口。
2. 支持编辑、保存、关闭、重置。
3. 配置写入 current app config 或 memory profile 投影。
4. 不触及正式 artifact。
5. 不触碰 Expert Catalog 作为全局事实源。

建议改动：

1. 扩展设置页 IA，将入口放在用户资料 / 记忆偏好附近。
2. 定义 Soul config 类型和默认值。
3. 复用现有配置读写网关，不新增裸 `invoke`。
4. 用户可见文案覆盖 Lime 五语言。
5. 组件测试覆盖保存、关闭、重置和空态。

不做：

1. 不导入文件。
2. 不影响 Generation Brief。
3. 不新增数据库表。
4. 不把专家 `personaRef` 复制到 Soul config。

验证：

```bash
npm exec vitest run "src/components/settings-v2"
npm run test:contracts
```

如果设置页主路径改动明显，补：

```bash
npm run verify:gui-smoke
```

## 5. Phase 2：普通聊天交互注入

目标：

1. Global Soul 影响普通聊天语气。
2. prompt section 统一由 `memory_profile_prompt_service` 构建。
3. section 使用稳定 marker 防重复。
4. 关闭 Soul 后不再注入。
5. 专家会话可以继承 Global Soul 的交互节奏，但 Expert Persona 仍由 expert runtime metadata 定义。

建议改动：

1. 在 `memory_profile_prompt_service` 增加 `build_global_soul_prompt`。
2. 保持与 memory profile、memory sources 同一 merge 边界。
3. 更新 runtime turn 测试，断言普通聊天包含 Soul marker。
4. 更新关闭状态测试，断言 marker 缺失。
5. 保持系统、安全、用户当前指令优先级说明。

不做：

1. 不把完整 Markdown 文件直接塞进 prompt。
2. 不让 Soul section 包含路径、密钥或诊断信息。
3. 不改变工具执行策略。
4. 不让 Expert Persona 反向覆盖 Global Soul。

验证：

```bash
cargo test --manifest-path "src-tauri/Cargo.toml" memory_profile_prompt_service
npm run test:contracts
```

## 6. Phase 3：SOUL.md 导入 / 导出

目标：

1. 支持从 OpenClaw / Hermes 风格 `SOUL.md` 导入。
2. 导入前展示预览和风险提示。
3. 导入后写入 current config，不依赖原始文件。
4. 支持导出当前 Soul 配置为 Markdown。

建议改动：

1. 增加 import adapter，输入为 Markdown 文本或用户选择文件内容。
2. adapter 输出 Soul draft、风险提示、项目规则提示。
3. 导入确认后调用 current 配置写入。
4. 导出只读取 current config。
5. 加测试覆盖空文件、项目规则、普通 persona、避免事项。

不做：

1. 不新增文件 watcher。
2. 不记录导入文件路径作为运行时依赖。
3. 不直接把导入文本作为 system prompt。

验证：

```bash
npm exec vitest run "src/components/settings-v2" "src/lib"
npm run test:contracts
```

如新增 Tauri 文件读取命令，补 Rust 定向测试。

## 7. Phase 4：Creator / Brand Voice 进入 Generation Brief

目标：

1. 正式创作可显式使用个人 / 品牌声线。
2. Product Soul 默认不影响 artifact。
3. `personality_boundary_guard` 决定 voice 字段是否进入本轮。
4. 影响解释能关联用户配置或 evidence。

建议改动：

1. 在生成入口增加“使用我的创作声线”策略。
2. 从 `unified_memory_*`、knowledge pack 或显式配置读取 voice evidence。
3. 在 Generation Brief 编译阶段加入 voice section。
4. 诊断层显示 voice 来源和 guard 结果。
5. 测试 artifact 默认不包含 Product Soul。
6. 测试 Expert Persona 默认不直接进入正式 artifact。

当前已落地的最小切片：

1. 已在前端工作区发送层新增 `artifactGenerationBriefMetadata` helper，将显式 voice metadata 归一化为 `artifact.generation_brief`。
2. 已清理 `generationBrief` / `generation_brief` 别名并保持 sendOptions 覆盖 workspace base 的优先级。
3. 已在设置页增加 `正式内容声线` 显式开关、个人 / 品牌声线来源、evidence pack 和 evidence refs 配置，写入 `memory.soul.artifact_voice`。
4. 已在 `useSoulArtifactVoiceGenerationBrief` 从保存配置读取 `memory.soul.artifact_voice` 并投影为保存声线候选；发送层不再提前合并到 workspace base，而是在本轮开关开启、且没有显式 `generation_brief` 时才应用。
5. 已在配置 normalize、前端 metadata helper 和 Rust 归一化边界清理互斥或孤儿的 `creator_voice_id` / `brand_voice_id`，防止保存声线和本轮显式声线混合，也防止缺失 / 未知 `voice_source` 隐式带入正式产物声线。
6. 已在 artifact request metadata 归一化阶段补齐 `generation_brief` 边界。
7. 已在 Artifact prompt composition 中增加 `【Generation Brief 声线边界】` section。
8. 默认 `voice_source=none`，`inherits_global_soul=false`，`inherits_expert_persona=false`。
9. 显式 `generation_brief` 只作为声线 guard / 诊断上下文独立保留，不作为 Artifact 交付合同开关。
10. 已在 Workspace 输入区增加“创作声线”本轮开关；关闭后本轮不注入保存声线，但保留 `diagnostics.soul_artifact_voice.status=disabled_for_turn` 解释拦截原因。
11. 该切片已经具备显式配置、本轮开关、发送层 fallback 和诊断投影，但还不等于完整 Creator / Brand Voice 产品能力；自动 evidence 投影、诊断详情 UI 和完整 E2E 仍需继续。

不做：

1. 不把 Companion Soul 注入 artifact。
2. 不把所有聊天历史当 voice evidence。
3. 不让用户无感知地改变正式输出声线。
4. 不把专家目录当成品牌声线 evidence，除非用户显式确认。

验证：

```bash
npm exec vitest run "src/components/agent/chat" "src/features/knowledge"
cargo test --manifest-path "src-tauri/Cargo.toml" runtime_turn
```

GUI 主链补：

```bash
npm run verify:gui-smoke
```

## 8. Phase 5：Expert Persona 联动收口

目标：

1. 专家会话能清楚展示当前专家 persona、memory template、skill 和 workflow。
2. 专家会话可继承 Global Soul 的沟通节奏。
3. 专家人格不写回 Global Soul。
4. 专家结果要进入正式创作声线时，必须经用户确认和 Generation Brief guard。

建议改动：

1. 保持 `expertRuntimeBinding` 是 Expert Persona 的 runtime metadata 投影边界。
2. 在专家启动或诊断层标明 Global Soul 只影响交互方式。
3. 为专家会话补测试，断言 expert metadata 与 Soul config 分离。
4. 后续如支持“将专家输出沉淀为声线”，必须写入 Memory / Knowledge evidence，而不是 Soul config。

不做：

1. 不把 Expert Catalog 作为 Global Soul 事实源。
2. 不把专家 `personaRef` 转成 `SOUL.md` 自动导入。
3. 不让专家会话默认污染普通聊天或正式 artifact。

验证：

```bash
npm exec vitest run "src/features/experts" "src/components/experts"
npm run test:contracts
```

## 9. Phase 6：品牌 / 项目声线包

目标：

1. 支持将 Creator / Brand Voice 作为知识库或灵感库对象管理。
2. 支持多品牌、多项目选择。
3. 声线包进入 Generation Brief 前必须经过用户选择或任务匹配。
4. 支持查看影响解释。

建议改动：

1. 复用 Knowledge / `unified_memory_*`，不新增 `voice_*` 主链。
2. 声线包作为 knowledge pack / memory identity projection。
3. 生成入口可以选择目标声线。
4. 保存满意结果时可建议更新声线，但必须用户确认。

不做：

1. 不自动从所有历史结果训练声线。
2. 不默认跨项目共享品牌声线。
3. 不绕过删除 / 禁用 / 导出边界。

验证：

```bash
npm exec vitest run "src/features/knowledge" "src/components/memory"
npm run test:contracts
```

## 10. Phase 7：临时 personality overlay

目标：

1. 支持当前 session 临时切换模式。
2. 切换不清空历史。
3. overlay 不默认沉淀为长期 Soul。
4. 用户可选择将 overlay 保存为长期配置。

建议改动：

1. 在 session state 增加 scoped overlay。
2. 提交 turn 时通过 runtime metadata 或 config snapshot 传递短 overlay。
3. runtime 添加 pivot marker，帮助模型从下一轮切换风格。
4. 清除 overlay 后回到 Global Soul。
5. 明确 overlay 不影响 artifact，除非进入 Generation Brief。

不做：

1. 不把 overlay 自动写入 `memory.profile`。
2. 不把 overlay 写进历史 memory。
3. 不允许 overlay 覆盖安全 / 工具约束。

验证：

```bash
npm exec vitest run "src/components/agent/chat"
cargo test --manifest-path "src-tauri/Cargo.toml" runtime_turn
```

## 11. 迁移与兼容

1. 现有 `memory.profile` 不迁移。
2. 现有用户资料不迁移。
3. 现有 project memory 的 character `personality` 保持 compat，不作为 Soul 主链。
4. OpenClaw / Hermes 用户通过导入 `SOUL.md` 迁移。
5. 导入后的内容由 Lime current 配置接管。
6. Expert Catalog / expert agent instance 保持专家系统主链，不迁移为 Soul。

## 12. 回滚策略

1. Phase 1 可通过关闭配置入口隐藏。
2. Phase 2 可通过 Soul enabled=false 停止 prompt 注入。
3. Phase 3 可禁用导入 / 导出入口，不影响已有配置。
4. Phase 4 可关闭创作声线进入 Generation Brief。
5. Phase 7 可清除 session overlay。
6. Expert 联动可关闭诊断和继承提示，不删除专家目录。

回滚不应删除用户已有配置，除非用户显式重置。

## 13. 质量门槛

涉及文案：

```text
zh-CN / zh-TW / en-US / ja-JP / ko-KR
```

涉及命令：

```bash
npm run test:contracts
```

涉及 GUI 主路径：

```bash
npm run verify:local
npm run verify:gui-smoke
```

涉及 Rust runtime：

```bash
cargo test --manifest-path "src-tauri/Cargo.toml"
```

## 14. 当前验证记录

截至 2026-06-03：

1. Phase 4 前端定向测试已通过：`npm exec vitest run "src/components/agent/chat/utils/artifactGenerationBriefMetadata.unit.test.ts" "src/components/agent/chat/workspace/workspaceSendHelpers.test.ts" "src/components/agent/chat/workspace/useWorkspaceInputbarSceneRuntime.test.tsx"`，当前结果为 3 files / 32 tests passed。
2. 既有 Phase 4 前端定向测试也曾通过：`npm exec vitest run "src/lib/soul/soulConfig.unit.test.ts" "src/hooks/useSoulArtifactVoiceGenerationBrief.test.tsx" "src/components/settings-v2/general/memory/index.test.tsx" "src/components/agent/chat/utils/artifactGenerationBriefMetadata.unit.test.ts" "src/components/agent/chat/workspace/workspaceSendHelpers.test.ts"`，上一轮结果为 5 files / 44 tests passed。
3. 测试覆盖：Soul config normalization、SOUL.md import / export、正式内容声线设置页保存 / 关闭、保存配置到 Generation Brief 的候选投影、发送时 saved fallback、本轮关闭不注入 artifact 但保留诊断、显式 `generation_brief` 覆盖保存声线且不继承保存 evidence、Generation Brief alias normalize、互斥 voice ID 清理、缺失 / 未知 `voice_source` 不保留孤儿 voice ID、Workspace 输入区本轮开关展示和切换。
4. `git diff --check` 已针对上一轮 Soul / Generation Brief / Expert 写集通过；本轮新增输入区开关和文档后需要重跑。
5. Rust `artifact_generation_brief_boundary_service` 已补互斥 voice ID 和未知 `voice_source` 清理测试；上一轮定向命令 `cargo test --manifest-path "src-tauri/Cargo.toml" artifact_generation_brief_boundary_service -- --test-threads=1` 因外部 Cargo / rustc 进程长期占用 `src-tauri/target` artifact lock，尚未闭合，本轮需要重试。
6. `npm run test:contracts` 已在上一轮通过；本轮新增发送 metadata 和输入区开关后需要重跑。`npm run verify:gui-smoke -- --reuse-running` 上一轮已通过 `workspace-ready`、`browser-runtime`、`site-adapters` 与 `agent-service-skill-entry` 的前端 Vitest 子集，但完整 smoke 卡在 Rust 子测试编译阶段，本轮未宣称 GUI smoke 完整通过。
