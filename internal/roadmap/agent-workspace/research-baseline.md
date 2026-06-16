# Agent Workspace 评测调研依据

> 状态：research-baseline  
> 更新时间：2026-06-15  
> 目标：记录 Agent Workspace 分领域评测矩阵的依据，避免只凭主观产品印象打分。

## 1. 本地源码与文档对照

| 来源 | 已读证据 | 对 Agent Workspace 评测的启发 |
| --- | --- | --- |
| OpenAI Codex 本地源码：`/Users/coso/Documents/dev/rust/codex` | `codex-rs/app-server/README.md`、`codex-rs/protocol/README.md`、app-server / tui / sandbox / approval / thread / command / search 文件索引 | Codex 的桌面/IDE级 Agent 能力围绕 thread、turn、item、stream notification、approval、sandbox、command、fs、diff、skills、thread restore 建模 |
| CodexMonitor：`/Users/coso/Documents/dev/rust/CodexMonitor` | `README.md`、`docs/app-server-events.md` | 可作为桌面 Agent App 参考：workspace/thread、queue vs steer、composer controls、reasoning/tool/diff rendering、approval prompts、git/github、file tree、terminal dock |
| Claude Code 本地源码：`/Users/coso/Documents/dev/js/claudecode` | `src/tools/MCPTool/UI.tsx`、`src/tasks/pillLabel.ts`、tools / tasks 文件索引 | 工具 UI 应截断输入、展示 progress、大输出 token warning、空输出、图片占位、dominant text payload；后台任务 pill 只在 needs-input / plan-ready 抢注意力 |
| AgentUI 标准：`/Users/coso/Documents/dev/ai/limecloud/agentui` | `README.md`、`docs/en/reference/source-index.md`、`flow-and-taxonomy.md`、`ecosystem-boundaries.md` | Agent UI 的边界是把 runtime facts 投影为 conversation、process、task、artifact、evidence、session surfaces，不拥有 runtime truth |
| AG-UI：`/Users/coso/Documents/dev/js/ag-ui` 与 Context7 `/ag-ui-protocol/ag-ui` | README、Dojo、Context7 event docs | AG-UI 标准事件包括 run lifecycle、text、thinking、tool、state snapshot/delta、messages snapshot、error；前端要处理 shared state 和 tool args/result lifecycle |
| Codex App 截图：`/var/folders/87/s6cpr7hd1_v43cs833x4s_900000gn/T/waveterm-527670497/waveterm_paste_1781535742010_1qc4es.png` | 本轮人工拆解截图对象 | Codex 桌面体验不是“聊天 + 工具卡”，而是把环境、Git、progress、subagents、sources、目标、权限、模型、分屏审查整合成 run control surface |
| Codex App 官方手册 | Codex manual `Codex app features`、`Agent approvals & security`、`Subagents`、`Model Context Protocol` | Codex App 明确支持 Local / Worktree / Cloud、内置 Git diff / commit / push / PR、task sidebar、plan / sources / artifacts / summary、permissions / sandbox、MCP、Skills、web search、subagents |
| Codex app-server protocol | `TurnPlanUpdatedNotification`、`TurnPlanStep`、`ThreadGoal`、`ActivePermissionProfile`、`TurnStartParams`、`Thread.gitInfo`、`FileChangePatchUpdatedNotification`、`SubAgentActivityKind` | Codex 运行驾驶舱的关键对象是协议事实，不应由前端解析 assistant Markdown 得到 |
| Vercel AI SDK Context7 `/vercel/ai` | `UIMessage` parts、reasoning part、tool state、source/data parts | 消息渲染应基于 typed parts，而不是把 text、reasoning、tool、source、file 混成一个 Markdown 字符串 |
| Lime tool catalog | `lime-rs/crates/agent/src/agent_tools/catalog.rs`、`inventory.rs`、`runtime_backend/tool_inventory.rs` | 工具评测必须以 catalog / runtime inventory 为事实源；本轮盘点出 60 个固定 catalog 条目，并将动态 MCP / browser 工具单独按 runtime snapshot 评估 |
| Lime tool UI | `toolDisplayInfo.ts`、`ToolCallDisplayViewModel.ts`、`ToolCallDisplay*.test.tsx`、`toolProcessSummary*.test.ts` | 前端已具备 family 映射、command summary、diff review、WebSearch 预览、ToolSearch 摘要、Skill snapshot、site saved content、内容任务 failure 隐藏等证据 |
| Codex Skills 官方文档与源码 | Codex manual `Agent Skills` / `Build plugins`、`core-skills/src/*`、`app-server/tests/suite/v2/skills_list.rs`、`tui/src/*skills*` | Skill 是 reusable workflow authoring format；要评测 progressive disclosure、显式/隐式触发、插件分发、skills list / changed、mention / popup、metadata policy / dependencies |
| Agent Skills 标准 | `agentskills.io/specification`、client implementation、description optimization、best practices | Skill 包不是一段 prompt；必须按 `SKILL.md`、resources、scripts、metadata、description 触发准确率和渐进披露评测 |
| Lime Skill 事实源 | `internal/aiprompts/skill-standard.md`、`src/lib/api/skills.ts`、`skillCatalog.ts`、`serviceSkills.ts`、`SkillsPage*`、`skill_tool_gate.rs`、`skill_execution.rs`、`service-skill-entry-smoke.mjs` | Skill 系统需要单独评分：包标准、管理/分发、产品投影、composer 入口、runtime gate、artifact / evidence、subagent preload |
| MCP 官方规范与 Context7 | MCP `2025-11-25` lifecycle、tools、resources、prompts、roots、sampling、elicitation、authorization、安全原则 | MCP 不是动态工具列表；必须按 server lifecycle、capabilities、tools/resources/prompts、auth/elicitation、roots/sampling、安全与 evidence 独立评分 |
| Codex MCP 官方文档与源码 | Codex manual `Model Context Protocol`、`codex-mcp`、`rmcp-client`、`core/src/session/mcp.rs`、`mcp_tool_call.rs`、TUI MCP snapshots、app-server MCP tests | Codex 对标包括 STDIO/streamable HTTP、OAuth/bearer/env、server instructions、`/mcp` 状态、enabled/disabled tools、approval mode、plugin-provided MCP、resource helpers |
| Lime MCP 事实源 | `internal/aiprompts/mcp.md`、`src/components/mcp/**`、`src/lib/api/mcp.ts`、`lime-rs/crates/mcp/**`、`app-server/src/processor/mcp.rs`、`scripts/mcp/current-smoke.mjs` | Lime 已有 MCP 管理页、App Server current API、Rust manager、tool/prompt/resource 浏览、runtime 动态工具分类和 current smoke；缺 auth/elicitation、list_changed、server instructions、专项 Evidence |
| Lime Run Control 事实源 | `WorkspaceMainArea.tsx`、`WorkspaceGeneralWorkbenchSidebar.tsx`、`GeneralWorkbenchSidebar.tsx`、`managedObjectivePanelModel.ts`、`AgentRuntimeStrip.tsx`、`agentUiSubagentsViewModel.ts`、`permissionProjection.ts`、`projectGit.ts`、`InputbarModelExtra.tsx`、`harnessEvidenceViewModel.ts` | Lime 有 workspace shell、general sidebar、objective、runtime strip、Git API、subagent projection、permission/model/evidence 局部事实源，但缺 Codex 式统一 run rail / bottom control surface |
| Lime 当前仓库 | `packages/agent-ui-contracts/README.md`、`internal/roadmap/agentruntime/agentui-adoption-gap.md`、`internal/test/agent-evaluation.md`、`internal/tests/lime-agent-autonomous-test-execution-matrix.md` | Lime 已有 contracts、projection、Evidence/qcloop 体系；缺口主要在 Agent Workspace GUI 深水位消费和可重复产品场景补证 |

## 2. 公开 benchmark 与方法论

| 来源 | 评测启发 | Agent Workspace 应采用的口径 |
| --- | --- | --- |
| OpenAI Evals / Agent evals | 用 dataset、task、trace、grader、结果分析评估 agent 行为 | 每个 Agent Workspace 场景必须保存 transcript、runtime events、UI evidence 和 grader verdict |
| OpenAI Cookbook evals | eval 是验证和测试 LLM 应用输出质量的过程 | 工具 UI 评分不能停在截图，必须有 expected outcome 与 pass/fail |
| Anthropic effective agents | 先建立综合 eval，再按失败模式优化；不要一开始过度复杂化 | Agent Workspace 先收 P0 闭环，再扩展 background/team/remote teammate |
| Anthropic agent evals | eval 让问题和行为变化在影响用户前可见 | 工具评测要按失败模式归档，不只记录“看起来可用” |
| Anthropic tool-writing | agent 成效受工具质量影响，MCP 可能带来大量工具 | Lime 需要 tool inventory、工具描述、输入摘要和输出结构化评测，避免几十个工具变成不可控列表 |
| Anthropic Claude Code Skills / subagents | Skills 可以扩展 Claude Code；subagent 可以预加载 skills | Lime 的 Skill 评测要覆盖主 agent、subagent/team preload、handoff 中的 skill usage，不只看管理页 |
| SWE-bench | 用真实 GitHub issue 检验 patch 是否能解决问题 | Coding 不能只看“生成了代码”，必须有 diff、测试退出码、失败修复循环 |
| Terminal-Bench | 在真实终端环境中评估 agent 执行 shell 任务 | Terminal / command runtime 必须独立评分，包括 stdout/stderr、exit、pty、resize、interrupt |
| WebArena / Mind2Web | Web 导航、点击、表单、信息提取需要独立环境评分 | Browser 不能只看工具注册，要有操作轨迹、页面状态、来源引用 |
| OSWorld | 桌面/多模态计算机使用任务评估 | Agent Workspace 若支持桌面自动化，需要截图、状态回放、失败分类 |
| GAIA / AgentBench | 通用 agent 任务强调工具使用、推理、信息检索和多环境能力 | Agent Workspace 总分应按 outcome、tool use、evidence、recovery 分层，不以单一聊天质量评分 |

## 2.1 WebSearch 来源链接

| 来源 | URL |
| --- | --- |
| OpenAI Evals | https://github.com/openai/evals |
| OpenAI Cookbook: Getting started with OpenAI Evals | https://developers.openai.com/cookbook/examples/evaluation/getting_started_with_openai_evals |
| Anthropic: Building effective agents | https://www.anthropic.com/research/building-effective-agents |
| Anthropic: Demystifying evals for AI agents | https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents |
| Anthropic: Writing effective tools for AI agents | https://www.anthropic.com/engineering/writing-tools-for-agents |
| SWE-bench | https://www.swebench.com/ |
| SWE-bench GitHub | https://github.com/swe-bench/SWE-bench |
| Terminal-Bench | https://www.tbench.ai/ |
| Terminal-Bench GitHub | https://github.com/harbor-framework/terminal-bench |
| WebArena GitHub | https://github.com/web-arena-x/webarena |
| OSWorld | https://os-world.github.io/ |
| OSWorld GitHub | https://github.com/xlang-ai/osworld |
| GAIA paper | https://arxiv.org/abs/2311.12983 |
| AgentBench GitHub | https://github.com/THUDM/AgentBench |
| OpenAI Codex Skills | https://developers.openai.com/codex/skills |
| Agent Skills Specification | https://agentskills.io/specification |
| Agent Skills client implementation | https://agentskills.io/client-implementation/adding-skills-support |
| Agent Skills description optimization | https://agentskills.io/skill-creation/optimizing-descriptions |
| Agent Skills best practices | https://agentskills.io/skill-creation/best-practices |
| Anthropic Claude Code Skills | https://docs.anthropic.com/en/docs/claude-code/skills |
| Anthropic Claude Code Subagents | https://docs.anthropic.com/en/docs/claude-code/sub-agents |
| OpenAI Codex App | https://developers.openai.com/codex/app |
| OpenAI Codex App Features | https://developers.openai.com/codex/app/features |
| OpenAI Codex Agent approvals & security | https://developers.openai.com/codex/agent-approvals-security |
| AG-UI overview | https://docs.ag-ui.com/introduction |
| AG-UI events | https://docs.ag-ui.com/concepts/events |
| AG-UI tools / HITL | https://docs.ag-ui.com/concepts/tools |
| AG-UI state management | https://docs.ag-ui.com/concepts/state |
| Model Context Protocol specification | https://modelcontextprotocol.io/specification/2025-11-25 |
| MCP architecture overview | https://modelcontextprotocol.io/docs/learn/architecture |
| MCP lifecycle | https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle |
| MCP tools | https://modelcontextprotocol.io/specification/2025-11-25/server/tools |
| MCP resources | https://modelcontextprotocol.io/specification/2025-11-25/server/resources |
| MCP prompts | https://modelcontextprotocol.io/specification/2025-11-25/server/prompts |
| MCP roots | https://modelcontextprotocol.io/specification/2025-11-25/client/roots |
| MCP sampling | https://modelcontextprotocol.io/specification/2025-11-25/client/sampling |
| MCP elicitation | https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation |
| MCP authorization | https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization |
| OpenAI Codex MCP | https://developers.openai.com/codex/mcp |
| Google ADK Evaluate | https://adk.dev/evaluate/ |
| Google ADK Evaluation Criteria | https://adk.dev/evaluate/criteria/ |

## 3. 领域拆分原则

1. **按用户可感知能力拆分**：tools、coding、search、browser、HITL、artifact、session、team 各自独立评分。
2. **按对象层级拆分**：Tool、Skill Bundle、MCP Server、Catalog Projection、Runtime Binding、Artifact / Evidence 不混成一个分数。
3. **按事实源边界拆分**：runtime truth、artifact truth、evidence truth、policy truth 不混入 UI 本地状态。
4. **按验收证据拆分**：每个领域都要有 UI facts、runtime facts、transcript、Evidence Pack 或至少可复核日志。
5. **按失败模式拆分**：product blocker、environment blocker、evidence blocker、concurrency blocker、release blocker 分开记录。
6. **按外部 benchmark 映射**：coding 对 SWE-bench，terminal 对 Terminal-Bench，browser 对 WebArena / OSWorld，general agent 对 GAIA / AgentBench。

## 4. 不应采用的评测捷径

| 捷径 | 为什么不成立 |
| --- | --- |
| 页面打开就算 GUI 可用 | 必须证明 DevBridge、runtime、stream、session 状态都正确 |
| 工具注册成功就算工具可用 | 必须证明 tool args、progress、result / failure、权限和输出处理 |
| 目录里有 `SKILL.md` 就算 Skill 可用 | 必须证明标准校验、触发、catalog 投影、runtime gate、artifact / evidence 和质量 eval |
| 有 `mcp__*` 工具名就算 MCP 可用 | 必须证明 server lifecycle、capability negotiation、tools/resources/prompts、auth/elicitation、policy、evidence |
| 有聊天正文和工具卡就算运行控制面完整 | Codex 式工作台还要求环境、Git、progress、subagents、sources、goal、permission、model、split review 同屏可观察且可恢复 |
| 模型回复了就算任务成功 | 必须用 outcome 或 artifact / file / browser state 验证结果 |
| 文本里说“已完成”就算完成 | 完成态必须来自 runtime / artifact / evidence facts |
| 单次手工通过就算可发布 | 需要 qcloop / smoke / replay 的可重复证据 |
| 只用 LLM judge | 有明确状态和文件结果时优先代码评分器，开放质量才用模型评分器 |

## 5. 结论

Agent Workspace 的评测不能继续是一张“大功能清单”。正确结构是：

```text
research baseline
  -> domain scorecards
  -> P0 smoke/qcloop manifest
  -> evidence pack
  -> release gate
```

本目录当前完成前两层：调研依据和领域评分卡。
