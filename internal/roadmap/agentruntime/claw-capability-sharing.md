# Claw Capability 共享方案

> 状态：in progress（Agent App Runtime 首批 catalog、workflow metadata 与 manifest allowlist gate 第一刀已落地）
> 更新时间：2026-05-16
> 作用：把 Claw 已经实现的 `@` 能力从 Chat surface 中抽象为 AgentRuntime 可复用 capability，供 Agent App、Automation 和未来 surface 共享。

## 1. 背景

Lime Claw 已经有大量可用能力：配图、封面、海报、视频、搜索、深搜、研报、竞品、站点搜索、读 PDF、总结、翻译、分析、转写、链接解析、网页、PPT、表单、发布等。这些能力在后端并不是普通 prompt，而是通过 `request_metadata`、skill launch guard、tool permission、runtime contract、artifact/evidence 主链进入 Aster runtime。

当前共享困难不是能力缺失，而是入口形态过于贴近 Chat / Claw：

```text
Inputbar / @命令
  -> capability route / request metadata
  -> agent_runtime_submit_turn
  -> runtime_turn.rs
  -> *_skill_launch.rs / tool_runtime.rs
  -> Tauri event_name
  -> Chat workspace projection
```

Agent App 如果只通过 `capability:invoke` 或模型 API，就无法自然复用这条主链。

## 2. 一句话事实源

Claw 能力以后只允许向 AgentRuntime capability catalog 收敛；Chat `@命令`、Agent App `lime.agent.startTask`、Automation job 都只是不同 surface adapter。

```text
Surface intent
  -> Runtime Capability Catalog
  -> capability metadata contract
  -> AgentRuntime submit
  -> existing skill/tool launch
  -> runtime events / artifacts / evidence
```

## 3. 共享原则

1. **复用后端主链，不复制 skill launch。**
   `image_skill_launch.rs`、`research_skill_launch.rs`、`report_skill_launch.rs` 等现有实现继续是 current execution 准备逻辑。

2. **Chat 入口降级为 surface adapter。**
   `@配图`、`@搜索` 等 Chat 命令只负责把用户输入映射成 capability intent。

3. **Agent App 不接触 Chat 专用协议。**
   App 提交 `taskKind`、业务输入、期望产物和 human review 策略，由 Agent App Runtime Surface 生成 runtime metadata。

4. **事件按 surface 投影。**
   底层 `lime_agent::AgentEvent` 是共享事实；Chat 投影为 conversation，App 投影为 task stream，Automation 投影为 job item。

5. **Artifact / Evidence 不分家。**
   图片任务、报告、PPT、网页、内容表都必须继续写入统一 Artifact / Evidence 主链。

## 4. 首批共享能力映射

| Capability | Chat surface | Agent App surface | Current 后端主链 | 关键产物 |
| --- | --- | --- | --- | --- |
| `lime.capability.image.generate` | `Claw @配图` / `@海报` | 内容工厂生成配套素材、封面 brief | `image_skill_launch -> Skill(image_generate)` | media task、image artifact、evidence |
| `lime.capability.cover.generate` | `Claw @封面` | 内容工厂文章封面 | `cover_skill_launch -> Skill(cover_generate)` | cover task file、artifact |
| `lime.capability.video.generate` | `Claw @视频` | 短视频脚本到视频素材 | `video_skill_launch -> Skill(video_generate)` | video task、timeline |
| `lime.capability.research.search` | `Claw @搜索` / `@深搜` | 生产前资料补齐、素材检索 | `research_skill_launch -> Skill(research)` | search timeline、citations |
| `lime.capability.report.generate` | `Claw @研报` / `@竞品` | 内容策略分析、竞品分析 | `report_skill_launch -> Skill(report_generate)` | report artifact、sources |
| `lime.capability.site.search` | `Claw @站点搜索` | 平台规则/竞品站点检索 | `site_search_skill_launch -> Skill(site_search)` | site tool timeline |
| `lime.capability.pdf.read` | `Claw @读PDF` | 资料整理、课程稿解析 | `pdf_read_skill_launch -> Skill(pdf_read)` | file refs、summary evidence |
| `lime.capability.summary.generate` | `Claw @总结` | 知识库整理、复盘摘要 | `summary_skill_launch -> Skill(summary)` | structured summary |
| `lime.capability.webpage.generate` | `Claw @网页` | 交付页、活动页草案 | `webpage_skill_launch -> Skill(webpage_generate)` | HTML artifact |
| `lime.capability.presentation.generate` | `Claw @PPT` | 策略报告 / 交付 PPT | `presentation_skill_launch -> Skill(presentation_generate)` | Markdown/PPT source artifact |

命名是 roadmap 目标名，后续实现时可根据现有 catalog 命名压缩；但语义必须稳定，不能继续以 UI 文案作为能力 id。

## 5. Capability 覆盖矩阵

每个可共享能力必须登记以下字段：

| 字段 | 说明 |
| --- | --- |
| `capabilityId` | 稳定机器 id，例如 `lime.capability.research.search` |
| `owner` | AgentRuntime / Claw capability catalog |
| `chatEntry` | 对应 `@` 命令或 Chat surface adapter |
| `appEntry` | 可供 Agent App 调用的 task kind / workflow kind |
| `metadataContract` | required metadata、默认值、禁止绕行的 guard |
| `allowedTools` | 当前 tool surface / allowlist / denylist |
| `runtimeEvents` | 需要转译给 Chat / App / Automation 的事件族 |
| `artifactPolicy` | 产物类型、写入位置、可导出形式 |
| `evidencePolicy` | 必须记录的 provenance、source、verification |
| `tests` | 后端定向测试、contract test、GUI/App smoke |

## 6. current / compat / deprecated / dead

### current

1. `runtime_turn.rs`、`tool_runtime.rs`、`*_skill_launch.rs` 仍是当前执行准备主链。
2. `AgentRuntimeProfileEvent` / `AgentRuntimeThreadReadModel` / Evidence Pack 是共享事实输出。
3. Chat `@` 命令和 Agent App task 都应进入相同 capability catalog。

### compat

1. 前端 Inputbar 现有 capability route 可以继续存在，但只作为 Chat surface adapter。
2. 旧 `request_metadata` shape 可继续被后端读取，但要收敛到 capability metadata contract。
3. App 前端 `CapabilityHost` mock 可用于测试，但不能被当作生产执行事实。

退出条件：首批共享能力 catalog 落地并有覆盖矩阵后，Chat 和 App 都不得直接拼同一能力的私有 metadata。

### deprecated

1. 在 App 内复制 Chat `@` 文案或 prompt 触发能力。
2. 让业务组件直接决定 allowed tools / denied tools。
3. 用最终聊天文本反推 artifact、tool success 或 evidence pass。

### dead

1. 新增 `content_factory_image_generate` 这类垂直专用后端能力复制。
2. 新增与 `*_skill_launch.rs` 平行的 Agent App skill launch 实现。
3. 新增只服务 Agent App 的工具权限系统。

## 7. 内容工厂首批落地口径

内容工厂 P0 至少证明三条共享能力：

1. **资料补齐**：`content_factory.copy.generate` 缺资料时进入 research / summary / pdf read 能力，而不是让模型凭空补。
2. **文案生产**：文案生成走 AgentRuntime task，支持 stream、cancel、retry、review 和 structured write-back。
3. **素材配套**：配套素材复用 image / cover capability，生成 artifact 和 evidence，而不是只产出图片 prompt 文本。

验收时看同一底层 runtime facts：

```text
taskKind / capabilityId
  -> runtime events
  -> tool timeline
  -> artifact refs
  -> evidence refs
  -> App task projection
```

## 8. 已落地第一刀

`agent_app_runtime_start_task` 已经能读取 `requiredCapabilities` / `capabilityHints` 中受支持的 capability，首个单能力任务会写入现有 Claw `*_skill_launch` metadata；多个 capability 会被去重后作为 workflow metadata 暴露给 runtime / harness：

| Capability hint | 写入 metadata | 首刀 Skill |
| --- | --- | --- |
| `lime.capability.image.generate` / `image_generation` | `harness.image_skill_launch.image_task` | `image_generate` |
| `lime.capability.cover.generate` / `cover_generation` | `harness.cover_skill_launch.cover_task` | `cover_generate` |
| `lime.capability.research.search` / `web_search` | `harness.research_skill_launch.research_request` | `research` |
| `lime.capability.report.generate` | `harness.report_skill_launch.report_request` | `report_generate` |
| `lime.capability.pdf.read` / `pdf_extract` | `harness.pdf_read_skill_launch.pdf_read_request` | `pdf_read` |
| `lime.capability.summary.generate` | `harness.summary_skill_launch.summary_request` | `summary` |

当前仍是第一刀：非复合任务只会把首个 capability 提升为实际 `*_skill_launch`，用于证明“App 不复制 Claw、而是进入同一 skill launch 主链”；内容工厂这类带 output contract 的复合任务会写入 `agent_app_runtime.capability_workflow` 与 `harness.agent_app_runtime_capability_workflow`，`mode=composite_output_contract`、`launch_policy=metadata_only`，避免 `research.search + image_generation` 把业务工作流强行改写成单一 research / image Skill。Host dispatcher 已有 high-level manifest capability gate，会拒绝未声明的 `lime.agent` 等 Host capability；Claw capability hint 也会校验 manifest `toolRefs[].capabilities` allowlist。AgentRuntime profile event 与高价值 RuntimeAgentEvent 已能主动转译为 App canonical `taskEvents`，artifact runtime event 可携带 workspace patch；evidence 变更还需要继续收敛。后端/cross-surface capability policy owner、真正多能力执行编排和跨 surface catalog owner 仍需后续阶段补齐。
