# Aster Runtime 迁移路线图

状态：in_progress  
创建时间：2026-07-03  
主目标：按 Codex 风格把 Lime Agent Runtime 收敛为一等 workspace crate 分层，停止把 `aster-rust` 当作 Lime current 运行时事实源。

## 结论

`lime-rs/crates/aster-rust` 已从 current crate 区移出，当前 `dead / forbidden-to-restore`；迁移期 Aster 只允许停留在 `lime-rs/vendor/aster-rust`，并通过 root workspace dependency `aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }` 暂时服务 compat adapter。这个状态仍是过渡态：Aster 不能再成为 Lime current runtime 事实源，后续所有 provider、tool、session、event 和 store 能力都必须继续向 Lime-owned crate 收敛。

后续固定方向是：**学习 Codex 的 crate 存放和依赖方式，把 Lime 自己的 runtime 能力拆成平铺的一等 workspace crate；Aster 只作为 `compat vendor / deprecated migration reference`，不再是 current 主链。**

## Codex 对照

参考路径：`/Users/coso/Documents/dev/rust/codex/codex-rs`。

Codex 的关键做法：

1. 一等能力直接平铺在 workspace 根目录，例如 `protocol`、`model-provider`、`exec-server`、`thread-store`、`tools`、`app-server`。
2. `app-server` 负责 JSON-RPC、请求处理和投影，不在顶层重新实现 turn loop、provider 采样、tool execution。
3. `core` / execution / provider / protocol / store 各自有明确 crate owner，而不是把外部 agent framework 整体塞进主 workspace。
4. 兼容或实验能力也有明确 crate，例如 `external-agent-sessions`、`external-agent-migration`，不会伪装成 current runtime。

Lime 应采用同样模式：把 runtime 能力按协议、模型、执行、工具、线程存储和 App Server adapter 拆成一等 crate；不继续让 Aster 类型扩散到多个 current crate。

## 目标架构

建议的 current 分层：

```text
app-server
  -> agent-runtime
  -> agent-protocol
  -> model-provider
  -> tool-runtime
  -> thread-store
  -> runtime-core
```

职责边界：

- `agent-protocol`：稳定 DTO、event、action、thread read、tool call、artifact、evidence 引用，不依赖 Aster。
- `model-provider`：模型路由、provider 请求、能力描述、流式响应归一化，不把 Aster provider 类型外泄。
- `thread-store`：session、thread、turn、message、checkpoint、artifact 持久化，不实现 Aster trait 作为公共边界。
- `tool-runtime`：工具注册、权限检查、执行结果、host tool bridge、MCP bridge，不让 App Server 直接构造 Aster tool registry。
- `agent-runtime`：turn orchestration、queue、subagent、action response、runtime event stream，作为 App Server 的唯一执行入口。
- `app-server`：JSON-RPC、session/read model、artifact/evidence/data-source 投影和受控 adapter，不拥有 Aster 运行语义。

## 分类

### current

- Codex 风格的一等 Lime runtime crate 分层。
- App Server JSON-RPC -> RuntimeCore / Agent Runtime -> read model / evidence / replay 主链。
- Lime 自有 protocol、provider、tool、thread-store、runtime event 类型。

### compat

- 迁移期的 `lime-agent` facade。
- 迁移期的 Aster event -> Lime runtime event 转换器。
- 迁移期的 Aster session / conversation 读取 adapter。
- `lime-rs/vendor/aster-rust`，只服务仍未迁完的 Aster compat adapter。

退出条件：App Server、RuntimeCore、GUI、evidence、replay、tests 均只消费 Lime 自有协议和 runtime crate 后删除。

### deprecated

- `lime-agent` 内仍直接引用 Aster DTO / trait 的 provider、execution、tool、session adapter 面。
- root workspace 仍临时暴露 vendor `aster` 给 `lime-agent` 剩余 compat adapter；假 optional feature 路线已删除，不得恢复。
- `services` / `app-server` 重新直接依赖 `aster::*` 的任何回流；`agent` 内未迁完的 direct Aster 引用继续按 compat/deprecated 面收口。
- 在 App Server runtime backend 内继续扩展 Aster provider、tool、session、streaming loop。

### dead

- `lime-rs/crates/aster-rust/**`：已降级到 `vendor`，不得恢复到 current crate 区。
- 恢复 `lime-rs/src/**` 旧 Tauri command wrapper。
- 新增 `backend_mode=aster` 或第二套 Aster runtime backend。
- 为新能力继续复制 Aster `*_skill_launch`、tool registry、session store 或 provider factory。

## 迁移原则

1. 先定 Lime current crate owner，再迁调用；不要把旧 Aster wrapper 平移成新长期 compat。
2. 新能力只进入 Lime current runtime crate，不进 Aster 或 Aster wrapper。
3. App Server 只依赖 Lime runtime interface，不直接 import Aster 类型。
4. `services` 和 `core` 只承接 Lime 领域模型和 persistence，不实现 Aster 公共 trait。
5. Aster 源码只允许作为迁移参考或短期 vendor，不承担 Lime 业务事实源。
6. 所有迁移必须配守卫：Cargo 依赖守卫、源码 import 守卫、App Server runtime boundary 守卫。

## 配套文档

- [./aster-runtime-codex-style-migration-plan.md](./aster-runtime-codex-style-migration-plan.md)：分阶段迁移计划、验收标准和验证入口。
- [./phase5-vendor-downgrade-plan.md](./phase5-vendor-downgrade-plan.md)：Aster vendor 降级与最终删除退出条件。
- `internal/roadmap/agentruntime/README.md`：AgentRuntime 主链事实源。
- `internal/roadmap/appserver/app-server-aster-runtime-boundary-governance.md`：现有 App Server / Aster 边界治理记录。
- `internal/aiprompts/governance.md`：current / compat / deprecated / dead 分类规则。
