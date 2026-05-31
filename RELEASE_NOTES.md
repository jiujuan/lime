## Lime v1.55.0

### 新功能
- Agent Chat 新增更稳定的 action required 恢复链路，已提交、排队和回放的确认请求会保留状态并可继续绑定到真实 runtime action
- 前端测试入口新增按层运行能力：`test:unit`、`test:component`、`test:contract`、`test:integration`、`test:e2e`、`test:layers:stats` 和 `test:frontend:all`

### 修复
- 修正会话切换、session restore、metadata sync、finalize 后持久化和 snapshot 同步中的状态边界，减少 Agent Chat 恢复时的丢状态与重复调度风险
- 修正 fallback action response 与 replayed action required 的映射边界，避免用户确认被错误丢弃或无法继续提交
- 修正 live Provider smoke 测试文件识别规则，支持 `*.live.test.*`、`*.live.spec.*` 及常见分隔符命名

### 优化与重构
- 将 Agent Chat 页面壳、工作区壳、自动标题、会话恢复、会话主题和 Harness 状态面板的展示决策拆到 View Model，降低大型 React 组件和 hook 的状态耦合
- 精简 `useAgentSession`、`useAgentTools` 和 `useAsterAgentChat` 中的内联状态逻辑，让恢复、切换、提交和收尾路径更容易定向验证
- 移除旧的 `benchmarks/lime-agent-runtime` 任务样例，避免已废弃 benchmark 面继续被误认为当前 Agent runtime 发布证据

### 测试与质量
- 新增 Vitest 分层分类器、分层运行器和分层统计报告，并补齐对应单元测试
- 新增 Agent Chat 多个 View Model 和 action state 的单元回归，覆盖工作区壳状态、自动标题、会话恢复、会话主题、Harness 状态面板和 fallback action 流程
- 更新质量工作流与单元测试文档，明确 TDD 快速入口与 GUI smoke / 全量前端验证的边界
- 发布门禁覆盖版本一致性、前端分层回归、契约检查、GUI smoke 和 release tag 工作流

### 文档
- 新增 `internal/roadmap/test/README.md`，记录前端测试分层治理路线图与迁移口径
- 更新 `internal/aiprompts/quality-workflow.md` 与 `internal/test/unit-tests.md`，把测试分层作为当前质量工作流的一等入口

### 其他
- 根应用、Tauri workspace、Tauri 配置、CLI npm package 与锁文件版本统一更新到 `1.55.0`

**完整变更**: `v1.54.0` -> `v1.55.0`
