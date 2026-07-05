# Aster 能力接收策略

状态：in_progress  
创建时间：2026-07-05  
路线图：`internal/roadmap/astermigration/README.md`

## 结论

Aster 框架里的 agent、provider、tool、session、permission、MCP、skills 等能力有参考价值，但不能因此继续把 Aster 作为 Lime current runtime 事实源。正确策略不是“因为有用所以保留整套 Aster”，也不是“把 vendor 当垃圾粗暴清空”，而是按能力逐项接收：

1. 需要进入 Lime 产品主链的能力，迁到 Lime-owned current crate。
2. 已迁能力从 vendored Aster 删除，并用守卫阻止回流。
3. 暂时还没 owner 的能力只允许作为 `compat` / `deprecated` adapter 存活，并写清退出条件。
4. 只具参考价值、尚未产品化的能力进入 backlog，不允许用来延续 root `aster` dependency。

一句话事实源声明：**Aster 可以是迁移参考和短期 compat vendor，但 Lime Agent Runtime 后续只允许向 `agent-runtime`、`agent-protocol`、`model-provider`、`tool-runtime`、`thread-store` 与 App Server JSON-RPC current 主链收敛。**

## 分类口径

| 分类                           | 含义                                    | 允许动作                                             | 禁止动作                                               |
| ------------------------------ | --------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| `current-needed`               | Lime 当前主链需要，且产品能力必须落地   | 迁入 current crate，补测试和守卫，再删 vendor 副本   | 继续让 App Server 或 current crate 直接消费 Aster 类型 |
| `valuable-reference`           | Aster 实现有价值，但 Lime 暂未产品化    | 记录设计参考、测试场景和未来 owner                   | 保留 root Aster dependency 只为了“以后可能会用”        |
| `already-migrated / duplicate` | Lime current owner 已存在               | 删除 vendored 重复实现，补 forbidden-to-restore 守卫 | 在 vendor 里保留第二份可演进实现                       |
| `compat-blocker`               | 仍被 `lime-agent` 迁移 adapter 真实依赖 | 收敛到单一 adapter，写退出条件和下一刀               | 扩展为新业务入口或把 adapter 当长期架构                |
| `dead`                         | 已无 current 入口或已被替代             | 删除代码、测试、依赖、文档引用，补守卫               | 恢复旧路径、旧 public re-export 或旧 feature           |

## 能力接收矩阵

| Aster 能力面                | 价值判断                                                        | Lime current owner                                         | 当前状态                                                                   | 迁移规则                                                                                         | 删除条件                                                                                             |
| --------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `agents` / turn loop        | 有价值，包含 agent run loop、stream event、subagent 编排经验    | `agent-runtime` + `agent-protocol`                         | `compat-blocker`，`lime-agent` 仍有 adapter 依赖                           | 先迁 event/action DTO 与 turn executor 边界，再让 App Server 只调 Lime runtime interface         | `lime-agent` 不再 import Aster agent/session 类型，root `aster` dependency 可删                      |
| `providers` / reply loop    | 有价值，包含 provider registry、reply stream、CLI provider glue | `model-provider`                                           | `compat-blocker`，reply/provider adapter 仍在 `lime-agent`                 | 迁 provider request/response/stream DTO 和 runtime provider adapter；Aster provider 只留边界转换 | `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 退场 |
| `tools` / registry executor | 有价值，包含 registry、tool context、执行错误、host tool bridge | `tool-runtime`                                             | `tool_orchestrator` registry adapter 已删除；Aster reply loop native tool registry 仍 `compat-blocker` | 已迁 shell/path/process/WebFetch/WebSearch 能力继续从 vendor 删除；下一步迁 reply loop 内工具注册壳 | Aster reply loop 不再需要 WebFetch/WebSearch `Tool` trait adapter，vendor tool runtime 重复实现清空 |
| `session` / thread store    | 有价值，包含 session、thread、turn、message、runtime snapshot   | `thread-store` + `agent-protocol`                          | `compat-blocker`，`aster_session_store` 仍是迁移 facade                    | 迁 read model、runtime snapshot、session persistence DTO；Aster trait 实现只在最后适配层         | `aster_session_store`、session/subagent runtime snapshot adapter 全部删除                            |
| `permission` / policy       | 有价值，特别是 shell/tool 权限模型和 policy metadata            | `tool-runtime` + runtime policy service                    | 部分 `already-migrated / duplicate`                                        | current policy DTO、preflight、shell permission 是唯一 owner；vendor 同类实现迁完即删            | Aster permission check 不再参与生产 preflight                                                        |
| `mcp`                       | 有价值，但 Lime 是否产品化要单独判断                            | `tool-runtime` 或独立 MCP bridge crate                     | `valuable-reference` / 待盘点                                              | 先定义 Lime MCP tool contract，再决定是否迁实现                                                  | 无 current 产品入口时不得保留 root Aster dependency                                                  |
| `skills`                    | 有价值，涉及 skill discovery、enablement、runtime launch        | `agent-runtime` + `tool-runtime` + App Server skill APIs   | `compat-blocker` / 部分 `valuable-reference`                               | 先迁产品需要的 skill enable/search/launch contract，不复制整套框架                               | App Server skill 主链不再经过 Aster skill runtime                                                    |
| `scheduler`                 | 仅部分参考，Lime 已有 scheduler crate                           | `lime-scheduler` + `agent-protocol`                        | 大部分已迁，`already-migrated / duplicate`                                 | 保持 scheduler 不依赖 Aster；只把缺失 DTO 迁入 protocol                                          | `scheduler` crate Aster import 守卫持续通过                                                          |
| `hooks`                     | 有价值，但要和 App Server / Desktop Host hook 主链对齐          | App Server hook runtime + `tool-runtime` process execution | `valuable-reference` / 待盘点                                              | 只迁真实产品 hook 能力，避免恢复 Aster backend mode                                              | hook 执行不需要 Aster tool/session context                                                           |
| memory / context            | 有价值，涉及 context window、memory tool、thread metadata       | `agent-protocol` + `thread-store` + App Server memory APIs | 部分已迁，剩余待盘点                                                       | wire DTO 进入 protocol，持久化进入 store，tool glue 进入 current runtime                         | memory/context 生产入口无 Aster import                                                               |
| tests                       | 有价值，不能盲删                                                | 对应 current owner 的 Rust / governance tests              | 部分迁移中                                                                 | 行为测试先迁到 current owner，再删 vendor test；只删除已经被 current tests 覆盖的 vendor tests   | vendor 对已迁能力不再保留第二份行为测试                                                              |

## 不偷工减料的迁移规则

每个能力面必须按同一套退出条件推进：

1. 先定义 current owner 和 public contract。
2. 批量迁调用，不逐行堆兼容壳。
3. current owner 补最贴近边界的行为测试。
4. vendor 中对应实现、public re-export、测试和 direct dependency 同步删除。
5. `src/lib/governance/asterMigrationBoundary.test.ts` 补 forbidden-to-restore 守卫。
6. 更新本路线图进度，明确整体完成度不能因局部清理虚高。

不满足这些条件时，只能标记为 `compat-blocker` 或 `valuable-reference`，不能宣称迁移完成。

## 下一刀优先级

1. `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs`：迁 provider/reply stream contract 到 `model-provider` 或 `agent-runtime`，减少 reply loop 对 Aster 的直接依赖。
2. Aster reply loop 内 native tool registry / WebFetch / WebSearch `Tool` trait adapter：迁到 `tool-runtime` current executor，让 shell/path/process/Web 工具已迁能力真正脱离 Aster `Tool` trait 注册壳。
3. `aster_session_store`、session/subagent adapters：迁 session/thread/runtime snapshot 到 `thread-store`，为删除 Aster `SessionStore` trait 实现创造条件。

这三条优先级高于继续清理零散 helper。原因是它们直接阻塞 Phase 6：根 workspace 删除 `aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }`。

## Vendor 保留规则

vendored Aster 目录只能保留仍被 `lime-agent` compat adapter 编译依赖的代码。对已经迁入 Lime current owner 的能力，vendor 必须继续搬空：

- `already-migrated / duplicate`：直接删除 vendor 副本、测试和依赖。
- `compat-blocker`：只保留最小编译面，不能新增 public wrapper。
- `valuable-reference`：不作为编译依赖保留；需要长期研究时，把设计记录到路线图或 issue 级文档。

因此，“Aster 框架有用”的结论不会改变删除方向；它只改变删除方式：先接收能力，再删除事实源，而不是把有价值代码和 current dependency 绑定在一起。
