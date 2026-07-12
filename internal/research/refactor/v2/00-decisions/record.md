# v2 裁决记录

> status: current decision record
> owner: runtime-architecture
> last_verified: 2026-07-12
> sources: `AGENTS.md`, `internal/aiprompts/architecture.md`, `internal/aiprompts/governance.md`

## D1：GUI 是产品事实源

Lime 是桌面 GUI。Codex TUI 只提供状态机、typed facade、projection 和测试纪律；不得复制 TUI widget、终端布局、CLI auth、`CODEX_HOME` 或 rollout 文件路径。GUI 的信息架构、工作台、附件、artifact、i18n 和 Electron 交互由 Lime current 负责。

## D2：Codex runtime 直接复制优先

Codex 已验证且不依赖 CLI 产品假设的模块，优先复制到 Lime 既有 current crate，并保留上游测试/fixture。禁止先写一套“等价 Lime 版本”再长期双轨。复制前必须记录：上游路径、commit、许可证、依赖差异、目标 owner 和删除旧实现的条件。

## D3：OpenCode 只扩展模块参照，不接管 Agent loop

允许参考 OpenCode 的 package ownership、schema/client/domain 分层和 provider-neutral LLM 代数。禁止复制 OpenCode Session V2、工具执行器、权限循环、Solid UI、HTTP/OpenAPI protocol 或 Bun/Effect runtime；这些边界由 Codex + Lime current 决定。

## D4：研发期不保留兼容双轨

仓库没有外部用户。`compat` 只能在同一变更集内短暂存在并在迁移后删除，不能作为 v2 目标状态。`deprecated` 只允许迁出，`dead` 直接删除。旧名称不能因为协议“暂时不改”而继续成为新代码 owner；需要改协议时直接改并同步 schema、client、GUI 和 fixture。

## D5：一个能力一个 owner

```text
Desktop Host       -> 窗口、IPC、系统能力、sidecar 生命周期
App Server          -> JSON-RPC、请求编排、read model/evidence 接线
agent-runtime       -> Thread/Turn 生命周期、队列、取消、恢复
RuntimeCore         -> provider-neutral request/content/event/context
model-provider      -> provider route、capability、wire lowering、stream parse
tool-runtime        -> tool definition、权限、执行、MCP、结果归一
thread-store        -> Thread/Turn/Item 持久化、分页、恢复
Renderer projection -> GUI 显示模型和局部交互状态
```

任何无法归入上述 owner 的新模块先暂停设计，不以 `misc`、`services` 或巨型 facade 吞掉问题。

## D6：当前代码优先于 v1 gap 表

v1 是历史研究材料，不是当前事实源。当前代码已经有 `app-server-protocol/src/protocol/v0/catalog.rs` 的 method/scope catalog；v2 不再把它标为“尚未存在”，而是审计其是否过大、是否可拆、是否真正派生 schema/client。

## D7：删除必须包含回流守卫

删除旧路径时同步删除正向引用、catalog、mock、fixture、文档导航和用户可见文案；保留一个窄的负向扫描/结构测试，证明旧入口不会重新进入生产构建图。不能用“历史文档”作为 current 链路的隐式依赖。

## D8：证据不可变，状态单一汇总

每次验证记录 commit、命令、结果和 scope；证据文件不可覆盖。当前完成度由一个汇总表引用证据，不在长事件日志中反复改写“已完成/未完成”。失效链接和过期 source commit 是 v2 的硬失败。

## 非目标

- 不把 Codex rollout JSONL 变成 Lime runtime store。
- 不把 OpenCode 的 Session/Tool/UI/Effect 技术栈迁入 Lime。
- 不在 Electron 增加业务后端或 provider/tool fallback。
- 不为了“未来兼容”保留第二套 Thread、Turn、Item、projection 或 provider mapper。
- 不在本目录直接实施产品代码；代码变更必须从 `12-plan` 切片产生并写入 `internal/exec-plans/`。

## 未决但有边界的问题

| 问题 | 默认决定 | 解除条件 |
| --- | --- | --- |
| Lime 协议是否从 `agentSession/*` 改为 `thread/*` | 研发期直接迁移到 Codex 语义，优先改名 | S1 统计所有 current consumer 后一次性切换 |
| 是否直接复制 Codex `ThreadStore` | 复制 trait、分页和 materialization 语义；存储实现接 Lime repository | 完成许可证、SQLite schema 和路径审计 |
| GUI 是否引入独立 package | 只有两个以上独立 consumer 才抽 package | 先完成 projection 纯化和依赖图 |
