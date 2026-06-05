# Agent Tools 批次覆盖矩阵

## 目标

本矩阵用于判断“所有批次任务”是否已经覆盖到当前事实源，而不是只凭批次数量判断完成。事实源优先级：

1. `lime-rs/src/agent_tools/catalog.rs`
2. `src/lib/tauri-mock/runtimeToolInventoryMocks.ts`
3. `src/components/agent/chat/utils/toolDisplayInfo.ts`
4. 已落地的批次文档与验证记录

状态说明：

- `covered`：已有批次文档、分类、测试计划与至少一组定向验证记录。
- `partial`：已有零散测试或文档提及，但缺少独立批次或证据不完整。
- `gap`：当前事实源可见，但尚无批次文档。

## Rust Catalog 覆盖

| 工具 / 工具族                                                                                              | 生命周期 | 批次 | 状态    | 备注                                       |
| ---------------------------------------------------------------------------------------------------------- | -------- | ---- | ------- | ------------------------------------------ |
| `Read / Write / Edit / NotebookEdit / view_image / Glob / Grep`                                            | current  | 01   | covered | 文件搜索与工作区 I/O                       |
| `Bash / PowerShell / TaskOutput / TaskStop / Sleep`                                                        | current  | 02   | covered | shell / 后台任务展示；gate 补充见 Batch 06 |
| `WebSearch / WebFetch / browser* / mcp__lime-browser__*`                                                   | current  | 03   | covered | 通用网页搜索、抓取、浏览器工具             |
| `Agent / SendMessage / AskUserQuestion / SendUserMessage / TeamCreate / TeamDelete / ListPeers / PlanMode` | current  | 04   | covered | Agent / Team / HITL 基础交互               |
| `Skill / Workflow / ToolSearch / ListMcpResourcesTool / ReadMcpResourceTool / dynamic MCP`                 | current  | 05   | covered | 动态 MCP 泛化分类仍有结构化字段后续项      |
| `Config / CronCreate / CronList / CronDelete / RemoteTrigger / EnterWorktree / ExitWorktree / LSP`         | current  | 06   | covered | gated 注册与历史展示                       |
| `TaskCreate / TaskList / TaskGet / TaskUpdate`                                                             | current  | 07   | covered | 结构化任务板                               |
| `approval_request / request_user_input`                                                                    | current  | 08   | covered | action approval / HITL timeline            |
| `ViewImageTool / analyze_image`                                                                            | current  | 09   | covered | 视觉与图片查看                             |
| `lime_create_*_task / social_generate_cover_image / GenerateImage`                                         | current  | 10   | covered | 内容工作台与媒体任务                       |
| `lime_site_* / lime_search_web_images`                                                                     | current  | 11   | covered | Browser Assist / Site Tools                |
| `lime_run_service_skill`                                                                                   | compat   | 11   | covered | 只保留历史展示和恢复                       |
| `StructuredOutput / SyntheticOutputTool`                                                                   | current  | 12   | covered | 最终答复协议残留清理                       |

## 前端动态展示面覆盖

| 工具 / 工具族                                                     | 来源                         | 批次 | 状态    | 备注                                              |
| ----------------------------------------------------------------- | ---------------------------- | ---- | ------- | ------------------------------------------------- |
| `SearchQuery / ImageQuery`                                        | provider / external tool     | 13   | covered | 已覆盖展示标签、主体对象、过程摘要与批次折叠      |
| `finance / weather / sports / time`                               | provider / external data     | 13   | covered | 已证明结果摘要和主体对象不丢，且不混成 WebSearch  |
| `resolve_library_id / query_docs`                                 | Context7 docs tool           | 13   | covered | 已归入探索摘要，不作为普通网页来源                |
| `MCPTool / McpAuthTool / REPLTool / ListSkills / LoadSkill`       | compat / dynamic display     | 14   | covered | 已覆盖展示标签、过程摘要和辅助步骤批次吸收        |
| `WaitAgent / ResumeAgent / CloseAgent`                            | compat / subagent display    | 14   | covered | 已覆盖子任务控制语义、主体对象和历史预览相邻测试  |
| unknown dynamic tools matched by family keywords                  | frontend fallback classifier | 15   | covered | 已覆盖动态 MCP read/list/search/browser/mutation  |
| provider trace / runtime error / empty final reply after tool use | runtime outcome              | 15   | covered | 已覆盖空 final、工具产物软完成、provider 503 失败 |

## 最终 Audit

状态：`covered`

证据：`internal/exec-plans/agent-tools-test-batches/final-audit.md`
