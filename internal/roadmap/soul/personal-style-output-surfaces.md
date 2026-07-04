# Soul Style Profile 输出面与 i18n 治理

> 状态：current planning source
> 更新时间：2026-07-04
> 上游路线图：[personal-style-profiles.md](personal-style-profiles.md)
> 目标：持续维护所有会影响用户“个性化口吻感知”的输出面、工具生命周期、i18n 边界和验收矩阵，避免把细节清单塞回主路线图。

## 1. 适用范围

本文件只回答一个问题：**用户在哪里会感知到 Soul Style Profile 是否真的生效。**

它覆盖：

1. 模型正文、欢迎语、缺参数追问和结尾建议。
2. 工具调用前、调用中、调用后、工具折叠条和单个工具卡片。
3. 图片生成块、报告、表格、artifact、导出和 copy。
4. 输入框、slash command、mention、toast、modal、confirm、错误恢复。
5. i18n 五语言资源和不能人格化的高风险场景。

它不建立新的 PersonalStyle 系统。唯一事实源仍是 `memory.soul` / Soul `Style Profile` / Style Pack registry / `memory_soul_prompt_context` / Agent Runtime facts。

## 2. i18n 与文案事实源

Style Profile 不是一组硬编码中文口头禅。所有本地 UI 文案必须走 Lime current 五语言资源，模型生成文本才由 Soul prompt 影响。

```text
src/i18n/resources/{zh-CN,zh-TW,en-US,ja-JP,ko-KR}/settings.json
  settings.memory.soul.styleProfile.*        # 风格名称、描述、选择器、保存提示、aria/title

src/i18n/resources/{zh-CN,zh-TW,en-US,ja-JP,ko-KR}/agent.json
  agent.runtime.status.*                     # 等待态、停止/继续、运行中、失败恢复
  agent.runtime.toolLifecycle.*              # 工具前、中、后、折叠条、工具卡片 label
  agent.runtime.collaboration.*              # 协作执行、分头推进、失败/完成状态

src/i18n/resources/{zh-CN,zh-TW,en-US,ja-JP,ko-KR}/workspace.json
  workspace.input.*                          # 输入框 placeholder、mention、slash command、busy line
  workspace.artifact.*                       # artifact title、copy/export、正式产物框架文案
  workspace.imageGeneration.*                # 图片生成块标题、状态、参数摘要、caption

src/lib/soul/
  interactionCopy.ts                         # 只允许返回 i18n key + facts，不写固定中文终稿
  style-profiles/
    builtInProfiles.ts                       # 只存内置 style pack、profile id、tone、禁忌、i18n key
    stylePackManifest.ts                     # deferred：Cloud / local import manifest schema，不做下载器

lime-rs/crates/app-server/src/runtime/soul/
  locale_copy.rs                             # Rust/App Server 需要 presentation 文案时的 locale copy service
  prompt_context.rs                          # 模型生成正文的 Soul directive，不承载 UI 文案翻译
```

i18n 边界：

1. Profile registry 只存 `nameKey`、`descriptionKey`、`ariaKey` 等稳定 key，不存展示文案。
2. React / Workspace / Agent Chat 中的按钮、标题、空态、toast、confirm、prompt、placeholder、aria/title、错误提示、导出 Markdown、copy prompt、artifact title 必须覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
3. `SoulInteractionCopy`、runtime status、协作执行、工具卡片、本地图片生成状态等用户可见本地 copy，必须改为 i18n key 或 locale copy adapter，不能只中文硬编码。
4. Rust / App Server 输出 presentation 文案时，只能传稳定 enum + facts 给前端 i18n 渲染，或通过统一 locale copy service 生成；不能在业务逻辑里拼接中文句子。
5. 模型生成正文不走前端 i18n，由 `memory_soul_prompt_context` 影响；但模型外框架文案必须 i18n。
6. 工具名、provider 名、模型名、URL、文件名、task id、stable enum、trace id 不翻译；presentation 层只翻译 label、状态和说明。
7. 高风险确认、权限审批、生产 API、删除、支付、法律、医疗、财务等文案不做强人格化，只允许专业、清晰、可审计的 locale copy。
8. 未来 Cloud / local 风格包也必须提供五语言资源或稳定 i18n key 映射；缺失 locale 时不能回退到硬编码中文。

## 3. 个性化等级

口吻治理不能只看 assistant 最终回复。用户看到的是一条完整时间线：发送前 preview、等待态、工具调用前说明、工具调用中状态、工具完成折叠条、工具卡片、结果承接、正式正文、图片块、表格、结尾建议、输入框与错误恢复共同组成“人格感”。

| 等级 | 名称 | 规则 |
| --- | --- | --- |
| `L0` | 产品 i18n | UI label、按钮、placeholder、aria、toast 等只走五语言 i18n，不做明显人格化。 |
| `L1` | Soul 薄适配 | runtime status、工具进度、协作执行等短文案可读 Soul profile，但只做低强度风格。 |
| `L2` | Soul 正文 | assistant 聊天正文、工具前后自然语言承接、缺参数追问走 Interaction Soul。 |
| `L3` | Generation Brief | 正式 artifact、导出正文、报告正文默认不受 Product Soul，只受用户显式创作声线。 |
| `L4` | 专业强制 | 危险确认、权限、生产 API、删除、支付、法律、医疗、财务等强制专业口吻。 |

## 4. 用户可见 surface 矩阵

| Surface | 示例 | owner | 个性化等级 | i18n owner | 约束 |
| --- | --- | --- | --- | --- | --- |
| 会话欢迎语 / 首轮 assistant 自述 | “我在，今天先处理哪件事？” | `Agent Chat runtime prompt` + welcome renderer | `L2` | `agent.json` 负责框架文案 | 不能绕过 Soul；不能固定“我是专业友好助手”；用户设置贱兮兮或拽酷后第一屏就要能感知差异。 |
| 模型普通正文 | 回答、解释、建议、复盘 | `session_config.rs` + `runtime/soul/prompt_context.rs` | `L2` | 模型输出不前端翻译 | 由 Soul directive 影响；事实、引用、数字和结论必须来自上下文或工具。 |
| fast-response / direct answer | 轻量问答、无需工具 | `session_config.rs` light branch | `L2` | 模型输出不前端翻译 | 可跳过重型 memory 和 skills body，但不能跳过 Interaction Soul。 |
| 用户消息确认 / initial dispatch | 发送后短暂显示“准备处理” | `workspaceSendHelpers.ts` / `agentRuntimeStatus.ts` | `L0` | `workspace.json` | 这是系统状态，不伪装 assistant；不得写“我已经理解你了”这类模型口吻。 |
| Home pending preview | 从 Home 输入后进入 Workspace 前的 pending 文案 | `homePendingPreview.ts` | `L0` | `workspace.json` | 保持中性系统态，避免与正式 assistant 首句重复或冲突。 |
| 发送后等待态 / busy line | “正在生成回复...” | `AgentMessageList` / runtime status view | `L0-L1` | `agent.json` | 可以低强度随 profile 调整节奏，但不能出现事实承诺。 |
| 停止 / 继续 / 重新生成 | 按钮和短提示 | Workspace controls | `L0` | `agent.json` / `workspace.json` | 操作 label 必须稳定清晰，不跟随贱兮兮或拽酷口吻大幅变化。 |
| 工具调用前说明 | “我先去查资料，避免凭感觉编。” | model assistant text / tool planner narrative | `L2` | 模型输出不前端翻译 | 只说明要调用什么、为什么需要工具、预期拿什么证据；不能承诺结果。 |
| 工具调用中进度 | “正在搜索”“正在读取网页”“正在生成图片” | `runtime_status.rs` + tool event renderer | `L1` | `agent.runtime.toolLifecycle.*` | 只表达阶段、等待原因和可观察进度；不得编工具尚未返回的内容。 |
| 多工具折叠条 | “3 个工具调用完成” | tool group renderer | `L0-L1` | `agent.runtime.toolLifecycle.group.*` | 主要是 UI label，允许轻微风格化但不能为每个 profile 硬编码整套句子；数字、状态来自事件。 |
| 单个工具卡片标题 | “Web Search”“Image Generation | Nanobanana Pro” | tool card renderer | `L0` | `agent.runtime.toolLifecycle.card.*` | 工具名、provider、模型名不翻译；状态 label 翻译；不得把 provider 名改成人格化昵称。 |
| 单个工具卡片状态 | pending / running / success / failed | tool card renderer | `L0-L1` | `agent.json` | 状态必须可审计；失败态不能用玩笑掩盖原因。 |
| 工具卡片操作按钮 | 查看、展开、复制、重试 | tool card renderer | `L0` | `agent.json` | 操作词稳定，不随 profile 变成难懂俚语。 |
| 工具成功后的自然承接 | “好了，数据抓回来了。先看结论。” | model assistant text / result summarizer | `L2` | 模型输出不前端翻译 | 必须基于工具 result/read model；可以有口吻，但不能新增工具没有的事实。 |
| 工具部分失败承接 | “A 成了，B 没回来；我先基于 A 给你可用版本。” | model assistant text | `L2` 降级 | 模型输出不前端翻译 | 清楚区分已完成、未完成、影响和下一步；贱兮兮和拽酷风格都只能轻微缓和。 |
| 工具失败恢复 | “这次失败原因是权限不足，需要你授权后再试。” | runtime + model assistant text | `L4` 或 `L2` 降级 | `agent.json` + 模型输出 | 涉及权限、生产环境、危险操作时强制专业；不能甩锅。 |
| WebSearch / WebFetch 总结 | 来源数量、时间、证据摘要 | search result presenter + assistant text | `L2` | 模型输出不前端翻译 | 口吻可变，引用、日期、来源、排序必须事实保真。 |
| 图片生成块标题 | “Image Generation | Nanobanana Pro” | image generation block | `L0` | `workspace.imageGeneration.*` | 标题和 provider 是产品/工具事实，不套 Soul；只翻译 label。 |
| 图片生成中状态 | 排队、生成中、上传中、完成 | image generation status renderer | `L1` | `workspace.imageGeneration.*` | 可低强度随 profile 调整文案，但不描述未生成画面。 |
| 图片参数摘要 | 尺寸、风格、模型、prompt 摘要 | image generation block | `L0` | `workspace.imageGeneration.*` | 参数事实不可人格化改写；用户 prompt 可原样或安全摘要。 |
| 图片产物 caption | 产物下方一句总结 | `image_command/presentation.rs` + UI block | `L2` | 模型输出或 `workspace.imageGeneration.*` | 可以受 Soul；必须基于实际产物 metadata 和模型返回，不虚构图像元素。 |
| 图片再迭代建议 | “可以再调色、换构图、加留白。” | assistant text | `L2` | 模型输出不前端翻译 | 建议可以有个性，但要可执行，不刷固定口头禅。 |
| 表格 / 报告标题 | “竞品功能对比”“本周趋势摘要” | artifact/report renderer | `L3` 默认 | `workspace.artifact.*` | 正式报告标题默认走 Generation Brief；聊天中的导读句走 Soul。 |
| 表头 / 单元格 / 链接按钮 | 来源、日期、结论、打开链接 | artifact/table renderer | `L0` / `L3` | `workspace.artifact.*` | 表头和按钮稳定清晰；数据单元格不为口吻改写。 |
| 报告分段标题 | 结论、证据、风险、下一步 | model artifact generator | `L3` | 由生成语言决定 | 默认不套 Product Soul；用户显式要求“用某个风格写报告”才进入 Generation Brief。 |
| 聊天正文 bullet / 结论 / 下一步 | 对工具结果的解释和建议 | assistant text | `L2` | 模型输出不前端翻译 | 可体现 profile；结论和建议必须被事实或用户需求支撑。 |
| 结尾建议 / follow-up chips | “继续细化”“生成图片”“导出报告” | assistant text + suggestion renderer | `L1-L2` | `agent.json` / 模型输出 | 按钮 label 走 i18n；assistant 自然语言建议走 Soul；不得诱导无关消费。 |
| 缺参数追问 | 尺寸、平台、范围、账号、时间 | assistant text | `L2` | 模型输出不前端翻译 | 只追问真正阻塞的 1-3 个参数；语气可爱但问题必须清楚。 |
| 权限审批 / 危险确认 | 删除、覆盖、生产 API、支付 | confirm / permission gate | `L4` | `agent.json` / host locale copy | 强制专业，不卖萌；必须列影响范围、风险、确认方式。 |
| 法律 / 医疗 / 财务提示 | 高风险建议、免责声明、就医/咨询建议 | safety policy + assistant text | `L4` | 模型输出不前端翻译 | 不使用贱兮兮、拽酷或玩笑口吻；保持谨慎和可审计。 |
| Subagents / 协作执行形成 | “已分头推进 3 个子任务” | collaboration renderer | `L1` | `agent.runtime.collaboration.*` | 叫法统一为协作执行/分头推进，不把 Codex `/subagents` 命令误写成产品人格系统。 |
| Subagents / 协作执行失败 | 子任务失败、取消、超时 | collaboration renderer | `L1` 降级 | `agent.runtime.collaboration.*` | 失败原因和影响优先，低强度风格只用于缓和。 |
| Plugin host-managed generation 过程说明 | 插件正在生成 Markdown / 图片 / 文件 | plugin worker renderer | `L1-L2` | `agent.json` | 过程说明可受 Soul；插件产物正文仍走 Generation Brief。 |
| 输入框 placeholder | “输入消息或 @ 工具” | Workspace input | `L0` | `workspace.input.*` | 只做产品 i18n；不把 placeholder 写成角色台词，避免长期噪音。 |
| slash command / mention 建议 | `/image`、`@web`、工具说明 | command palette / mention menu | `L0` | `workspace.input.*` | 命令名称和工具能力说明稳定清晰，不跟随 profile 变化。 |
| Toast / snackbar | 保存成功、复制成功、网络失败 | shared UI feedback | `L0` 或 `L4` | shared / `agent.json` | 默认产品 i18n；失败和危险场景不人格化。 |
| Modal / confirm / prompt | 设置保存、覆盖确认、导入 SOUL.md | shared modal renderer | `L0` 或 `L4` | settings/shared resources | 操作风险越高越专业；不得让可爱口吻降低警觉。 |
| 历史会话 hydrate / 回放 | 旧消息重新展示 | transcript renderer | `L0` 包装 | `agent.json` | 历史事实按当时内容展示，不用当前 Soul 重写；只允许当前 UI label 包装状态。 |
| 导出 Markdown / copy prompt / artifact title | 导出文件、复制 prompt、产物标题 | export/copy pipeline | `L3` / `L0` | `workspace.artifact.*` | 正式输出不默认受 Product Soul；按钮和文件类型 label 走产品 i18n。 |
| 系统错误 / 崩溃恢复 | bridge 断开、App Server 不可用 | error boundary / runtime gateway | `L0-L4` | `agent.json` / shared error copy | 以可恢复动作和诊断信息为主；不使用调侃掩盖严重问题。 |

## 5. 工具生命周期口吻合同

工具调用前后是用户最容易感知“设置了风格但没变化”的位置。每个工具事件必须按阶段输出，且每个阶段只允许表达该阶段已经知道的事实。

| 阶段 | 可以说 | 禁止说 | 风格强度 |
| --- | --- | --- | --- |
| `before_tool` | 要调用什么工具、为什么需要、预期拿哪类证据、用户还需补什么参数。 | 承诺工具一定成功、提前给结论、编造来源或图片细节。 | `L2`，可明显体现 profile。 |
| `tool_queued` | 已进入队列、等待原因、可取消或继续。 | 把排队说成已经执行，或展示不存在的进度百分比。 | `L0-L1`。 |
| `tool_running` | 当前阶段、正在读取/搜索/生成/上传、已知 checkpoint。 | 描述尚未返回的数据、图片画面、搜索结果。 | `L1`。 |
| `tool_group_completed` | 完成数量、失败数量、可展开查看。 | 用人格化文案替代数量和状态。 | `L0-L1`。 |
| `single_tool_success` | 工具名、完成状态、关键 metadata。 | 私自总结未读取的结果。 | 卡片 `L0`，承接句 `L2`。 |
| `after_tool_success` | 基于 result/read model 的自然承接、结论入口、下一步。 | 新增来源、数字、图像元素或工具没有返回的事实。 | `L2`。 |
| `after_tool_partial_failure` | 哪些完成、哪些失败、对结论的影响、可执行补救。 | 把部分失败包装成全成功，或让用户自己猜影响。 | `L2` 降级。 |
| `after_tool_failure` | 失败原因、责任边界、下一步恢复动作。 | 甩锅、卖萌盖过错误、隐藏权限/网络/配额问题。 | 普通失败 `L2` 低强度；风险失败 `L4`。 |
| `after_artifact` | 聊天 caption、如何查看/导出/继续迭代。 | 用 Product Soul 改写正式 artifact 正文。 | caption `L2`；正文 `L3`。 |
| `after_image` | 基于产物事实的说明、可调参数建议。 | 描述不存在的图像细节，或把 provider 名人格化。 | 图片块 `L0-L1`；caption `L2`。 |

实现合同：

1. 每个工具事件进入 UI 前必须携带稳定 `phase`、`status`、`toolName`、`facts`、`riskLevel`，文案层不得反推状态。
2. `before_tool` 和 `after_tool_*` 可以由模型生成，并通过 Soul directive 体现 profile。
3. `tool_queued`、`tool_running`、`tool_group_completed`、工具卡片标题和按钮默认由 i18n 模板渲染；只允许低强度 profile 变体。
4. 多工具折叠条必须优先准确表达数量和状态，例如“3 个工具调用完成 / 2 个完成，1 个失败”；不能为了风格牺牲扫描效率。
5. 工具结果承接句必须引用 read model 或 tool result，不允许从 UI label、折叠条、工具名推断业务结论。
6. 同一 turn 内禁止固定口头禅复读。贱兮兮风格应体现为轻微吐槽、短句节奏和执行感；拽酷风格应体现为克制、锋利、少废话，不是每句都加同一后缀。
7. 高风险或危险操作一旦命中，工具前说明、确认弹窗、失败恢复和结尾建议全部降级到 `calm_professional_partner`。

## 6. i18n 策略

i18n 的目标不是把同一句中文翻译成五份，而是把“产品 UI 文案”和“模型生成口吻”分层，避免出现中文硬编码导致英文、日文、韩文界面里突然冒出固定中文人格。

| 文案来源 | 翻译方式 | 是否受 Soul | 说明 |
| --- | --- | --- | --- |
| Profile 名称 / 描述 / 设置项 | key-based i18n | 否 | `builtInProfiles.ts` 只保存 key。 |
| 设置保存 toast / aria / title | key-based i18n | 否 | 必须覆盖五语言。 |
| 输入框 placeholder / slash command / mention | key-based i18n | 否 | 保持产品一致性，不人格化。 |
| runtime status 短句 | key-based i18n + 低强度 variant | 可低强度 | variant 只影响节奏，不改变事实。 |
| 工具卡片标题 / 按钮 / 状态 | key-based i18n | 基本否 | provider、模型、URL、文件名原样展示。 |
| 工具前后 assistant narrative | 模型生成 | 是 | 由 `memory_soul_prompt_context` 控制，不走前端翻译。 |
| 图片生成块标题 / 参数摘要 | key-based i18n + facts | 否 | 参数事实稳定展示。 |
| 图片 caption / 迭代建议 | 模型生成或 locale copy + facts | 是 | 只基于产物事实。 |
| 正式 artifact 正文 | Generation Brief | 默认否 | 用户显式要求创作声线时才受 Generation Brief 控制。 |
| 危险确认 / 高风险提示 | key-based i18n 或专业模型输出 | 强制专业 | 不允许贱兮兮、拽酷、卖萌、调侃。 |
| 导出 / copy / artifact title | key-based i18n 或 Generation Brief | 默认否 | 产品操作 label 与正式内容分离。 |

落地规则：

1. 五语言 key completeness 是验收门槛；新增任何用户可见 key 必须同时补 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
2. 本地 copy helper 只返回 `{ key, values, toneVariant? }`，禁止返回已拼好的中文终稿。
3. Rust/App Server 如果必须直接生成 presentation copy，应通过 locale copy service；更推荐返回 stable enum + facts，由前端渲染。
4. 测试 fixture 不能用“固定中文欢迎语”当成功标准；应断言 Soul directive、profile id、i18n key 和安全降级是否正确。
5. 模型输出语言跟随用户会话语言；UI 框架语言跟随 app locale。两者不一致时，不能用 UI i18n 去重写模型正文。
6. Locale copy 不负责创造人格。真正的人格表达来自 Soul directive、允许动作、禁忌和工具生命周期合同。

## 7. 细分回归矩阵

| 场景 | 验收方式 | 必须证明 |
| --- | --- | --- |
| 四种风格同一普通对话 | `style-profiles` 纯函数测试 + prompt snapshot | 同一输入下 profile id、allowed moves、forbidden moves 不同，且都进入 prompt context。 |
| 四种风格同一工具生命周期 | runtime event fixture + UI snapshot | `before_tool / running / group_completed / after_success` 都能体现正确等级；工具事实不变。 |
| 贱兮兮风格防复读 | 20 turn golden transcript | 不出现固定口头禅刷屏；吐槽对象只限任务、工具或抽象情况，不攻击用户。 |
| 拽酷风格不过度装腔 | 20 turn golden transcript | 短句、克制、有推进感，但不命令用户、不轻蔑、不牺牲信息密度。 |
| 欢迎语 / 首轮 assistant | Electron Claw 真实会话 | 设置 `cheeky_sassy_executor` 或 `cool_confident_operator` 后，第一条 assistant 开场不能仍是旧“专业友好助手”。 |
| 发送前 preview | React unit / screenshot | preview 是中性系统态，不伪装 assistant 口吻。 |
| 工具调用前说明 | agent transcript assertion | 说明工具目的和证据需求，不提前承诺结论。 |
| 工具调用中状态 | event renderer unit | 只展示阶段和 checkpoint，不编未返回结果。 |
| 多工具完成折叠条 | Playwright screenshot | 数量、成功/失败状态清晰；风格不破坏扫描效率。 |
| 单工具卡片 | component test | 标题、provider、模型名、按钮 label 来自事实和 i18n，不被 Soul 改名。 |
| 工具成功承接句 | transcript fact-check | 承接句只使用 result/read model 中存在的事实。 |
| 工具部分失败 | fixture + transcript assertion | 明确已完成、失败、影响和补救；不包装成全成功。 |
| 图片生成块 | Playwright screenshot + metadata assertion | 标题、provider、参数摘要稳定；caption 可有 Soul，但不虚构图像元素。 |
| 表格 / 报告 | artifact snapshot | 表头、链接、数据不人格化；正式正文默认走 Generation Brief。 |
| 结尾建议 / follow-up chips | UI test | 按钮 label 走 i18n，assistant 自然语言建议可走 Soul。 |
| 输入框 / slash / mention | i18n completeness + screenshot | placeholder 和工具建议不人格化，五语言都有 key。 |
| toast / modal / confirm | i18n completeness + interaction test | 普通操作是产品 i18n；危险确认强制专业。 |
| 高风险场景降级 | prompt snapshot + transcript | 法律/医疗/财务/权限/删除/支付全部降级到 `calm_professional_partner`。 |
| 历史会话 hydrate | replay snapshot | 历史消息不被当前 Soul 改写，只更新 UI label。 |
| i18n 五语言完整性 | resource key test | 新增 key 在 `zh-CN / zh-TW / en-US / ja-JP / ko-KR` 全覆盖，无中文硬编码。 |
| Style Pack manifest | schema / unit test | `built_in` profile 正常解析；`cloud_download` / `local_import` 只作为 deferred source，不绕过 resolver / guard。 |
| Electron CDP Claw 真实测试 | `lime-playwright-e2e` CDP 复用会话 | 设置风格、发送真实任务、观察 `electron-ipc` 与 `agentSession/turn/start`，确认页面完整完成。 |
| Electron fixture Soul 回归 | `claw-chat-current-fixture --scenario soul-style` | 不依赖手工状态，验证 `memory.soul` 配置、GUI/read model 完成、current JSON-RPC trace；GUI evidence 不保存完整 system prompt。 |

## 8. Playwright / Claw 真实验收要求

仅靠 unit test 不能证明用户感知变化。每次改动 Soul prompt、runtime status、工具卡片、图片生成块或 Workspace 输入体验，都需要至少跑一个真实 Claw 路径：

1. 通过设置页切到 `cheeky_sassy_executor`，再切到 `cool_confident_operator` 做对比。
2. 在 Claw 发送一个会触发工具的真实任务，例如搜索资料、生成图片或读取网页。
3. 用 CDP 连接现有 Electron / Chrome 会话，避免重启丢失登录态和 App Server 连接。
4. 捕获页面截图和 runtime trace，至少包含 `electron-ipc`、`agentSession/turn/start`、工具事件和 assistant 最终回复。
5. 验证工具调用前、中、后都有合理文案，且最终回复不是旧默认口吻。
6. 切换到 `calm_professional_partner` 后跑高风险确认或失败恢复场景，确认不会继续卖萌。
7. 验证正式 artifact、表格、导出内容没有被 Product Soul 污染。
8. 若后续接入 Cloud / local 风格包，必须验证 manifest 校验失败时回退到 built-in，不展示半安装状态。

这些验收应沉淀到 `.codex/skills/lime-playwright-e2e` 或相关测试技能文档中，作为后续 GUI 变更的固定测试路径。

当前可重复的自动化入口：

```bash
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs \
  --scenario soul-style \
  --timeout-ms 180000 \
  --prefix soul-style-smoke
```

该入口只证明真实 Electron / Claw / App Server 主链与 Soul 配置生效；`memory_soul_prompt_context.v2` 的 system prompt 正文由 Rust prompt 单测证明。GUI evidence、support bundle 和 trace export 必须保持 summary-only，不允许把完整 system prompt、provider request/response、API key 或用户私密 prompt 落盘。

## 9. 维护规则

1. 新增任何用户可见输出面，先判断它属于 `L0-L4` 哪一级，再补到第 4 章矩阵。
2. 新增工具、插件、图片、artifact 或协作执行 surface 时，必须同时判断工具生命周期阶段和 i18n owner。
3. 如果某个文案既可能由模型生成、也可能由 UI 本地生成，必须拆成“模型 narrative”和“UI label”两行，不混成一个 owner。
4. 如果发现用户设置风格后“看起来没变化”，优先检查本文件是否漏了 surface，而不是先加口头禅。
5. 主路线图只保留架构、事实源和边界摘要；本文件负责持续增加细节清单。
