# Lime Soul 个性化验收标准

> 状态：current acceptance plan
> 更新时间：2026-07-06
> 目标：定义 Soul 个性化在普通用户体验、创作链路、SOUL.md 迁移和工程边界上的可验证验收标准。

## 1. 普通用户验收

### 1.1 能理解入口

场景：用户打开设置里的 `AI 个性 / 声线`。

必须满足：

1. 页面解释为 Lime 的交流方式、回答风格、解释深度或追问方式。
2. 不出现 `prompt composer`、`runtime_turn`、`memory_runtime` 等工程术语。
3. 用户能看到开启、关闭、保存、重置等明确动作。
4. 空态说明如何开始配置，而不是要求用户编辑 `SOUL.md` 文件。
5. 默认不影响正式创作内容。

失败示例：

- 页面要求用户手动创建 `~/.lime/SOUL.md`。
- 页面把 Soul 解释成新的记忆数据库。
- 页面默认说明“所有生成都会被此人格覆盖”。

### 1.2 能配置全局交互人格

必须满足：

1. 用户可以配置回答风格、解释方式、直接程度和避免事项。
2. 保存成功后下一轮普通聊天生效。
3. 关闭后下一轮普通聊天不再受影响。
4. 重置后回到 Lime 默认交互语气。
5. 配置为空时不注入 Soul section。

失败示例：

- 关闭后 runtime 仍包含 Soul marker。
- 重复保存导致 prompt 中出现多个 Soul section。
- 用户当前指令被全局 Soul 覆盖。

### 1.3 能预览效果

必须满足：

1. 用户能看到配置后的回复风格预览。
2. 预览明确只表示交互语气，不承诺正式内容声线。
3. 预览不会触发真实长期记忆写入。
4. 预览不会调用外部写操作。

## 2. SOUL.md 迁移验收

### 2.1 导入

场景：用户导入 OpenClaw / Hermes 风格的 `SOUL.md`。

必须满足：

1. 导入前展示解析预览。
2. 用户确认前不写入配置。
3. 空文件不覆盖现有配置。
4. 导入后不依赖原始文件路径。
5. 明显项目规则、路径、命令、端口等内容被提示迁移到项目规则或知识库。

失败示例：

- 选择文件后立即覆盖当前配置。
- 导入后运行时每轮继续读取原文件。
- 项目命令被当成全局人格注入。

### 2.2 导出

必须满足：

1. 导出内容来自 current Soul config。
2. 导出 Markdown 不包含运行时诊断、密钥、令牌或本机绝对路径。
3. 导出文件不会成为新的事实源。
4. 导出格式能被用户理解为 `SOUL.md` 迁移文本。

## 3. 普通聊天验收

### 3.1 注入边界

必须满足：

1. Global Soul 只通过统一 prompt composition 注入。
2. 注入 section 有稳定 marker。
3. `memory.profile` 和 Global Soul 不在不同路径重复拼接。
4. section 空时不渲染。
5. 已有 marker 时不重复追加。

### 3.2 优先级

必须满足：

1. 系统、安全、开发者约束优先于 Soul。
2. 用户当前明确指令优先于 Soul。
3. 工具调用、确认、错误处理不被 Soul 弱化。
4. Soul 不能要求泄露隐私、跳过确认或伪造能力。

失败示例：

- Soul 要求“别问确认”，导致外部发送动作跳过确认。
- Soul 要求“永远简短”，导致错误排查丢失必要信息。
- Soul 要求“像某人说话”，覆盖用户当前要求的正式风格。

### 3.3 Style Profile 全对话输出面

场景：用户在设置页选择 `cheeky_sassy_executor`、`warm_supportive_companion`、`cool_confident_operator` 或 `calm_professional_partner` 后，发送一条会触发工具调用的真实任务。

必须满足：

1. 四种首发风格作为 `Style Pack Registry` 里的四个 built-in seed 注册，pack id 分别为 `com.lime.soul.cheeky-sassy-executor`、`com.lime.soul.warm-supportive-companion`、`com.lime.soul.cool-confident-operator`、`com.lime.soul.calm-professional-partner`。
2. `memory_soul_prompt_context` 必须包含 profile id、pack id、voice primitives、surface contracts、anti-repetition rules、few-shot anchors 和 risk fallback。
3. 同一工具生命周期下，`before_tool`、`tool_running`、`after_tool_success` / `after_tool_partial_failure` / `after_tool_failure` / `body_detail` / `closing_suggestion` 都能体现正确等级；工具事实、数字、来源、错误原因保持一致。
4. 正文小标题、段落转折、风险提示和结尾建议必须跟随 profile；不能只有欢迎语或首句有变化。
5. 本地 UI 文案只渲染 neutral i18n key + facts + descriptor metadata；不得出现 `agentChat.soulInteraction.<tone>.*` 这类 profile 句库。
6. few-shot anchor 只能作为 prompt 风格锚点，不能被 UI renderer 或工具 summary 固定复读。
7. 高风险、权限、删除、生产 API、法律、医疗、财务等场景必须降级到 `calm_professional_partner`。
8. 旧共享 pack id `com.lime.builtin.default` 属于 `dead / forbidden-to-restore`；代码、fixture、prompt snapshot 和文档示例不得把它当作兼容 fallback。

失败示例：

- 只改欢迎语，工具前后承接和正文仍是默认助手口吻。
- 为四种风格各写一套本地 i18n 句子，导致每轮输出千篇一律。
- 工具卡片或 timeline 根据 profile id switch 出中文终稿。
- 贱兮兮风格在危险确认或失败恢复中继续卖萌。
- 以 `com.lime.builtin.default` 兼容旧风格包，导致四种风格又共享同一个 pack identity。

## 4. 正式创作验收

### 4.1 默认隔离

场景：用户生成文章、脚本、海报文案、PPT 或发布内容。

必须满足：

1. Product Soul 默认不进入正式 artifact。
2. Companion Soul 不进入正式 artifact。
3. 正式内容使用声线时必须经过 `Generation Brief`。
4. 声线使用状态可解释。
5. artifact request metadata 默认带 `generation_brief.voice_source=none`。
6. artifact prompt 中的 `【Generation Brief 声线边界】` 必须明确 `inherits_global_soul=false` 与 `inherits_expert_persona=false`。
7. 只携带 `generation_brief` 的 metadata 不得被归一化删除，也不得单独触发 Artifact Stage / Schema 交付合同。
8. 前端发送层的显式 voice metadata 必须收敛到 root `artifact.generation_brief`，不能写入 `harness.generation_brief`。
9. 保存的 `memory.soul.artifact_voice` 只能在用户显式开启配置、且本轮“创作声线”开关开启时进入正式产物声线。
10. 保存声线不得提前常驻 `workspaceRequestMetadataBase`；只能在发送瞬间、没有本轮显式 `generation_brief` 时作为 fallback 写入 `artifact.generation_brief`。
11. 本轮显式 `generation_brief` 必须覆盖已保存的 Soul 声线 fallback，且不得继承保存声线的 `evidence_source`、`creator_voice_id` 或 `brand_voice_id`。
12. 用户关闭本轮“创作声线”后，请求不得携带保存声线生成的 `artifact.generation_brief`，但必须保留 `diagnostics.soul_artifact_voice.status=disabled_for_turn` 解释拦截原因。

失败示例：

- 聊天助手的吐槽语气出现在正式公众号正文里。
- Companion 的口癖出现在客户交付文档里。
- 用户关闭创作声线后 artifact 仍带该风格。

### 4.2 Creator / Brand Voice

必须满足：

1. Creator / Brand Voice 有用户显式配置或 evidence。
2. `personality_boundary_guard` 能判断当前任务是否允许带入。
3. 进入 `Generation Brief` 的字段可回溯来源。
4. 用户能关闭本次声线影响。
5. `generationBrief` / `generation_brief` alias 必须归一为 snake_case，并保留 `evidence_pack_id` / `evidence_refs` 等可追踪字段。
6. `voice_source=creator_voice` 时不得保留 `brand_voice_id`；`voice_source=brand_voice` 时不得保留 `creator_voice_id`；`voice_source=none`、缺失或未知时两者都不得保留。
7. Workspace 输入区必须只在存在已保存正式内容声线时展示“创作声线”本轮开关，关闭只影响当前 turn，不回写长期配置。

失败示例：

- 从历史聊天随意推断品牌声线。
- 没有用户确认就把临时 overlay 写成长期品牌 voice。
- 禁用的偏好仍进入 Generation Brief。

## 5. Memory 边界验收

### 5.1 不重复事实源

必须满足：

1. 不新增 `soul_*` 长期 CRUD 主链。
2. 不新增 `SoulRuntime` 平行 runtime。
3. 不新增独立 prompt composer。
4. 不让 `SOUL.md` watcher 覆盖设置页配置。
5. 不绕过 `unified_memory_*` / `memory_runtime_*`。

失败示例：

- 设置页写 app config，runtime 又读 `SOUL.md`，两者冲突。
- Soul 单独保存一份长期偏好，Memory 又保存一份。
- 前端组件直接拼出人格 prompt 并塞进 request metadata。

### 5.2 与 memory.profile 分工

必须满足：

1. `memory.profile` 的学习偏好继续表示用户理解路径、擅长领域、解释偏好。
2. Global Soul 表示 Lime 的交互人格、语气、风格。
3. 两者可以同源配置投影，但 prompt section 语义必须分开。
4. 用户资料 `nickname / bio / tags` 不被误当成 Soul。

失败示例：

- 把“我是研究生”写进 Soul 作为助手人格。
- 把“要更直接”只写进 Memory，并在多个路径重复注入。
- 把用户简介拼成助手自我介绍。

## 6. 临时 overlay 验收

必须满足：

1. 临时 personality overlay 只影响当前 session 或当前任务。
2. 切换不清空历史。
3. 清除后回到 Global Soul。
4. 不经用户确认不写入长期配置。
5. overlay 不默认影响正式 artifact。

失败示例：

- 用户试用“严格评审”后，所有后续会话都变成严格评审。
- overlay 写入 memory 后无法撤销。
- overlay 绕过 Generation Brief 影响正式内容。

## 7. Expert Persona 联动验收

### 7.1 专家会话边界

必须满足：

1. Expert Persona 通过 expert runtime metadata 进入当前专家会话。
2. `personaRef / memoryTemplateRef / skillRefs / workflowRefs` 不写回 Global Soul。
3. Global Soul 可以影响专家回复的沟通节奏，但不能覆盖专家职责和技能边界。
4. 专家会话结束后，普通聊天仍回到 Global Soul。
5. 专家会话 metadata 必须标记 personality boundary，且不包含 `memory.soul` 或 `SOUL.md` 原文。
6. 专家信息面板必须向用户说明 Global Soul、Expert Persona 与正式产物的边界。

失败示例：

- 点击“营销策略专家”后，全局 Soul 被改成营销专家。
- 专家 `personaRef` 被导出成用户的 `SOUL.md`。
- 专家会话的临时口吻被自动沉淀成长期人格。

### 7.2 正式创作隔离

必须满足：

1. Expert Persona 不默认进入正式 artifact。
2. 专家输出如果要作为 Creator / Brand Voice，必须经用户确认。
3. 进入正式创作的专家声线必须通过 `Generation Brief`。
4. Companion Soul、Global Soul、Expert Persona 三者在诊断或测试中可区分。

失败示例：

- 专家会话里的角色口癖自动进入公众号正文。
- 专家目录被当作品牌声线库无条件注入。
- 关闭创作声线后，Expert Persona 仍影响 artifact。

## 8. 工程验收

### 8.1 命令边界

如果新增或修改 Tauri 命令，必须满足：

1. 前端经 `src/lib/api/*` 网关调用。
2. Rust `generate_handler!` 同步。
3. `agentCommandCatalog` 同步。
4. DevBridge mock / browser mock 同步。
5. `npm run test:contracts` 通过。

### 8.2 测试覆盖

至少覆盖：

1. Soul config normalization。
2. SOUL.md import parser。
3. SOUL.md export renderer。
4. prompt section marker 去重。
5. Soul disabled 不注入。
6. 普通聊天注入。
7. artifact 默认隔离。
8. Generation Brief 显式 voice 注入。
9. Expert Persona 与 Global Soul 分离。
10. 专家会话不反向改写 Soul config。
11. `harness.expert` 触发专家会话 runtime context，不回退成普通 fast chat。
12. Generation Brief 声线边界默认不继承 Global Soul / Expert Persona。
13. 显式 Creator / Brand Voice metadata 能保留 voice source、guard 和 evidence 字段。
14. 前端 `artifactGenerationBriefMetadata` 默认不注入 Creator / Brand Voice。
15. 工作区发送 metadata 能深合并 workspace base 与 sendOptions 的 `artifact` 字段，避免浅合并丢失 artifact contract 或 voice evidence。
16. 只带 `generation_brief` 的前端 metadata 不补 `artifact_mode` / `artifact_stage` / `artifact_kind`。
17. `memory.soul.artifact_voice` 的设置页保存、关闭和字段保留。
18. `useSoulArtifactVoiceGenerationBrief` 对保存配置的投影和 config change 刷新。
19. Generation Brief 前后端归一化都清理互斥的个人 / 品牌声线 ID。
20. 保存声线通过 `savedSoulArtifactVoiceGenerationBrief` 作为发送时 fallback，不通过 `workspaceRequestMetadataBase` 常驻注入。
21. 本轮关闭创作声线后不注入保存声线的 artifact metadata，但保留 `diagnostics.soul_artifact_voice`。
22. Workspace 输入区“创作声线”开关显示、关闭回调和五语言文案均有稳定回归。
23. Style Pack Registry 中四个 built-in seed 的 pack id 唯一；旧共享 `com.lime.builtin.default` 在 current 代码、fixture 和 prompt snapshot 中都按 `dead` 处理，不做兼容映射。
24. `memory_soul_prompt_context` prompt snapshot 覆盖 transcript surface contracts、anti-repetition、few-shot anchors 和 risk fallback；四种 built-in profile 的同一 surface anchors 不得坍缩成同一模板。
25. i18n 资源守卫禁止新增 `agentChat.soulInteraction.<tone>.*` profile 句库。
26. 工具 lifecycle / transcript golden 覆盖同一任务切换两种 profile 后，工具前说明、工具完成承接和最终正文有可见差异且事实一致。

### 8.3 GUI 验收

涉及设置页或聊天主路径时必须满足：

1. 用户可完成保存、关闭、重置。
2. 文案覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
3. 控件在桌面和窄视口不重叠。
4. 有已保存正式内容声线时，输入区能看到“创作声线”本轮开关；无保存声线时不显示额外控件。
5. GUI smoke 能证明主路径可用。

建议验证：

```bash
npm run verify:local
npm run verify:gui-smoke
```

### 8.4 文档验收

必须满足：

1. `internal/roadmap/soul/README.md` 明确链接 memory 个性化路线图。
2. `architecture.md` 明确 current / compat / deprecated / dead 分类。
3. `diagrams.md` 包含架构图、流程图和时序图。
4. `rollout-plan.md` 每个 phase 有目标、不做和验证。
5. `acceptance.md` 明确不和 Memory 重复的工程验收。
