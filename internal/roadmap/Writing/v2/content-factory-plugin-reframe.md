# 内容工厂插件重新梳理

更新时间：2026-07-05
状态：Draft + ordinary Agent turn orchestration current-turn verified + Electron/CDP real desktop baseline verified + App Server current-turn host tool evidence verified + inline host command shortcode contract added

## 1. 结论

当前 Image #1 的问题不是文章卡本身错误，也不只是右侧面板错误，而是内容工厂插件的优势没有进入用户可感知的普通 Agent 主链：用户只看到占位框一闪而过、假完成或 JSON / 文件卡，感受不到 Agent 正在寒暄、思考、检索、写作、审稿和规划配图。

参考 Image #2，Writing v2 的目标应调整为：

- 聊天中间区展示可展开的执行卡片，例如“资料检索”“网络搜索”“文章生成”，用户可查看调用参数、执行结果和来源摘要。
- 文章正文仍按段落进入同一个文章产物框，完成后可打开右侧 Article Workspace。
- 右侧 Article Workspace 只承载文章、图片组、视频分镜和交付清单，不展示 workflow 流程轨。
- 完整 workflow run / step / tool / connector / hook 明细继续进入后台 `workflow-events.jsonl`，用于审计、排障和质量复盘。

也就是说，过程不能被简化到完全不可见；但可见过程必须是用户可理解的工具 / 资料卡，不是内部 workflow 面板。

2026-07-05 主线校正：

- `@写文章` 必须走普通 Agent 对话流程，不走右侧 worker fast path，也不能用 mock/fixture 抢跑生成。
- 内容工厂的作用是提供 `workflow_contract`、host tool / artifact / shortcode 合同和包内执行能力；首发回合由普通 Agent turn 编排并对用户自然说明。
- 聊天区应包含自然引导文字、可展开执行卡片、同一文章产物框和完成后的自然总结；文案不能写死成模板，也不能出现特定品牌称呼。
- 右侧 Article Workspace 不自动打开；只有点击文章产物或显式动作才打开。
- raw `workspace-patch.json`、内部 JSON、workflow step 列表只进入审计或 read model，不作为普通聊天消息展示。
- CDP 验收必须区分 baseline 和 product acceptance：baseline 证明真实 Electron turn/start 与文章产物可见；product acceptance 才证明右侧不自动打开、历史恢复、执行卡片顺序和 raw JSON 隐藏。

## 2. 产品结构

页面类型：复杂内容生产工作台，主对象是 `articleDraft`，当前阶段是“生成首版文章并等待审核”。

内容工厂插件应暴露五类能力：

| 能力 | 用户可见形态 | 后台事实源 |
| --- | --- | --- |
| 激活入口 | `@写文章` / `@写作` | `app.runtime.yaml#activationEntries` |
| 资料检索 | 聊天主链可展开执行卡片 | `articleDraft.source.hostToolRequests` + App Server tool events |
| 正文生成 | 同一文章产物框段落级增长 | `artifact.snapshot` streaming partial |
| 正文内联命令 | 文章正文中的 `[@配图 ...]` 占位，宿主转为图片任务并回填 | `hostCommandRequests` / `image_command_intent.image_task` / `.lime/tasks/image_generate/*.json` |
| 后续产物 | 右侧 Article Workspace tabs / objects | `content_factory.workspace_patch` |
| 审计复盘 | 普通 UI 默认不展示 | `workflow-events.jsonl` metadata-only audit |

## 3. 主流程

1. 用户输入 `@写文章 ...`。
2. Lime 命中内容工厂插件 activation entry，把 `workflow_contract` 写入本轮 metadata。
3. 本轮进入普通 `agentSession/turn/start`，Agent 先输出自然引导、说明将按内容工厂流程编排，不直接宣布完成。
4. App Server 为本轮创建后台 workflow audit context；workflow run / step / connector 只写 `workflow-events.jsonl`。
5. 内容工厂合同在 `articleDraft.source.hostToolRequests[]` 暴露资料检索请求，宿主把它转成聊天主链里的工具卡。
6. 宿主执行 `WebSearch`，工具卡展示参数、结果摘要和来源；完整结果回填 `hostSearchEvidence`，并追加 `workflow.connector.completed` 到 JSONL。
7. Agent / 宿主按内容工厂合同生成正文，产物以同一 `content_factory.workspace_patch` 的段落级 `artifact.snapshot` 增长。
8. 正文中的 `[@配图 ...]` shortcode 由宿主解析为 `hostCommandRequests[]`，首批只自动执行 `@配图`，并复用 `image_command_intent` 生成 document-inline 图片任务。
9. final snapshot 在 `turn.completed` 前封口；聊天区显示文章完成状态和自然总结，右侧 Article Workspace 等待用户点击打开。

## 4. 插件包合同

外部 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 必须守住以下合同：

- `plugin.json` 说明中明确“中间执行卡 + 右侧编辑器 + 后台审计”的产品结构。
- `app.runtime.yaml#agentRuntime.conversationTimeline` 声明执行卡片来源是 `hostToolRequests`。
- `articleDraft.source.hostToolRequests[]` 是当前事实源，旧 `searchRequests[]` 只作为兼容输入保留。
- `articleDraft.source.hostCommandRequests[]` 是更通用的宿主命令合同；当前 `hostToolRequests[]` 是其中 WebSearch 子集，首批正文 shortcode 只把 `[@配图 ...]` 自动执行为 `image_generate` document-inline 请求。
- streaming partial 不能为了精简正文而剥掉 `hostToolRequests`，否则宿主无法把插件能力投影为中间执行卡。
- shortcode 只能作为结构化命令占位输出，不能要求宿主用裸正则替换 Markdown；宿主会跳过代码块、inline code、链接和图片 alt，并为每篇文章最多自动处理 `3` 个 `@配图`。
- `workflow.connector.requested` / `workflow.connector.completed` 仍是 audit-only，不能直接作为普通 UI 的流程轨。
- `content.article.generate` / `content.factory.generate` 缺少宿主托管正文时必须 fail closed，不用模板正文伪造成功。
- `plugin_activation` 不能直接触发右侧 pane/action worker；右侧 worker 只响应显式 pane action。
- `workflow_contract` 由 manifest / workflow 派生，不能把参考图文案或固定文章模板硬编码到宿主。

## 5. 禁止项

- 不把 workflow run / step 列表塞回右侧 Article Workspace。
- 不在普通用户主界面显示 `Agent`、`Runtime`、`Artifact`、`manifest` 等工程词。
- 不让插件 worker 直接输出 `tool.started` / `tool.result` 绕过宿主工具生命周期。
- 不让插件 worker 直接创建图片任务、写 `.lime/tasks/image_generate/*.json` 或绕过 `@配图` current 主链。
- 不把最终正文拆成多张文章卡；必须更新同一个 article artifact。

## 6. 验收标准

- 外部插件包测试能证明 `articleDraft.source.hostToolRequests[]` 存在，且带 `presentation.surface=conversation_timeline`。
- 流式 partial 中仍保留 `hostToolRequests[]`。
- Lime 宿主 read model 能把 workspace patch host tool events 投影为 `web_search` / `tool_use` timeline item，并显示在文章产物卡之前。
- 正文中的 `[@配图 ...]` 会物化为稳定 slot marker，通过 `image_command_intent.image_task` 生成 document-inline 图片任务，并在 running / completed 状态回填 pending 占位或真实图片。
- Article Workspace 仍只恢复文章和后续产物，不恢复 workflow 流程轨。
- `workflow-events.jsonl` 继续输出 metadata-only 审计摘要，不暴露 raw prompt / provider config / 正文结果。
- App Server current-turn smoke 必须证明普通 Agent turn 里有 `message.delta`、host tool timeline、段落级 `artifact.snapshot` 和最终 read model；不能只证明 worker 包本地运行。

## 7. 已验证证据

2026-07-03 已补强 `npm run smoke:content-factory-current-turn:host-generation`：同一 current turn smoke 现在同时断言 streaming / final `artifact.snapshot` 都保留 `3` 条 `hostToolRequests`，普通事件流和 session JSONL 都出现 `3` 组 `tool.started -> tool.args -> tool.result`，事件 `source=workspace_patch_host_tool_requests`，`agentSession/read.detail.items` 与 `thread_read.tool_calls` 都投影出 `3` 个 completed `web_search` 工具项，`evidence/export` 也能从 artifact snapshot 证明 `hostToolEvidence` 已回填。

本次证据文件：

- `.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-host-generation-2026-07-03T12-31-25-916Z.json`
- `.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-host-generation-2026-07-03T12-31-25-916Z.workflow-events.jsonl`
- `.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-cloud-release-host-generation-2026-07-03T12-32-45-939Z.json`
- `.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-cloud-release-host-generation-2026-07-03T12-32-45-939Z.workflow-events.jsonl`

## 8. 最新验证与下一刀

App Server current 普通 turn 已修到：`plugin_activation -> 普通 Agent turn -> 内容工厂 artifact/materialization -> JSONL audit -> turn.completed`。下一步不再继续证明 worker fixture，而是把 Electron/CDP Gate B baseline 升级为 product acceptance，真实走 `@写文章` 并验证自然引导、执行卡片、文章产物、右侧不自动打开和历史恢复。

2026-07-05 更新：当前实现方向已经落到 RuntimeCore terminal 顺序修复，而不是新增一个内容工厂专用 UI 分支。普通 Agent backend 发出的 `turn.completed` 会被暂存，内容工厂 activation 后处理在 terminal 前补齐 article artifact、host tool timeline 和 JSONL audit；完成后再封口。验收仍以真实 current-turn smoke / Electron CDP 为准，不能把测试 fixture worker 或静态 mock 当成用户链路完成证据。

2026-07-05 后端验证已通过：`content-factory-current-turn-debug-host-generation-2026-07-05T04-19-07-937Z.json` 显示普通 current turn 中有 `message.delta`、`7` 个 `artifact.snapshot`、`3` 组 `tool.started -> tool.args -> tool.result`，`workflow-events.jsonl` 有 `16` 条 metadata-only audit 事件，最终 `turn.completed` 位于 artifact / tool 事件之后。下一刀是把 Electron/CDP baseline 升级为 product acceptance，验证真实桌面 GUI 的聊天排版、右侧不自动打开、历史恢复和 raw JSON / 文件卡隐藏。

2026-07-05 Electron/CDP baseline 已有真实桌面证据：`.lime/qc/gui-evidence/writing/writing-cdp-WRITING_CDP_1783188149738-summary.json` 显示 `usedElectronCdp=true`、`usedRealElectron=true`、`turnStartViaElectronIpc=true`、`writingActivationMetadataPresent=true`、`articleArtifactFrameVisible=true`、`articleArtifactHasBody=true`、`processOrGuidanceCaptured=true`、`noInvokeErrors=true`；同名 `turn-start-trace.json` 记录 `app_server_handle_json_lines`、`electron-ipc`、`content_article_workflow` 和真实 session / turn id。该证据不能替代最终验收，因为脚本主动打开了 Article Editor，且没有覆盖历史恢复和 raw JSON / 文件卡负向断言。
