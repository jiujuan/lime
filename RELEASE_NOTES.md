## Lime v1.57.0

### 新功能
- Agent 运行完成后的 artifact、记忆捕获和文件 checkpoint 现在优先使用时间线中的最终回答文本，避免把中间 reasoning / streaming 片段误当作最终输出沉淀
- Agent 工作区继续完善文件变更、工具过程、内部图片占位、artifact 生成 brief、runtime attachment 和 message phase 等展示与回放边界
- 记忆设置与 runtime metadata 新增更明确的文件 checkpoint、记忆 profile 和 artifact request metadata 链路，为后续可复盘运行闭环提供更稳定的事实源
- 新增 Rust 测试分层入口，提供 `test:rust:unit`、`test:rust:integration`、`test:rust:e2e` 和 `test:rust:layers:stats`，让后端 TDD 与前端分层测试保持一致的工程入口

### 修复
- 修正 Agent message 最终答案、thinking、tool batch 和搜索结果预览的展示归一逻辑，减少内部过程文本、空片段或 provider 错误细节泄漏到用户可见消息
- 修正 Markdown / streaming renderer 在代码块、占位内容和持续输出状态下的渲染边界，提升长回复和工具输出的稳定性
- 修正 Workspace 发送、会话历史、任务中心标签和 Agent runtime error presentation 的状态拼装边界，降低旧状态残留造成的误展示
- 修正专家绑定、记忆 API、artifact protocol 和 OEM cloud access 等回归测试覆盖到的边界行为

### 优化与重构
- 继续把 Agent Chat、App Sidebar、Skills 工作台、Agent Apps、Resource Manager、设置页和 Provider 面板中的复杂 UI 逻辑下沉到 View Model / projection / selector / helper
- 将多个过大的 component suite 拆成按行为边界组织的小套件，保留真实 React DOM / hook / mock 接线回归，同时把可纯化逻辑迁入 `*.unit.test.ts`
- 精简 Agent workspace、Empty State、General Workbench、Chat Sidebar、File Manager、Curated Task Launcher 和 API Key Provider 等组件的职责边界
- 更新测试分层治理文档和路线图，明确前端与 Rust 分层入口、候选统计和不降级 GUI / Bridge 风险的规则

### 测试与质量
- 新增或拆分大量 Agent workspace、Skills、Agent Apps、Resource Manager、Settings、Browser runtime、Capability Drafts 和 App Sidebar 回归测试，保持用户可见行为不因测试治理丢失
- 新增 Rust 测试分层 runner、分类器和统计脚本，并把相关入口写入根脚本、质量文档和 Agent 指南
- 强化 Vitest 分层分类器与 unit/component/contract 回归，继续降低大型 component 测试文件数量
- 补充 Agent runtime final text、request metadata、session execution runtime、message sanitizer、file changes undo、artifact generation brief metadata 等单元和定向回归

### 文档
- 更新 `AGENTS.md`、`internal/aiprompts/quality-workflow.md` 和 `internal/roadmap/test/README.md`，记录 Rust 分层测试入口与前端测试分层治理进展
- 新增 `internal/roadmap/soul/` 规划文档，沉淀 Soul 配置主线的 PRD、架构、验收、图示和 rollout plan

### 其他
- 根应用、Tauri workspace、Tauri 配置、CLI npm package、Agent App runtime package 与锁文件版本统一更新到 `1.57.0`

**完整变更**: `v1.56.0` -> `v1.57.0`
