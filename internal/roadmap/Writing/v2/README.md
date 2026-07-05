# Writing v2 路线图

更新时间：2026-07-05
状态：Active + ordinary Agent turn orchestration current-turn verified；Electron/CDP real desktop baseline verified；host audit boundary partial + workflow evidence export summary verified + host-managed generation current-turn fixture verified + workspace patch host tool evidence verified + inline host command shortcode first pass + external package smoke verified + App Server current local_folder turn verified + cancel audit verified；Electron/CDP product acceptance / live Provider product flow 未闭环
主线：把 `@写文章` 收敛为“内容工厂 workflow contract 编排 + 普通 Agent 对话流 + 段落级 article artifact + 后台 JSONL 审计”，禁止用 worker / fixture / mock 绕过普通对话主链

## 1. 设计结论

Writing v1 已经完成内容工厂插件包、`@写文章` 激活、`ArtifactFrame` 和右侧 Article Editor 的基础 UI 闭环。当前外部 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 已有真实包形态的 worker，并能消费 host-managed generation 结果输出段落级 artifact partial；同时已通过 App Server current `agentSession/turn/start` 的 local_folder installed state smoke、本地 OpenAI-compatible fixture 下的 current-turn host-managed generation completed smoke，以及真实 Electron/CDP 桌面基线验证。尚未完成的是 Electron/CDP 产品验收、远程 / GUI production 安装运行闭环和 live Provider 证据，现有仓库内 fixture 仍只能作为 test-only evidence，不能当成 production current。

当前结构性问题已经进一步明确：不是只缺远程安装，也不是只缺右侧样式，而是 `@写文章` 曾被误收敛到 worker / fixture 直接完成路径，绕过了普通 Agent turn 的寒暄、思考、引导、工具过程和真实完成态。Writing v2 的产品需求、Worker 接口、前端 UI、外部包 worker 证据和 App Server current local_folder turn 证据仍然有效，但这些证据只能证明内容工厂包与产物合同可用，不能替代真实 `agentSession/turn/start` 普通对话主链。用户可见主链不能被简化成只有最终文章卡，也不能把内部 JSON / workspace patch 文件卡展示出来；必须把资料检索 / 网络搜索这类能力投影为可展开执行卡片，把文章正文投影为同一个文章产物。

Writing v2 的核心结论是：

- `@写文章` 不是普通 agent 自由闲聊，也不是 worker 自行接管回合；它必须进入普通 Agent turn，由内容工厂 `workflow_contract` 约束本轮编排。
- 用户面不展示 workflow 步骤列表；聊天区展示可展开执行卡片和文章产物框，右侧只展示 Article Editor 和文章相关编辑能力。
- workflow run / step / tool / connector / hook / evidence 作为后台审计事实追加到 JSONL，不进入右侧流程轨；普通用户只看到被宿主投影成工具卡 / 执行卡的必要摘要。
- 内容工厂插件包 / worker 仍是 workflow、artifact、host tool、shortcode 合同来源；但 `@写文章` 首发不能由 worker 绕过普通 Agent turn。App Server 负责把普通 Agent turn 中产生或后处理得到的 `content_factory.workspace_patch` 按段落级 `artifact.snapshot` 投影、持久化和封口，不承接内容工厂写作模板，也不再拿最终正文二次切片。
- 后续排障、运营复盘和质量审计读取 append-only `workflow-events.jsonl`；产品 UI 默认不消费该日志。
- 正文里的显式 `[@配图 ...]` 属于宿主命令 shortcode：插件只声明占位，宿主解析成结构化请求并复用当前 `@配图 -> image_command_intent -> ImageCommandWorkflow` 主链，避免 worker 直接造图片任务或裸正则替换正文。

## 1.1 2026-07-05 主线校正

最新实现方向固定如下：

- `@写文章 ...` 的发送路径必须是 `useWorkspaceSendActions -> plugin_activation metadata/workflow_contract -> agentSession/turn/start -> RuntimeBackend -> 普通 Agent turn`。
- `plugin_activation` 只提供内容工厂编排合同，不触发 `maybe_run_plugin_worker_turn` 的右侧 worker fast path；右侧 worker 只服务用户显式右侧 pane/action。
- 普通 Agent turn 需要先给用户自然引导、过程说明和工具进展，再展示文章产物；不能只闪一下占位框后直接 `done`。
- RuntimeCore / RuntimeBackend 必须在最终 `turn.completed` 前补齐内容工厂 artifact snapshot、host tool timeline 和 read model 投影；terminal 之后再补 artifact 会被事件存储丢弃。
- `workflow-events.jsonl` 只保存 metadata-only 审计；聊天区、右侧和历史恢复不显示 raw JSON、`.lime/artifacts/content-factory/workspace-patch.json` 文件卡或 workflow step 列表。
- 右侧 Article Workspace 不自动打开；只有用户点击文章产物或显式打开时才展示。
- fixture / mock 只能证明受控回归，不能声明真实业务跑通；真实完成必须至少通过 App Server current-turn smoke 和 Electron/CDP Gate B 产品验收。
- Electron/CDP 证据分两层：baseline 只证明真实桌面桥接、turn/start、activation metadata 和文章产物可见；acceptance 还必须证明右侧不自动打开、执行卡片顺序、raw JSON / 文件卡隐藏和历史恢复。

## 2. 文档索引

| 文档                                                   | 用途                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [`product-requirements.md`](./product-requirements.md) | 产品背景、目的、收益、用户故事、用户用例、功能需求、架构图、流程图、时序图、验收标准。 |
| [`content-factory-plugin-reframe.md`](./content-factory-plugin-reframe.md) | 基于 Image #2 重新梳理内容工厂插件的执行卡片、文章产物、右侧编辑器和后台审计边界。 |

## 3. v1 到 v2 的边界变化

| 维度       | v1 现状                                                          | v2 目标                                                                      |
| ---------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 任务创建   | 发送后进入 Plugin worker turn，由 worker 结果投影任务状态。   | 发送后 App Server 建立后台 audit context，并把 workflow 事件追加到 JSONL。   |
| 过程可见性 | 初始 snapshot 后等待 worker / tools 完成，再批量出现过程和正文。 | 正文按段落进入同一个 `ArtifactFrame`；workflow step 不展示在右侧。           |
| 控制权     | worker 产出 workspace patch，宿主事后解析。                      | worker 在生成期发增量产物；App Server 透传并持久化，不伪造正文流。           |
| 工具调用   | worker 声明 searchRequests，宿主执行后回填。                     | 工具调用和 step 状态写入 JSONL 审计日志，必要时用于后台排障。                |
| 历史恢复   | 从 artifact / workspace patch 恢复 Article Workspace。           | 用户面从 artifact / workspace patch 恢复文章；审计面从 JSONL 回放 workflow。 |
| 验收口径   | 最终文章和右侧编辑器可用。                                       | 段落级流式、最终产物、右侧编辑器和 JSONL 审计可用。                          |
| 首发执行   | 可被 worker / fixture 直接完成。                                  | 必须保留普通 Agent turn 对话流，再由内容工厂合同约束产物与审计。              |

## 4. MVP 完成判定

- [x] 外部 `content-factory-app@2.2.2` package worker 在生成期按段落输出同一 article artifact 的 partial snapshot。
- [x] App Server current local_folder installed state 能使用真实外部 package worker 进入 `agentSession/turn/start`、artifact read model 和 workflow JSONL。
- [x] App Server runtime backend 能在 current-turn 中通过受控 OpenAI-compatible provider fixture 完成 host-managed generation，并把正文注入外部真实 worker。
- [ ] 远程 / GUI production 安装运行闭环使用真实外部 package worker，而不是仓库内 test-only fixture worker。
- [x] App Server 对 worker 输出的 artifact partial 做通用透传，不再对最终正文做二次切片。
- [x] workflow run / step / tool / connector / hook / evidence 事件下线右侧普通用户流程轨，只追加到 append-only JSONL 审计日志。
- [x] 外部内容工厂插件包显式输出 `articleDraft.source.hostToolRequests[]`，为聊天主链执行卡片提供当前事实源。
- [x] Article Editor 首批支持 `[@配图 ...]` shortcode，物化为 document-inline slot marker 并复用 `image_command_intent` 创建 / 回填图片任务；其他 `@` 命令先进入通用合同，不自动执行。
- [x] `evidence/export` 能读取 `workflow-events.jsonl` 并输出 metadata-only workflow audit 摘要，供后续审计导出使用。
- [x] `agentSession/read.detail.thread_read` 不再为右侧 Article Editor 提供 UI-facing `workflow_runs` / `workflow_steps`。
- [x] WebSearch / connector 执行状态写入同一个 JSONL audit stream。（RuntimeBackend `hostSearchEvidence -> workflow.connector.completed` 已绑定；外部内容工厂包自带 connector executor 未纳入本阶段。）
- [x] `ArtifactFrame(articleArtifacts)` 仍只承载最终文章，不回退普通 assistant 长文。
- [x] 右侧 Article Editor 从 article artifact / workspace patch 恢复，不显示 workflow 步骤。
- [x] 受控 read model / fixture 历史恢复能看到最终文章和编辑稿；workflow 过程只供审计回放。真实 Electron/CDP 从历史列表重进同一 session 仍属于 Gate B product acceptance 待验项。
- [x] `@写文章` 普通 Agent turn current-turn smoke 产生自然对话、host tool timeline 和不少于 `6` 个内容工厂 `artifact.snapshot`；2026-07-05 后端修复后最新证据为 `.lime/qc/content-factory-current-turn-debug/content-factory-current-turn-debug-host-generation-2026-07-05T04-19-07-937Z.json`，显示 `eventCount=35`、`artifactSnapshotCount=7`、`streamingDocumentLengths=5`、`hostToolEventCount=9`、`workflowEventCount=16`、`hostManagedGenerationStatus=completed`。
- [x] Electron/CDP Gate B baseline 通过：真实 Electron 页面 `http://127.0.0.1:1420/?nativeStartup=1`，`window.__LIME_ELECTRON__` / invoke bridge 可用，`agentSession/turn/start` 经 `electron-ipc -> app_server_handle_json_lines` 成功，trace 中带 `content_article_workflow` activation metadata，聊天中捕获自然过程文本和文章产物正文。证据为 `.lime/qc/gui-evidence/writing/writing-cdp-WRITING_CDP_1783188149738-summary.json` 与 `.lime/qc/gui-evidence/writing/writing-cdp-WRITING_CDP_1783188149738-turn-start-trace.json`。
- [ ] Electron/CDP Gate B product acceptance 通过：发送后不自动打开右侧 Article Workspace；执行卡片在文章产物前可见；raw JSON、`.lime/artifacts/content-factory/workspace-patch.json` 文件卡和 workflow step 列表不进入聊天；点击文章产物后右侧打开；从历史重新进入同一会话仍恢复文章。

## 5. 非目标

- 不把 `@写文章` 恢复为宿主硬编码内置能力。
- 不让 worker 直接拥有全局 workflow 状态。
- 不让 agent 根据自然语言自由决定是否创建任务。
- 不把 stdout progress 当成 UI 长期事实源；需要留痕的 workflow 过程必须进入 JSONL 审计日志。
- 不恢复旧 Profile、旧 SceneApp 或 legacy Tauri command 路径。
- 不在右侧 Article Editor 展示 workflow step / task card / 流程轨。

## 6. 实现状态

### 2026-07-02 首刀

本轮实现后的目标口径调整为：

1. 外部真实 `content-factory-app@2.2.2` package worker 已有 producer-side 段落级 artifact partial 证据；仓库内 worker fixture 仍只允许作为 `src/features/plugin/testing/fixtures` 下的 test-only evidence。
2. 真实接入后，worker 必须在生成期间主动发段落级 `artifact.snapshot` partial，最终 response 里的 complete snapshot 只负责封口和历史恢复。
3. workflow run / step / tool / connector / hook / evidence 仍可作为后台编排事实存在，但普通用户 UI 不展示步骤列表。
4. workflow 过程只写入 append-only `workflow-events.jsonl`，用于未来审计、排障和质量复盘。
5. 前端默认只消费 article artifact / workspace patch 来更新 `ArtifactFrame` 与右侧 Article Editor。
6. 右侧 Article Editor 不再消费 `workflow_runs` / `workflow_steps` 来展示流程轨。

本轮已完成 JSONL audit writer 和普通用户 UI / read model 的 workflow 下线：workflow 审计事件写入当前 event log 根目录下的 `sessions/session_<id>/workflow-events.jsonl`，普通 `agentSession/read`、renderer event stream 和右侧 Article Editor 不再消费 workflow step 列表。

hook lifecycle 已作为 `workflow.hook.completed` 进入 `workflow-events.jsonl`，普通输出、read model 和右侧 Article Editor 不消费 hook 事件。

retry lifecycle 已作为 `workflow.run.retrying` / `workflow.step.retrying` 进入 `workflow-events.jsonl`，普通用户面仍只看到既有 retry 摘要。

cancel lifecycle 已作为 `workflow.step.canceled` / `workflow.run.canceled` 进入 `workflow-events.jsonl`：`agentSession/turn/cancel` 仍只向普通用户事件流返回 `turn.canceled`，App Server 只对同一 turn 内尚未终态的 workflow run / step 追加 audit-only 取消事件，不向 Article Editor 或 read model 暴露流程状态。

2026-07-03 追加验证：App Server host-managed generation 注入链已有离线 localhost OpenAI-compatible provider fixture 回归，证明宿主可以在启动 worker 前完成受控文本生成，并把 `article-draft-document -> articleDraft.documentText` 注入 `hostManagedGeneration.outputs[]` / `runtime.hostManagedGenerationResult`；Lime 内 package-root 与外部 `content-factory-app` worker 包测试也证明该结果会覆盖 deterministic fallback 正文。

2026-07-03 追加验证：新增 `npm run smoke:content-factory-package`，从外部 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 读取 `content-factory-app@2.2.2`、校验 `.lapp` 关键包结构和 runtime contract，执行外部包 `npm test` / `npm run validate:app`，再直接运行 `src/runtime/content-factory-worker.mjs`。本次证据显示 `.lapp` package hash 为 `sha256:89aec20e637713c668f8bc34c303256ac83806c5d2e75486e6453bd638ac3f8c`，worker 输出 `3` 个 audit-only `workflow.connector.requested` 和 `6` 个段落级 `artifact.snapshot` partial，最终 `articleDraft.documentText` 使用 host-managed generation 正文；原始 worker 输出写入 `.lime/qc/gui-evidence/plugins/content-factory-package-smoke-2026-07-02T20-22-46-553Z.worker.jsonl`。

2026-07-03 追加验证：新增 `npm run smoke:content-factory-current-turn`，使用隔离 `HOME / XDG_DATA_HOME / APPDATA / LOCALAPPDATA` 启动 App Server stdio current 链路，按 `agentAppLocalPackage/inspect -> agentAppInstalled/save -> agentSession/start -> agentSession/turn/start -> agentSession/read -> artifact/read -> evidence/export` 验证外部真实 package 的 local_folder installed state。证据显示外部 `content-factory-app@2.2.2` 的 local folder package hash 为 `sha256:4be73a57bb5d29c5768b13a46c8ed8b07194fa7eda243d79feaf7d824941bdee`，current turn 产生 `24` 个 `artifact.snapshot`，其中 `22` 个段落级 streaming document partial 递增长度，`workflow-events.jsonl` 写入 `13` 条 audit-only workflow 事件，普通 event log / read model 未暴露 workflow 或 hook 事件；证据写入 `.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-2026-07-02T20-48-56-462Z.json`。该 smoke 使用 `backendMode=unavailable`，所以只能证明真实 package 进入 App Server current turn、artifact read model 和 JSONL 审计链路，不证明 live host-managed LLM generation 完成。

2026-07-03 追加验证：`npm run smoke:content-factory-current-turn:host-generation` 在同一 current-turn smoke 上增加本地 OpenAI-compatible SSE fixture，并显式用 `backendMode=runtime` 触发 App Server host-managed generation。证据显示外部 `content-factory-app@2.2.2` 进入 current turn 后产生 `19` 条普通事件、`6` 个 `artifact.snapshot`、`4` 个段落级 streaming partial，`workflow-events.jsonl` 写入 `16` 条 audit-only workflow 事件，`hostManagedGenerationStatus=completed`，fixture provider 收到 `5` 次请求；证据写入 `.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-host-generation-2026-07-02T20-48-56-462Z.json`。这证明受控 provider 下的 current-turn host-managed generation 已闭环，但仍不等同于真实 live Provider / 远程 GUI production 证据。

2026-07-03 追加验证：补强 `npm run smoke:content-factory-current-turn:host-generation` 与 `npm run smoke:content-factory-current-turn:cloud-release-host-generation` 的宿主工具证据链，当前 smoke 已断言 streaming / final `artifact.snapshot` 均保留 `3` 条 `articleDraft.source.hostToolRequests[]`，普通事件流与 session JSONL 均包含 `3` 组 `tool.started -> tool.args -> tool.result`，事件 `source=workspace_patch_host_tool_requests`；`agentSession/read.detail.items` 与 `thread_read.tool_calls` 均投影出 `3` 个 completed `web_search` 工具项，`evidence/export` 也能从 artifact snapshot 证明 `hostToolEvidence` 已回填。最新证据写入 `.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-host-generation-2026-07-03T12-31-25-916Z.json`、`.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-host-generation-2026-07-03T12-31-25-916Z.workflow-events.jsonl`、`.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-cloud-release-host-generation-2026-07-03T12-32-45-939Z.json` 与 `.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-cloud-release-host-generation-2026-07-03T12-32-45-939Z.workflow-events.jsonl`。这证明 `hostToolRequests -> WebSearch tool event/read model -> article artifact` 的 App Server current / cloud_release fixture 证据链成立，但仍不替代真实 GUI production 安装运行验证。

2026-07-03 追加验证：新增 `npm run smoke:content-factory-current-turn:cloud-release` 与 `npm run smoke:content-factory-current-turn:cloud-release-host-generation`，在隔离数据目录内构造本地签名 proof / trust root，并把外部 `content-factory-app@2.2.2` 物化到 `preferredDataDir/plugins/packages/sha256_4be73a57bb5d29c5768b13a46c8ed8b07194fa7eda243d79feaf7d824941bdee`，让 installed state 以 `sourceKind=cloud_release`、`signaturePolicy=required`、`signatureVerificationStatus=verified`、`cloudReleaseEvidence.status=ready` 进入同一 App Server current-turn worker 路径。cloud-release smoke 产生 `28` 条普通事件、`22` 个段落级 streaming partial、`13` 条 workflow audit 事件；cloud-release-host-generation 组合 smoke 产生 `19` 条普通事件、`4` 个段落级 streaming partial、`16` 条 workflow audit 事件，且 `hostManagedGenerationStatus=completed`。证据写入 `.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-cloud-release-2026-07-02T20-59-19-433Z.json` 与 `.lime/qc/gui-evidence/plugins/content-factory-current-turn-smoke-cloud-release-host-generation-2026-07-02T20-59-28-730Z.json`。这只证明签名证据 ready 后的 cloud_release runtime/cache/current-turn 路径成立，不替代生产 LimeCore 下发 `signatureProof` 与 `agentAppSignatureTrustRoots` 的真实远程 GUI 安装证据。

2026-07-03 追加实现：`workflow-events.jsonl` 写盘前统一执行 metadata-only 脱敏，`prompt / query / result / providerConfig / message / text / summary` 等 raw content 字段会替换为 `workflow_audit_metadata_only` redaction 占位，同时保留 `workflowRunId / workflowKey / stepId / connectorRef / toolName / status / agentAppWorkflow` 等审计元数据；普通 session JSONL、read model 和 Article Editor 仍不消费 workflow 事件。定向验证已覆盖 `EventLogWriter::append_workflow_audit_events` 与真实 Plugin worker turn 中的 workflow run prompt / connector query 脱敏。

2026-07-03 追加实现：App Server current `evidence/export` 会在生成 Evidence Pack 时读取同一 session / turn 的 `workflow-events.jsonl`，并把 `workflow_audit` metadata-only 摘要写入 `observabilitySummary`，只暴露 event type breakdown、workflow run / key、turn、step、connector、tool、status 和 redaction 覆盖统计，不返回 workflow audit 原始 payload，也不改变普通 UI / read model。定向验证覆盖 `workflow.run.started` / `workflow.step.completed` / `workflow.run.completed` 摘要导出，确认 raw prompt、connector query、provider config 和结果正文不会出现在导出摘要里。

2026-07-05 排查闭环：`npm run smoke:content-factory-current-turn:host-generation -- --timeout-ms 180000 --evidence-dir ".lime/qc/content-factory-current-turn-debug" --prefix "content-factory-current-turn-debug"` 曾失败，错误为 `expected paragraph-level artifact snapshots, got 0`，证据文件为 `.lime/qc/content-factory-current-turn-debug/content-factory-current-turn-debug-host-generation-2026-07-05T03-29-33-481Z.failure.json`。根因是普通 `plugin_activation` turn 在 `turn.completed` 后才尝试补内容工厂 artifact，事件存储会丢弃 terminal 后事件。该后端缺口已通过 RuntimeCore terminal deferring 和 current-turn smoke 修复；下一刀是 GUI/CDP。

2026-07-05 最新做法：RuntimeCore 对可识别的内容工厂 `plugin_activation` 普通 turn 使用 terminal deferring sink 暂存 backend 发出的 `turn.completed`，先让普通 RuntimeBackend 完成自然对话 / 工具过程，再按插件 activation 派生 `PaneActionWorkerTurn` 执行内容工厂 artifact materialization、host tool enrichment 与 `workflow-events.jsonl` audit 写入，最后重新 emit 暂存的 `turn.completed`。该路径不改变 `maybe_run_plugin_worker_turn` 的右侧 pane/action fast path 触发条件，因此 `@写文章` 首发仍是普通 Agent turn；右侧 worker 只响应显式右侧动作。当前 Rust 定向测试、App Server current-turn smoke 和 Electron/CDP baseline 已通过，仍待 Electron/CDP product acceptance 确认。

2026-07-05 最新验证：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server plugin_activation_turn_uses_regular_agent_backend --lib` 通过，确认普通 backend 先收到 `plugin_activation` 请求，artifact snapshot 和 workflow JSONL 在 terminal 前落下；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server plugin_worker_turn --lib` 通过，确认右侧 pane/action worker 既有 guard 未被破坏；`npm run smoke:content-factory-current-turn:host-generation -- --timeout-ms 180000 --evidence-dir ".lime/qc/content-factory-current-turn-debug" --prefix "content-factory-current-turn-debug"` 通过，外部 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app@2.2.2` 以 `local_folder` installed state 进入 App Server current ordinary turn，普通事件流有 `message.delta`、`artifact.snapshot`、`tool.started/tool.args/tool.result` 和最终 `turn.completed`，后台 `workflow-events.jsonl` 写入 `16` 条 metadata-only audit 事件。真实 Electron/CDP baseline 证据 `.lime/qc/gui-evidence/writing/writing-cdp-WRITING_CDP_1783188149738-summary.json` 进一步确认桌面桥接、`electron-ipc` turn/start、activation metadata、自然过程捕获和文章产物正文可见；但该脚本为了验证编辑器主动点击了“打开文档”，不能证明右侧不会自动打开，也未完成历史恢复复测，所以只能标记 baseline，不标记 product acceptance。

尚未完成的是：Electron/CDP product acceptance、真实 live Provider production 证据、远程 / GUI production 安装签名门禁补齐，以及 resume 在审计日志中的真实生命周期建模。

持续执行计划见：`internal/exec-plans/writing-v2-workflow-completion-plan.md`。
