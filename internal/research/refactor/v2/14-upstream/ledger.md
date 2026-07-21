# 上游版本账本

> status: current upstream ledger
> owner: runtime-architecture
> last_verified: 2026-07-18

## 快照

| Source   | branch | HEAD                                       | commit date | allowlist                                                                                              |
| -------- | ------ | ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------ |
| Codex    | `main` | `2e4f55608b4ad26d9c48ea45a6fcd20bfd5e9fe8` | 2026-07-18  | protocol, Thread/Turn/Item, runtime, tools, context, state, skills, MCP, multi-agent, fixtures         |
| OpenCode | `dev`  | `08fb47373509ba64b13441061314eeacf4264f51` | 2026-07-18  | package ownership, provider/model/capability, ContentPart/LLMEvent, lowering, schema/client boundaries |

两个参照仓库当前 checkout clean；Lime 工作树不是 clean，快照以路径/命令为准。本次复核从 Codex `5c19155cbd93`、OpenCode `9976269ab1ac` 更新到上述 HEAD；allowlist diff 作为后续 S7 current-tree audit 输入。

## Codex v1 后必须重新评估的信号

| 信号                                                            | Lime 动作                                    |
| --------------------------------------------------------------- | -------------------------------------------- |
| ThreadItem 增加 command/dynamic/collab/sub-agent/extension item | S1/S2 直接复制语义和 fixture                 |
| paginated history、ordinal、rollout repair                      | S2 作为 ThreadStore/read model 必选能力      |
| terminal timestamps/errors、response ID prefix                  | S1 protocol + S2 persistence 必选 invariant  |
| model capability/reasoning summary 变化                         | S3 capability owner 评估，不由 UI 字符串推断 |
| TUI/layout/CLI/auth 变化                                        | `reject`，不进入 Lime backlog                |

## OpenCode allowlist

只记录以下路径的变化：

```text
packages/schema/**
packages/llm/src/schema/**
packages/llm/src/route/**
packages/llm/src/protocols/**
packages/llm/src/providers/**
specs/v2/provider-model.md
packages/{core,protocol,client,server,app,session-ui}/package.json
```

OpenCode Session、Tool、UI 实现、Bun/Effect、HTTP/OpenAPI 变化默认 `reject`，不因为文件名相似进入 backlog。

## 更新流程

1. 记录旧/new HEAD、日期和工作树状态。
2. 用 `git diff --name-status <old>..<new> -- <allowlist>` 过滤路径。
3. 每条信号绑定 Lime owner、动作（copy/adapt/delete/watch/reject）和验证命令。
4. 若没有采纳项也记录 range 和“无动作原因”，不把空 diff 当完成证据。
5. 更新本账本后才允许改 S 切片；不直接在聊天上下文决定实施。

## 许可证

Codex 为 Apache-2.0（根 `LICENSE`/`NOTICE`），OpenCode 为 MIT。直接复制源文件时必须保留相应 notice、provenance 和第三方依赖审计；仅复制语义/接口时也要记录来源 commit。
