## Lime v1.59.0

### 新功能
- 新增 App Server 本地 JSON-RPC runtime 服务骨架，为 Lime Desktop 和独立应用提供统一的 Agent session、turn、事件、action、artifact 与 evidence 协议边界
- 新增 App Server TypeScript client，独立应用可通过 typed connection 发起 session、提交 turn、取消 turn、响应 action，并消费 `agentSession/event` 通知
- 新增 App Server sidecar 启动与生命周期能力，支持 packaged resources manifest、平台 artifact 选择、sha256 校验、初始化握手和事件路由
- 新增 standalone App Server app policy source，独立 App 可通过 JSON policy manifest 注入 scoped capabilities，并用 `--app-policy` 约束 capability discovery
- 新增 standalone external backend 配置入口，允许 App Server 通过外部进程 backend 承接 host-independent turn / cancel / action 响应原型
- Desktop Agent runtime 主路径开始接入 in-process App Server adapter，现有 Tauri command 兼容入口可通过 JSON-RPC 路径提交 Agent turn
- App Server 协议新增 `capability/list`、`artifact/read`、`evidence/export` 与 `agentSession/action/respond`，为独立 App 的能力发现、产物读取、证据导出和审批响应打通基础链路

### 修复
- 修正 App Server 路径下 turn id、`queueIfBusy`、`skipPreSubmitResume` 与旧 Aster 请求参数的传递边界，降低迁移过程中运行参数丢失或 ID 不一致的风险
- 修正 Desktop direct event bridge 的 session / turn 作用域和终态事件清理逻辑，避免事件重复写入或监听残留
- 修正 capability discovery 的 session、workspace 与 runtime enable 过滤逻辑，只把可执行能力投影到 `agentSession/turn/start`
- 修正 artifact 读取和 evidence 导出 read model 的分页、内容状态和 provider 注入边界，让独立 App 读取运行结果时不依赖 UI 推断

### 优化与重构
- 将 Agent runtime 服务化为 `RuntimeCore`、`ExecutionBackend`、`AsterBackend` 和 host adapter 分层，减少 Tauri command glue 继续承载业务逻辑
- 新增 `app-server-protocol`、`app-server-transport`、`app-server`、`app-server-client`、`app-server-daemon`、`app-server-test-client` crate 家族，统一协议、transport、server、client 和测试边界
- 将 runtime queue、stream、projection、managed objective continuation 与 event 输出拆到 host ports，便于 App Server 和 Desktop 共享同一执行主链
- 将 runtime turn 的 Desktop host 依赖收敛到 `RuntimeTurnHostContext`，减少执行链路中散装传递 AppHandle、DB、配置和服务状态
- 保持 `app-server` 公共 crate 不直接依赖 Tauri，Aster 私有 DTO 不上浮到公共 JSON-RPC 协议

### 测试与质量
- `npm run test:contracts` 新增 App Server client / protocol contract 检查，覆盖 Rust 协议、router、runtime、Desktop adapter、TypeScript client 和 sidecar helper 的关键一致性
- 新增 `app-server:manifest` 与 `app-server:manifest:test`，用于生成和验证 App Server sidecar release manifest
- 新增 `smoke:app-server-stdio`，覆盖 app-server binary 的 stdio JSON-RPC 初始化、session 和 turn 基础链路
- 新增 `smoke:app-server-sidecar-lifecycle`，覆盖 packaged manifest、sha256 校验、sidecar 启动、连接和生命周期恢复路径
- 补充 app policy manifest、external backend、standalone CLI 参数和 factory 注入的 Rust 回归
- 补充 App Server Rust 单测、host boundary guard、TypeScript client 单测和 renderer-safe API 回归
- 根应用、Tauri workspace、Tauri 配置、CLI npm package、Agent App runtime package、App Server client package 与锁文件版本统一更新到 `1.59.0`

### 文档
- 新增 `internal/roadmap/appserver/` 路线图、PRD、架构、协议、时序、流程图、服务抽取、独立应用接入和 Electron 迁移规划
- 新增 App Server 实施计划，记录 P0 到 P3.61 的执行状态、事实源分类、验证入口和后续退出条件
- 新增 `packages/app-server-client/README.md`，说明独立 App 通过 TypeScript client 和 sidecar 接入 App Server 的推荐方式
- 更新工程导航、命令边界、治理和服务文档，将跨 App Agent runtime 收敛到 App Server current 主路径

### 其他
- 新增 App Server 发布 manifest 生成脚本和 packaged sidecar 默认资源路径约定，为后续独立 App 分发 App Server binary 做准备

**完整变更**: `v1.58.0` -> `v1.59.0`
