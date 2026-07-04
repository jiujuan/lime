# Lime Soul 个性化路线图

> 状态：current planning source
> 更新时间：2026-07-04
> 目标：把 OpenClaw / Hermes 的 `SOUL.md` 个性化经验转译成 Lime 的全局人格 / 声线能力，同时继续收敛到 Memory 个性化主链，不新增平行事实源。

## 1. 本路线图回答什么

本目录统一回答下面几类问题：

1. Lime 是否应该引入类似 `SOUL.md` 的个性化能力。
2. Soul 与 `memory`、`profile`、`Generation Brief`、Companion 的边界如何划分。
3. 为什么 Lime 采用“全局 AI 个性 / 声线设置”作为主入口，而不是默认读取裸 `SOUL.md` 文件。
4. OpenClaw 的 workspace `SOUL.md` 与 Hermes 的全局 `SOUL.md` 哪些可借鉴，哪些不能照搬。
5. 后续实现如何继续走 `memory_profile_prompt_service`、`runtime_turn` 和 `Generation Brief`，不新增第二套 prompt composer。
6. `SOUL.md` 如何作为高级导入 / 导出和可移植编辑格式服务用户，而不是成为运行时事实源。
7. Expert Plaza / 专家系统应如何与 Soul 联动，而不是把专家人格合并为全局人格。
8. 如何把 Ribbi 式固定口吻收敛为 Soul 下的可切换 Style Profile，而不是新增 PersonalStyle 平行系统。

## 2. 参考事实源

Lime current 主链：

1. [../memory/README.md](../memory/README.md)
2. [../memory/make-next-generation-more-like-me.md](../memory/make-next-generation-more-like-me.md)
3. [../memory/architecture.md](../memory/architecture.md)
4. [../../aiprompts/governance.md](../../aiprompts/governance.md)
5. [../../aiprompts/commands.md](../../aiprompts/commands.md)

OpenClaw 本地调研：

1. `/Users/coso/Documents/dev/js/openclaw/docs/concepts/soul.md`
2. `/Users/coso/Documents/dev/js/openclaw/docs/reference/templates/SOUL.md`
3. `/Users/coso/Documents/dev/js/openclaw/src/agents/workspace.ts`
4. `/Users/coso/Documents/dev/js/openclaw/src/agents/system-prompt.ts`

Hermes 本地调研：

1. `/Users/coso/Documents/dev/python/hermes-agent/website/docs/guides/use-soul-with-hermes.md`
2. `/Users/coso/Documents/dev/python/hermes-agent/hermes_cli/default_soul.py`
3. `/Users/coso/Documents/dev/python/hermes-agent/cli.py`
4. `/Users/coso/Documents/dev/python/hermes-agent/tui_gateway/server.py`
5. `/Users/coso/Documents/dev/python/hermes-agent/cron/scheduler.py`

## 3. 固定结论

### 3.1 Soul 是 Memory 个性化路线的子路线

固定判断：

**Soul 不是 Memory 的平行系统，而是 `Personality Layer` 的产品化子路线。**

这意味着：

1. 不新增 `soul_*` 数据库主链。
2. 不新增独立 `Soul Runtime`。
3. 不新增第二套 prompt composer。
4. 不让裸 `SOUL.md` 文件成为运行时事实源。
5. Soul 的长期证据继续来自用户显式配置、`memory.profile` 和 `unified_memory_*`。
6. Soul 的运行时注入继续收敛到 `memory_profile_prompt_service`、`runtime_turn` 和后续 `Generation Brief Compiler`。

### 3.2 职责边界

| 层                    | 回答的问题                                       | 是否属于 Memory 事实源                             |
| --------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Memory                | 用户长期偏好、灵感、历史证据、禁忌是什么         | 是                                                 |
| Soul                  | Lime 默认怎么和用户说话、以什么人格互动          | 使用 Memory 主链，不另建事实源                     |
| Expert Persona        | 某个专家在当前会话里以什么角色、技能、工作流执行 | 不属于 Global Soul；通过专家 runtime metadata 生效 |
| Creator / Brand Voice | 正式内容应该像谁在说话                           | 通过 `Generation Brief` 生效                       |
| Product Personality   | Lime 产品默认交互语气                            | 只影响交互，不默认进入 artifact                    |
| Companion Soul        | 伙伴怎么陪伴、吐槽、回应点名                     | 只影响 companion 气泡                              |

一句话：

**Memory 是证据和偏好底座；Soul 是全局交互人格投影；Expert 是局部任务角色 / 能力包；正式创作声线必须经过 `Generation Brief`。**

### 3.3 默认全局，但不是全局文件

固定判断：

**Lime 应该提供全局 AI 个性 / 声线设置，但不应把 `~/.lime/SOUL.md` 作为运行时事实源。**

原因：

1. Lime 是 GUI 桌面产品，普通用户不应被要求理解文件路径心智。
2. Lime 已有 `user_profile`、`memory.profile`、`unified_memory_*` 和 runtime prompt composition 主链。
3. 裸文件事实源会与设置页和记忆系统分叉。
4. 全局人格确实符合“Lime 越来越像我”的产品目标，但应落在 Lime current 配置与记忆事实源里。

### 3.4 `SOUL.md` 只做高级导入 / 导出

固定判断：

**`SOUL.md` 在 Lime 中是高级可移植编辑格式，不是默认运行时协议。**

允许：

1. 从 OpenClaw / Hermes 风格的 `SOUL.md` 导入到 Lime 全局人格设置。
2. 从 Lime 全局人格设置导出 `SOUL.md`，方便用户编辑、迁移或备份。
3. 在开发者 / 高级入口展示 Markdown 预览。

不允许：

1. 每轮运行时直接扫描项目根 `SOUL.md`。
2. 默认读取用户数据目录里的裸 `SOUL.md` 并覆盖设置页。
3. 让 `SOUL.md` 绕过注入顺序、用户开关、Generation Brief 或审计边界。

### 3.5 正式创作默认不受 Product Soul 污染

固定判断：

**全局 Soul 默认影响聊天交互；正式创作 artifact 只有通过 `Generation Brief` 才能吸收 Creator / Brand Voice。**

这意味着：

1. 普通聊天、欢迎语、解释风格、追问方式可以默认受 Global Soul 影响。
2. 文章、脚本、海报文案、PPT、发布内容等正式产物默认不直接注入 Product Personality。
3. 当用户明确启用创作声线时，Creator / Brand Voice 进入 `Generation Brief` 并可解释、可关闭。
4. Companion Soul 不得偷渡进正式内容。

### 3.6 Expert Plaza 要联动，但不能合并

固定判断：

**Expert Plaza / 专家系统应与 Soul 联动，但不能合并成同一份人格数据。**

原因：

1. Expert 已经拥有 `personaRef`、`memoryTemplateRef`、`skillRefs`、`workflowRefs`，本质是局部任务角色 / 能力包。
2. Global Soul 回答“Lime 默认怎么和我说话”，Expert 回答“本轮由哪个专业角色处理任务”。
3. 专家人格不应反向改写全局 Soul，否则一次专家会话会污染所有后续普通聊天。
4. 正式创作仍要通过 `Generation Brief` 决定是否吸收 Creator / Brand Voice，不能让 Expert 或 Soul 默认进入 artifact。

允许的联动：

1. 专家会话默认可继承 Global Soul 的交互节奏，但专家 `personaRef` 优先定义专业角色。
2. Expert runtime metadata 可声明 `memoryTemplateRef / skillRefs / workflowRefs`，由 runtime turn 消费。
3. 专家结果如果要沉淀为个人 / 品牌声线，必须经过用户确认并进入 Memory / Knowledge evidence。

不允许的联动：

1. 专家目录不作为 Global Soul 的事实源。
2. 专家启动不把完整 persona prompt 写进 Soul config。
3. Expert Persona 不绕过 `personality_boundary_guard` 进入正式创作。

### 3.7 Style Profile 是 Soul 的子能力

固定判断：

**交互口吻预设属于 Soul，不新增独立 PersonalStyle 系统。**

这意味着：

1. `Style Profile` 回答“同一份可靠事实应该用什么语气说出来”。
2. 首版规划四种可切换风格：贱兮兮执行官、温柔陪伴型助理、拽酷行动派、冷静专业型搭档。
3. Style Profile 只影响聊天交互、工具叙事、缺参数追问和失败解释，不作为事实源。
4. 工具结果、搜索来源、图片结果、任务状态继续以 Agent Runtime / App Server read model 为事实源。
5. 正式 artifact 默认不吸收 Product Soul；需要正式内容声线时仍走 `Generation Brief`。
6. 高风险、权限、删除、生产 API、医疗、法律、财务等场景必须降级到冷静专业口吻。
7. LoRA / QLoRA 小模型不是首版依赖；只有 Prompt / 模板 / guard 方案评测不稳定时再进入对照评估。
8. 风格包是 Style Profile 的分发形态，不与 Agent Skills 合成同一种 runtime package；未来可以共享 Cloud catalog / 下载 / 签名基础设施，但必须按 package `kind` 分流到不同目录、validator 和 runtime owner。

事实源声明：

**后续交互口吻能力只允许向 Soul `Style Profile` + Memory/Soul prompt composition + Agent Runtime facts 收敛；不得新增 PersonalStyle 平行系统。**

## 4. OpenClaw / Hermes 借鉴结论

### 4.1 OpenClaw 值得借鉴的点

1. `SOUL.md` 与 `AGENTS.md` 分工明确：前者管人格语气，后者管项目规则。
2. `SOUL.md` 与 `MEMORY.md` 在 prompt 中有不同说明：前者 persona / tone，后者 durable preferences。
3. workspace 模板让工程用户可以版本化自己的 Agent 风格。

Lime 不照搬的点：

1. 不默认使用 workspace 文件作为普通用户主入口。
2. 不把多个 Markdown context file 都直接暴露给普通用户。
3. 不让项目根文件自动改变正式创作产物。

### 4.2 Hermes 值得借鉴的点

1. `SOUL.md` 是 primary identity，回答“谁在说话”。
2. `/personality` 是临时 overlay，不等同长期记忆。
3. Cron 中可以加载 Soul 但跳过 Memory，说明身份人格和记忆可分离。

Lime 不照搬的点：

1. 不把 `~/.hermes/SOUL.md` 式文件路径作为默认用户心智。
2. 不让 Soul 完全替代内置身份与产品边界。
3. 不让临时 personality overlay 写入长期偏好，除非用户确认沉淀。

## 5. 目录文档分工

1. [prd.md](./prd.md)
   - 产品背景、用户、目标、范围、需求、非目标和阶段能力。
2. [architecture.md](./architecture.md)
   - Soul 与 Memory 的事实源、prompt 注入、current / compat / deprecated / dead 分类。
3. [diagrams.md](./diagrams.md)
   - 架构图、流程图、时序图和注入边界图。
4. [rollout-plan.md](./rollout-plan.md)
   - 分阶段实施计划、风险、回滚和验证入口。
5. [acceptance.md](./acceptance.md)
   - 普通用户、进阶用户、创作链路和工程边界验收。
6. [personal-style-profiles.md](./personal-style-profiles.md)
   - Soul 下的四种可切换交互口吻、Style Profile 抽象、架构图、时序图、流程图和评测标准。
7. [personal-style-output-surfaces.md](./personal-style-output-surfaces.md)
   - 用户可见输出面、工具生命周期、i18n owner、图片生成块、输入框、Claw 验收矩阵。
8. [personal-style-pack-installation.md](./personal-style-pack-installation.md)
   - 风格包安装、目录、manifest、安全校验、状态机、Cloud 下载和 Agent Skills 分流边界。

## 6. 分阶段总览

| 阶段    | 目标                          | 主产物                                 |
| ------- | ----------------------------- | -------------------------------------- |
| Phase 0 | 固定口径与文档                | 本目录路线图                           |
| Phase 1 | 全局人格设置                  | 设置页配置 + current config            |
| Phase 2 | 聊天交互注入                  | prompt composition section             |
| Phase 2.5 | 可切换 Style Profiles        | 四种内置交互口吻 + Style Resolver      |
| Phase 2.6 | Style Pack 安装规范          | built-in pack + deferred Cloud 分发边界 |
| Phase 3 | SOUL.md 导入 / 导出           | 高级可移植编辑入口                     |
| Phase 4 | 创作声线进入 Generation Brief | Creator / Brand Voice guard            |
| Phase 5 | Expert Persona 联动收口       | expert runtime metadata boundary       |
| Phase 6 | 品牌 / 项目声线包             | Knowledge / Memory evidence projection |
| Phase 7 | 临时 personality overlay      | session-scoped style pivot             |

## 7. 当前落地状态

截至 2026-07-04，本路线图已进入分阶段实现：

1. Phase 0 已落地：本目录固定了 Soul、Memory、Expert Persona、Generation Brief 和 `SOUL.md` 的边界。
2. Phase 1 已落地：设置页提供 `AI 个性 / 声线` 配置，配置保存到 current app config 的 `memory.soul`，不新增数据库表或 Tauri 命令。
3. Phase 2 已落地：`memory_profile_prompt_service` 统一注入 `【全局交互人格】` section，并保持 marker 去重和关闭状态不注入。
4. Phase 3 已落地：`SOUL.md` 作为高级可移植编辑格式进入设置页，导入前预览，导入后不依赖原始文件。
5. Phase 4 已接入 current 主链：设置页提供显式 `正式内容声线` 开关，配置保存到 `memory.soul.artifact_voice`；`useSoulArtifactVoiceGenerationBrief` 将已保存声线投影为发送候选，Workspace 输入区提供“创作声线”本轮开关；前端发送层只在本轮开关开启、且没有显式 `generation_brief` 时把保存声线 fallback 归一化到 root `artifact.generation_brief`，并通过 `diagnostics.soul_artifact_voice` 解释来源、开关和 guard 结果；`voice_source` 切换时会清理互斥的 `creator_voice_id` / `brand_voice_id`；后端 Artifact request metadata 归一化会为正式产物补 `generation_brief` 声线边界，默认 `voice_source=none`，并通过 Artifact prompt section 明确正式产物不默认吸收 Global Soul / Expert Persona；显式 `generation_brief` 可独立保留并覆盖保存声线，但不会单独触发 Artifact 交付合同。
6. Phase 5 已部分落地：`expertRuntimeBinding` 标记 Expert Persona 与 Global Soul 的作用域边界，`runtime_turn` 将 `harness.expert` 识别为专家会话上下文；专家人格不写回 Global Soul。
7. Phase 2.5 当前规划已更新为四种内置交互口吻和 built-in Style Pack；代码实现仍需同步到 registry、i18n、Runtime prompt context、设置页和 Claw 主链。
8. Phase 2.6 已新增规划文档：`personal-style-pack-installation.md` 固定风格包安装目录、manifest、状态机、Cloud 下载 deferred 边界，以及与 Agent Skills 包共享分发但 runtime 分离的规则。

尚未完成：

1. Phase 4：自动 voice evidence 投影、诊断详情 UI 和完整 GUI / E2E 证据。
2. Phase 2.5：四种风格代码实现和真实 Claw 风格自然度仍需持续评测，重点是防固定口头禅、工具进度自然化、失败恢复不卖萌，以及拽酷风格不过度装腔。
3. Phase 6：品牌 / 项目声线包的 Knowledge / Memory evidence projection。
4. Phase 7：session-scoped personality overlay。

## 8. 当前必须避免的误区

1. 把 Soul 做成 Memory 旁边的第二套长期系统。
2. 把 `SOUL.md` 文件当作 Lime 运行时事实源。
3. 把用户个人资料、长期偏好、品牌声线、产品人格和 companion 人格混成一个大 prompt。
4. 默认让全局产品人格影响正式创作内容。
5. 为了照搬 OpenClaw / Hermes，牺牲 Lime 的 GUI 产品心智。
6. 在设置页、记忆页、runtime turn 各自拼装人格 prompt。
7. 无 evidence 地把历史聊天语气自动沉淀成长期声线。
8. 把专家系统的 `personaRef` 当成全局 Soul，导致一次专家会话污染所有普通聊天。
9. 把可切换口吻或风格包做成 `personalstyle` 平行路线图、独立 Runtime 或 UI 硬编码模板。
10. 把风格稳定误解成固定口头禅复读；人格应来自行为规则、节奏和具体表达，不是每句前缀。

## 9. 这一步如何服务主线

这套路线图的主线收益是：

**把 `memory` 路线图中已经定义的 `Personality Layer` 产品化为可配置、可解释、可导入导出的全局 Soul 能力，同时继续维持 `unified_memory_*` / `memory_runtime_*` / `Generation Brief` 的单事实源边界。**
