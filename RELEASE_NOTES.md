## Lime v1.56.0

### 新功能
- Harness 状态面板新增更完整的问题证据包、handoff bundle、replay case、review decision、文件审阅、输出信号、工具库存和 runtime facts 展示入口，便于把一次真实 Agent 运行沉淀为可复盘证据
- Agent 输入栏收敛到统一的 `react` runtime 主链，移除前置 execution strategy / thinking / web search 选择面，让搜索、推理强度和工具调用回到模型按任务复杂度判断

### 修复
- 修正 legacy `auto` / `code_orchestrated` 执行策略在前端、metadata 和 Rust turn context 中的归一边界，避免旧策略继续污染 current submit payload
- 修正 Agent runtime 状态提示中搜索、浏览器、推理和协作能力的描述，让状态条与当前工具面和 runtime 策略保持一致
- 修正输入栏发送 payload 的参数边界，避免已由 session/runtime 承接的 thinking、web search 和 execution strategy 重复写入提交请求

### 优化与重构
- 将 Harness 状态面板从单个大型组件拆分为 section、shell、primitive、preview dialog、handoff export、tool inventory、file review 和 output signal 等独立模块
- 将 Harness 展示逻辑继续下沉到 View Model / selector / helper，覆盖文件审阅、diff summary、输出信号、文本路径识别、工具库存、runtime facts、handoff / evidence / replay / analysis artifact 等纯展示分支
- 精简 Workspace、Inputbar、Agent Chat session、自动标题、任务中心 draft 和发送链路中的状态拼装逻辑，降低 React 组件和 hook 的业务耦合

### 测试与质量
- 强化 Vitest 分层分类器：显式低风险后缀不能掩盖 React/jsdom、DevBridge/Tauri、文件系统、网络或 Playwright 等更高风险边界
- `test:layers:stats` 新增 component unit-migration candidates 输出，用例数量、文件大小和业务逻辑关键词会提示后续应继续抽 VM 的组件测试
- 更新本地与 CI 质量口径：PR 快速门禁聚焦 `lint`、`typecheck`、`test:unit`、`test:contract`，`main` / 手动触发继续覆盖全量前端、Rust 和 GUI smoke
- 新增与更新 Harness、Inputbar、Workspace、Agent runtime、测试分层和协议提交链路的单元 / 组件 / 契约回归

### 文档
- 更新 `AGENTS.md`、`internal/aiprompts/quality-workflow.md` 与 `internal/test/unit-tests.md`，明确新前端逻辑必须优先抽到 View Model / projection / selector / helper 并由 `*.unit.test.ts` 覆盖
- 更新 `internal/roadmap/test/README.md`，记录前端测试分层治理统计、Harness 拆分进展和防回流规则

### 其他
- 根应用、Tauri workspace、Tauri 配置、CLI npm package 与锁文件版本统一更新到 `1.56.0`

**完整变更**: `v1.55.0` -> `v1.56.0`
