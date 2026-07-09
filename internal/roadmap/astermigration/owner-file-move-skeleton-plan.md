# Aster Owner 文件移动骨架计划

状态：in_progress  
创建时间：2026-07-09  
关联路线图：`internal/roadmap/astermigration/README.md`  
关联执行计划：`internal/roadmap/astermigration/aster-capability-intake-execution-plan.md`

## 目标

把已经从 `vendor/aster-rust` 搬出的 Aster 文件按 Lime 现有 owner 归位，而不是保留一个新的大 `agent-compat` 包。骨架迁移先完成文件归属和边界收缩，细节迁移再按 owner 批量消化。

固定口径：

- Codex 有的能力：迁到 Lime current owner，并接入 App Server、前端、Evidence 或 runtime 至少一条真实消费链。
- Codex 没有的 Aster-only 能力：删除并补 forbidden-to-restore 守卫。
- `agent-compat` 只允许保留仍被 `lime-agent` 生产 `use aster::...` 命中的最小 blocker。
- `agent-compat` 是待迁出 staging，不是 owner；每个保留文件都必须有迁往 current owner 或删除的退出条件，Phase 6 完成后删除 root `aster` alias 与 `crates/agent-compat*`。
- `agent-compat` 现存指向 current owner 的依赖只允许作为 burn-down allowlist，不能再新增 owner 依赖，也不能通过反向依赖 `agent-runtime` / `agent-protocol` / `thread-store` / App Server 来伪装迁移完成。
- 不能把 `agent-compat` 当成新的 current crate，也不能把 reference 文件编进 current owner 冒充完成。

## Owner 映射

| Aster 源路径                                       | 目标 owner                                     | 本轮策略                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `agents/**`                                        | `agent-runtime`                                | 先迁出已无生产引用的子能力；`Agent` / `AgentEvent` / reply loop blocker 需先改调用点                            |
| `conversation/**`、`model.rs`                      | `agent-protocol`                               | 先梳理 DTO；仍被 provider/reply/session adapter 使用的类型不机械搬断                                            |
| `agent-compat-models/**`                           | `agent-protocol::{openai, anthropic}`          | 已由 current DTO 文件承接；删除重复 crate 并补 forbidden-to-restore 守卫                                        |
| `providers/**`                                     | `model-provider`                               | canonical 已有 current；provider trait / factory blocker 需先改 `credential_bridge`                             |
| `tools/**`、`permission/**`、`sandbox/**`、tool IO | `tool-runtime`                                 | 已迁工具继续删除 Aster wrapper；`Tool` / `ToolRegistry` blocker 需先替换 reply loop                             |
| `session/**`、runtime store、history、task board   | `thread-store`                                 | 已迁 projection 继续清 adapter；`SessionStore` / `ThreadRuntimeStore` blocker 需先替换生产调用                  |
| `mcp/**`、`mcp_utils.rs`                           | `lime-mcp` / `tool-runtime`                    | request forwarding 与 extension plan 已有 current；`McpClientTrait` blocker 继续收缩                            |
| `skills/**`                                        | `lime-skills` / `tool-runtime`                 | registry / execution 已有 current；Aster `SkillTool` 外壳继续删除                                               |
| `media/**`                                         | `media-runtime` / `tool-runtime::view_image`   | 只保留 current 需要的 media part / image read 规则；重复实现删除                                                |
| `config/**`、`oauth/**`、`network/**`              | `lime-config` / `model-provider` / `lime-core` | 只迁 current provider/runtime 需要的配置规则；Aster signup / legacy mode 默认删除                               |
| `prompts/**`、`prompt_template.rs`                 | `agent-runtime` prompt owner                   | 不能先裸移；当前 `prompt_template.rs` 用 `include_dir!("$CARGO_MANIFEST_DIR/src/prompts")`，需先改 prompt owner |
| `plan/**`                                          | `tool-runtime::update_plan`                    | Codex-style `update_plan` 已有 current；旧 Aster plan 只作为 reference 移入 owner 后待删                        |
| `rules/**`                                         | `agent-runtime` / governance                   | 无当前生产引用；先作为 reference 移入 owner，后续按 Codex 无对应面删除                                          |
| `streaming/**`                                     | `model-provider`                               | 无当前生产引用；先作为 provider stream reference 移入 owner，后续由 current stream contract 吸收或删除          |
| `tests/**`                                         | 各 current owner crate                         | Aster compat crate 自身旧正向测试不迁；已删除，后续只在 current owner 补必要测试                                |

## 第一批移动记录

2026-07-09：

- `moved`：`lime-rs/crates/agent-compat/src/plan/**` -> `lime-rs/crates/tool-runtime/src/compat/aster_reference/plan/**`
- `moved`：`lime-rs/crates/agent-compat/src/rules/**` -> `lime-rs/crates/agent-runtime/src/compat/aster_reference/rules/**`
- `moved`：`lime-rs/crates/agent-compat/src/streaming/**` -> `lime-rs/crates/model-provider/src/compat/aster_reference/streaming/**`
- `updated`：`lime-rs/crates/agent-compat/src/lib.rs` 删除 `pub mod plan`、`pub mod rules`、`pub mod streaming`，这些模块不再作为 Aster public surface 编译。
- `deleted`：`lime-rs/crates/agent-compat-models/**`；OpenAI / Anthropic wire DTO 由 `lime-rs/crates/agent-protocol/src/{openai,anthropic}.rs` 承接，`agent-compat` 不再声明 `aster-models` 路径依赖。
- `deleted`：`lime-rs/crates/agent-compat/tests/**`；旧 Aster integration / property / replay 测试不再作为 Lime current 验证入口。
- `deleted`：`lime-rs/crates/agent-compat/src/**/{tests.rs,*_tests.rs,*_property_tests.rs}`；旧 Aster 源码内正向测试不迁入 staging crate，必要回归按 owner 重建。
- `deleted`：`lime-rs/crates/agent-compat/src/config/signup_{openrouter,tetrate}/**`；Aster-only 本地浏览器 signup 向导无 Codex current 对应面、无 Lime 消费者。Tetrate 默认模型常量已回收到 provider 文件。
- `deleted`：`lime-rs/crates/agent-compat/src/config/{agents_md_parser,config_command,config_manager,experiments,watcher}.rs`；旧 `/config` CLI、多源配置 manager、AGENTS.md config watcher、实验开关 manager 和 atomic watcher validator 无 Lime current 消费链，且 Codex 无对应工具面。保留 `config::{AsterMode, PermissionManager, DeclarativeProviderConfig}` 等仍被生产引用的最小 blocker。
- `deleted`：`agent-compat` manifest 中缺失的 `examples/{agent,databricks_oauth}.rs` 目标声明，以及只服务外部 tests/examples 的 stale dev-dependency。
- `blocked`：`prompts/**` 暂不移动；先要把 prompt template owner 从 Aster `include_dir!` 改到 `agent-runtime`，否则会破坏仍未迁出的 Aster prompt manager。

## 下一批

1. 把 `prompt_template.rs` + `prompts/**` 迁到 `agent-runtime` prompt owner，并让 Aster compat 只委托 current prompt renderer。
2. 把 `providers/formats/openai_responses.rs` 中 provider side-channel payload 解析迁到 `model-provider`，然后删除 Aster provider format duplicate。
3. 把 `tools::{base,context,error,registry}` 的 trait DTO 拆到 `tool-runtime` current contract，再删除 Aster `Tool` / `ToolRegistry` 编译面。
4. 把 `session_context.rs` 的 turn/session scope 迁到 `agent-runtime` / RuntimeCore current owner，再删除 Aster task-local context。

## 完成口径

- `rg -n "package = \"aster-core\"|aster.workspace|use aster::|aster::" "lime-rs/crates" -g "*.rs" -g "Cargo.toml"` 无 production 命中。
- `lime-rs/crates/agent-compat/**` 和 `lime-rs/crates/agent-compat-models/**` 删除。
- `lime-rs/crates/agent-compat/tests/**` 与 `agent-compat/src` 独立测试文件保持删除；已迁能力的测试只能落在 current owner crate。
- `lime-rs/vendor/aster-rust/**` 删除或只剩历史文档；不得再有编译 source。
- App Server、前端 GUI、Evidence / replay / analysis 只消费 Lime current owner。
