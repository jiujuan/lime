## Lime v1.79.0

### 新功能

- 浏览器 Runtime 与 Right Surface 工作台进入 current 主链：新增 App Server `browserSession/*` 协议、Electron embedded browser host、画布浏览器面板、右侧 Surface 浏览器面板、下载架、上下文菜单和会话状态投影。
- Claw 工作台支持浏览器辅助与产品资料协同：浏览器会话、产品 profile artifact document、worker evidence、文档版本和保存证据可以进入同一条 Workspace / Evidence Pack 链路。
- Agent App 安装与启动链路补齐发布证据：新增 cloud release evidence、release signature、readiness issue 分类、launch target control / persistence 与 Agent App 任务 worker 接线。
- App Server protocol / npm client 扩展浏览器会话、runtime event append、Agent App host lifecycle snapshot/list 与 UI runtime status 形状，并同步生成 Rust schema 与 TypeScript protocol types。
- Claw streaming 渲染增加结构化内容时间线、web retrieval process、text delta lifecycle 与 content part ordering，支持 reasoning / tool / web search / final answer 更稳定地按生命周期展示。

### 修复

- 修复浏览器辅助与 Right Surface 之间缺少可追踪会话引用的问题，Workspace 现在通过 browser session ref、intent、control mode 和 runtime navigation 统一驱动右侧浏览器 Surface。
- 修复 Agent App 云端安装只展示入口、不展示发布可信度的问题，安装评审现在可以呈现签名、发布证据和 readiness issue。
- 修复 WebSearch / WebFetch、reasoning 与最终正文在流式和历史恢复之间顺序不一致的问题，投影逻辑改为依赖结构化 sequence / provenance，而不是展示文案正则。
- 修复 artifact document 保存后 Evidence Pack 缺少可审计文档版本的问题，App Server runtime 增加 artifact document versions 与 product profile artifact document projection。
- 修复 Browser Runtime manager 过度集中导致会话生命周期、target 读取、事件流与 evidence 输出难以隔离测试的问题，拆分为按职责聚合的子模块。

### 优化与重构

- `lime-rs/crates/agent/src/request_tool_policy.rs` 拆分为 auto compaction、runtime status、stream diagnostics、stream idle、text batching、web search preflight / tracker 与 web retrieval process 子模块，中心文件只保留调度边界。
- Browser Runtime manager 拆分为 CDP targets、session、session events、session lifecycle、session reader 与 session stream，降低单文件职责和回归维护成本。
- App Server runtime 新增 browser session processor/runtime、browser evidence provider、product workspace/profile projection 与 artifact document projection，继续把 GUI 证据主链收敛到 App Server current owner。
- Agent Chat 前端继续把历史合并、content part timeline、stream completion、text delta lifecycle、Right Surface runtime projection、browser assist control 和 product profile model 抽到可测纯模块。
- Claw current fixture 脚本继续模块化，补齐 product profile content factory、browser/right surface visual、web tools waits、scenario assertions 与 code artifact workbench fixture 支撑。

### 测试与质量

- 新增 / 扩展 Browser Runtime API、embedded browser host、browser session protocol、browser panel、Right Surface browser panel、browser assist control、browser runtime navigation 与 workspace browser session ref 回归。
- 新增 / 扩展 Agent App release evidence、release signature、readiness issue classification、launch target persistence、Agent Apps page view model 与 cloud bootstrap / install review 测试。
- 新增 / 扩展 streaming content part order、projection guard、text delta lifecycle、content timeline、web retrieval projection、MessageList reasoning flow / persistence 与 stream runtime handler 回归。
- 扩展 App Server protocol catalog、generated schema、app-server-client request methods、contract guard 与 release manifest 相关校验。
- 五语言 i18n 资源同步覆盖 Agent、Agent Runtime 与 Workspace 新增可见文案。
- 本版发布事实源更新到 `1.79.0`：根应用、Rust workspace、CLI npm package、App Server client package、Cargo lock 与 Aster 子工作区 lock。

### 文档

- 新增 Claw streaming rendering correctness 文档，明确 content part provenance、lifecycle、tool / reasoning / final answer 排序边界。
- 新增 traceable agent acceptance 方法论与论文草稿，沉淀可追踪验收证据口径。
- 新增 Browser Runtime / Right Surface 执行计划与浏览器路线图，记录浏览器会话、右侧 Surface、Evidence Pack 与回归门禁。
- 更新质量流程、执行计划索引、Agent App Host v3 实施计划与脚本目录说明，保持发版候选范围可追踪。

### 其他

- 本版继续把浏览器辅助、Agent App 发布证据、Claw streaming 展示、产品资料工作台和 Evidence Pack 收敛到 App Server JSON-RPC / RuntimeCore / Electron Desktop Host current 主链；旧 mock fallback、旧并行事件消费路径和未结构化展示文案不作为新增能力入口。

**完整变更**: `v1.78.0` -> `v1.79.0`
