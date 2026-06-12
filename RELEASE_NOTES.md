## Lime v1.67.0

### 新功能
- Agent Workbench v2 可执行协议内核落地到主仓：sequence verifier、runtime event pipeline、middleware / adapter、`state.delta` schema 与 projection apply 形成一条可机械校验的事件处理链。
- App Server / RuntimeCore 在事件入库前增加 AgentUI runtime event、`state.delta` 与 sequence gate，坏流会 fail closed，不再污染 session state、turn status 或 outbound notification。
- Runtime / Provider capability manifest 与 resume contract 进入 contracts、App Server protocol、RuntimeCore 与前端 current gateway，`capability/list` 可返回运行时能力声明，thread resume 可携带并校验 resume contract。
- Agent Runtime client 支持 `0..N` 事件 fan-out、flush substrate、schema compatibility middleware 与 sessionGateway browser-safe pipeline，Claw / Agent App current event gateway 统一消费 pipeline 输出。
- Task Center 增加 Project Shell 面板与 Electron / App Server project shell current 命令链，支持启动、写入、resize、kill、drain events 和多标签终端工作流。

### 修复
- 修复 runtime event 只做逐事件 schema 校验、缺少跨事件状态机约束的问题，覆盖 tool/action/model/turn 终态配对与终态后执行流污染。
- 修复 `state.delta` patch 失败可能污染 projection / read model 的风险，失败时进入 stale hydration diagnostics，并保留原目标 state。
- 修复 Agent Runtime pipeline 在 App Server notification、本地 publish、bridge listener 与 Agent App runtime client 之间的分散接线，减少坏流在不同入口表现不一致的问题。
- 修复 App Sidebar 最近会话、Agent thread resume、Chat navbar、Workspace conversation scene 与 Task Center tab 状态的一批同步和回归覆盖缺口。

### 优化与重构
- Agent Workbench 路线图从 v0.4 推进到 v2.10，明确 v2.11 后续聚焦 projection reconciliation、tool args buffer、reasoning continuity 与外部 transport compatibility。
- `@limecloud/agent-ui-contracts` 扩展 capability / resume contract、sequence verifier、schema constants 与 validation API，协议约束从文档规则收敛为可执行合同。
- `@limecloud/agent-runtime-projection` 增强 fixture replay、read model、runtime status、subagents 与 `state.delta` apply，batch 与 incremental projector 共用同一归并语义。
- `@limecloud/agent-runtime-client` 增强 event pipeline、event verifier、runtime client 与 session gateway，减少 GUI、SDK 与 Agent App 之间的重复接线。
- App Server protocol schema、TypeScript app-server-client 与治理目录同步新增 project shell、runtime capability manifest、resume contract 与 thread resume 形状。

### 测试与质量
- 扩展 Agent UI contracts、runtime projection、runtime client、app-server-client 与 Agent App current runtime 的定向回归，覆盖 bad stream fail-closed、fan-out / flush、capability manifest 与 resume contract。
- 扩展 Rust App Server runtime / protocol / schema gate 测试，覆盖 event schema gate、sequence gate、`state.delta` 校验和 project shell processor 路径。
- 扩展 Task Center shell terminal、utility toolbar、Workspace main area、App Sidebar conversations、Chat navbar、MessageList 与 streaming renderer 回归。
- 根应用、Rust workspace、CLI npm package、App Server client package、Agent Runtime client 依赖与锁文件版本统一更新到 `1.67.0`。
- 发布版本一致性通过 `npm run verify:app-version` 校验。

### 文档
- 新增 `internal/roadmap/agentworkbench/v2.md`，记录 Workbench v2 可执行协议内核、AG-UI 机制取舍、v2.0-v2.11 分阶段范围与完成判定。
- 更新 Agent Workbench README，登记 v2.0-v2.10 完成状态、current event gateway、Rust/App Server schema + sequence enforcement、capability / resume contract 与后续下一刀。

### 其他
- 本版继续把运行时事实源收敛到 App Server JSON-RPC、RuntimeCore、Electron Desktop Host、current npm clients、checked-in schema 与机器可读守卫，避免协议规则只停留在文档或 GUI 下游投影层。

**完整变更**: `v1.66.0` -> `v1.67.0`
