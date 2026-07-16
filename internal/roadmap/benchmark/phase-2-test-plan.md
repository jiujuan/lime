# 第二期测试实施计划

> status: active / T9 DeepSWE diagnosis complete, scoring blocked
> owner: quality-workflow
> started: 2026-07-15
> target: Refactor v2 current chain

## 1. 实施原则

第二期按“先可定位的确定性测试，再产品闭环，再非确定性评估”推进。每个切片必须同时交付测试、稳定 fixture/helper、机器可读结果和删除项；不先建新的总 runner，也不恢复旧 Benchmark 包装层。

测试实现的价值按“是否暴露并归属真实 Lime 缺陷”衡量，不按新增测试文件或 case 数量衡量。DeepSWE task 只有在 workspace、current chain 和 verifier 都有效时才计分；无效 trial 只作为基础设施或产品诊断 evidence。

测试失败必须指向一个明确 owner：protocol、agent-runtime、tool-runtime、model-provider、App Server/read model、Electron host 或 Renderer projection。跨层总脚本只能聚合已有证据，不能成为业务真相。

## 2. 基线冻结

T0 开始时记录：

```yaml
codex_commit: 5c19155cbd93bfa099016e7487259f61669823ff
refactor_v2_status: completed implementation baseline
lime_head: <git rev-parse HEAD>
working_tree_digest: <tracked + untracked product paths>
os_arch: <platform/version/arch>
node_npm: <versions>
rust_toolchain: <versions>
```

测试体系重建期间允许修改测试和 current 实现，但每个 evidence 必须绑定自己的候选摘要；旧 evidence 不自动升级为新候选证据。

## 3. 实施切片

| Slice                     | 优先级 | Owner                                         | 目标                                                                                          | 退出条件                                                                                                |
| ------------------------- | ------ | --------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| T0 inventory/reset        | P0     | quality-workflow                              | 盘点 v2 后真实测试覆盖，删除旧 Benchmark surface                                              | current 导航零旧命令；每个现存 smoke/manifest 有分类                                                    |
| T1 integration harness    | P0     | app-server-test-client + runtime test support | 建立可控 response server、公共 client、事件等待、临时数据目录和整对象断言 helper              | 至少 3 条跨 crate 场景复用；无固定 sleep                                                                |
| T2 protocol/client        | P0     | app-server-protocol + app-server-client       | method/schema/generated types/request-response/notification 同步                              | create/read/list/turn/control round trip；未知字段和版本失败可定位                                      |
| T3 turn lifecycle         | P0     | agent-runtime + app-server                    | accepted/queued/started/completed/failed/interrupted/cancel/resume                            | 正常、并发、取消、重入和 terminal 单一性全覆盖                                                          |
| T4 item/read model        | P0     | app-server + thread-store + projection        | message/reasoning/tool/content part 的 create/update/order/repair/pagination                  | 重启恢复前后整投影相等；stale/out-of-order fail closed                                                  |
| T5 tool/policy/context    | P0     | tool-runtime + agent-runtime                  | 工具执行、审批、sandbox、截断、context/compaction/cache                                       | allow/deny/cancel/timeout/oversize/compaction 均有集成证据                                              |
| T6 MCP/Skills/Multi-Agent | P0     | app-server + domain owners                    | MCP lifecycle、Skills metadata、parent-child edge、mailbox、control tools                     | restart 后 identity/edge/mailbox 可恢复；故障隔离成立                                                   |
| T7 provider/multimodal    | P0     | model-provider                                | capability、lowering、stream、usage、error、message parts/media                               | 每种支持协议有 request capture；unsupported fail closed                                                 |
| T8 GUI Gate A/B           | P0     | Renderer + Electron host                      | 关键状态在 DOM 可见，真实产品链 identity 一致                                                 | P0 场景 Gate A/B 证据齐全；生产 mock 命中为零                                                           |
| T9 DeepSWE coding         | P1     | evaluation + agent-runtime                    | 以 Agnes 为主测、gpt-5.5 为固定对照，通过 App Server current adapter 跑 Smoke 10 / Release 20 | 先关闭真实 trajectory 暴露的 Lime 缺陷；adapter 零基础设施失败后再冻结 baseline、pass@1、成本和失败分类 |
| T10 live/eval             | P1     | evaluation                                    | live provider 与非确定性产品任务质量                                                          | 样本、模型、配置、grader、成本、pass@k/pass^k 可复核                                                    |
| T11 platform/release      | P1     | release + quality                             | macOS/Windows、packaged app、并发、长稳与证据汇总                                             | RC required 场景全绿；无 retry 掩盖；平台差异已归属                                                     |

## 4. 每个切片的交付合同

每个切片必须提交以下内容：

1. 对应 [scenario-matrix.md](./scenario-matrix.md) 的稳定场景 ID。
2. 受测公共边界和唯一 owner。
3. 正常、失败、取消/恢复中与风险匹配的 case。
4. 结构化 fixture；禁止在生产路径新增 mock fallback。
5. 定向运行命令和预计时长。
6. 机器可读结果，至少包含 scenario、candidate、proof level、status、duration、artifact paths 和 failure owner。
7. 被替代测试/fixture 的删除清单与回流守卫。

## 5. T0 详细任务

### T0.1 生成 inventory

按 owner 统计 Rust/TS 测试、fixture、smoke、Gate A/B 和 live 测试，至少记录：

- 受测 public boundary；
- 是否触达 current product chain；
- 是否只断言静态值或 mock 调用；
- 是否依赖固定 timeout、共享全局状态或顺序；
- 是否仍使用 retired type/command/fixture；
- 是否与其他测试重复证明同一事实。

### T0.2 现有测试分类

| 分类      | 处理                                                                       |
| --------- | -------------------------------------------------------------------------- |
| current   | 场景语义与 v2 owner 一致；加入稳定 ID 并保留                               |
| rewrite   | 有效风险仍存在，但 fixture/入口/断言基于旧 owner；迁移后删除原测试         |
| merge     | 多个边界 guard 重复证明同一事实；合并到 owner 级 contract/integration test |
| dead      | 测试静态值、已删除实现、旧命令正向行为或脱离构建图；直接删除               |
| live-only | 依赖真实账号/网络/模型；移出默认门禁并显式授权                             |

### T0.3 第一批优先审计

- 文件名或内容包含 `legacy`、`compat`、`agent_runtime_*`、旧 Team/roster/raw subagent 的正向测试。
- 只检查源码字符串的 `*BoundaryGuard.test.ts`，判断应归治理扫描还是行为测试。
- React 大型挂载测试里可下沉到 selector/projection/state machine 的分支。
- 使用固定 sleep、超大 timeout、共享 `.lime` 状态或已有用户数据的 smoke。
- 只验证 script 能生成报告、但不验证 current runtime 的 runner test。

## 6. T1 Harness 目标形状

不要复制 Codex crate 名称，但复制其测试思想：

```text
TestRuntimeBuilder
  -> isolated app/data/workspace dirs
  -> deterministic provider response server
  -> RuntimeCore/App Server public boundary
  -> captured structured requests
  -> event wait/predicate
  -> Thread/Turn/Item/read-model snapshot
```

公共 helper 只解决环境、fixture、事件收集和结构化断言，不暴露生产私有状态。单个测试需要的特殊 helper 保持在测试文件内，避免形成第二套 runtime API。

## 7. 运行与 CI 策略

| 时机              | 策略                                                         |
| ----------------- | ------------------------------------------------------------ |
| 本地开发          | `test:related` / `test:rust:related`，先小后大               |
| PR                | diff selector 选择 L0-L3；GUI/bridge 风险追加 L4-L6          |
| Nightly           | 全量 deterministic 场景、故障注入、flaky/retry=0 审计        |
| Release candidate | 冻结候选，运行 required 场景与 macOS/Windows packaged matrix |
| Live eval         | 独立凭证、预算和数据保留策略；不得被默认 PR 触发             |

Rust CI 在测试量和平台矩阵稳定后可引入 `cargo nextest` archive/shard；它是执行加速器，不改变测试 owner、场景定义或本地 related-first 规则。

## 8. 退役账本

2026-07-15 已删除：

- `scripts/agent-qc/benchmark*.mjs` 旧 runner 与 runner tests；
- `internal/test/benchmark-release.manifest.json`；
- `internal/test/agent-qc-benchmark.manifest.json`；
- `agent-qc:benchmark*` / `agent-qc:benchmark-release*` npm 入口；
- 旧 dataset selection、version test plan、progress；
- 不对应真实代码 owner 的三份伪代码 test-case 指南。

禁止恢复同名 wrapper。未来若需要聚合器，必须消费第二期机器可读场景结果，且放入已有测试领域目录，不在 `scripts/` 根或 `agent-qc` 下重建平行事实源。

DeepSWE 数据集不属于退役 surface。新的选题与执行合同见 [deepswe-coding-slice.md](./deepswe-coding-slice.md)；旧 runner 删除是为了防止 dry-run 结果冒充真实 Lime coding score。

本地 `.lime/benchmark/runs` 中 45 个旧 runner 产物已于 2026-07-15 删除；固定 source cache 保留给 current adapter。随后 9 个已被回归覆盖的 bring-up run 和两条诊断 run 内的仓库内 clone 也已删除，只保留当前有效 JSON/patch evidence。T9 的 source preflight、adapter v3、provider step/token/usage 和诊断 true run 已完成；Pier separate verifier 因本机无容器运行时仍阻塞。

## 9. 当前下一刀

T9 当前已证明 provider idle timeout、workspace/base 隔离、App Server evidence、逐步 usage 和 current cancel 有效。adapter v3 Agnes Go run 在 16-provider-step 预算内累计 272,324 budget tokens、16 个 tool call，仍未产生 patch；T0/T1 App Server session/projection 与 Gate B queue/restore blocker 已关闭。下一刀是恢复能在固定 step/token 预算内产出 terminal candidate 的 Agnes coding 路由并提供容器 runtime；在此之前暂停重复跑 Go/Rust，不用更多无效 trial 冒充进展。
