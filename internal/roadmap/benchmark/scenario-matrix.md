# Refactor v2 测试场景矩阵

> status: current planning contract
> owner: quality-workflow + domain owners
> last_verified: 2026-07-15

## 1. 使用规则

- 场景 ID 一旦进入 evidence 不再复用；语义变化新增 ID。
- `P0` 是 release required；`P1` 是 nightly/RC required；`P2` 是 live/research。
- `L2-L6` 对应 [README.md](./README.md) 的证据等级。
- 同一场景可以有多层测试，但必须指定一个 owner 级主断言，避免每层复制全部分支。
- `negative` 验证 current 边界拒绝非法输入；不为已经删除的实现保留正向行为测试。

## 2. Thread 与会话

| ID | Pri | 主要层 | 场景 | 核心断言 |
| --- | --- | --- | --- | --- |
| THR-01 | P0 | L3 | thread start/read/list | JSON-RPC response、read model 和 list identity 一致 |
| THR-02 | P0 | L3 | archive/unarchive | 状态持久化，分页和筛选一致 |
| THR-03 | P0 | L3 | resume existing thread | history 不重写，新增 turn 接在正确 ordinal 后 |
| THR-04 | P1 | L3 | concurrent list/read | 无重复、无丢失、cursor 稳定 |
| THR-05 | P0 | L3 | invalid/not-found thread | 结构化错误，不创建影子 session |

## 3. Turn 生命周期

| ID | Pri | 主要层 | 场景 | 核心断言 |
| --- | --- | --- | --- | --- |
| TRN-01 | P0 | L2/L3 | accepted -> started -> completed | 单一 terminal，事件顺序和 read model 完整 |
| TRN-02 | P0 | L2/L3 | queued turn | 队列顺序、上下文和用户输入不串线 |
| TRN-03 | P0 | L2/L3 | provider/runtime failure | failed terminal 可恢复，错误归属明确 |
| TRN-04 | P0 | L2/L3 | cancel before/while running | interrupted/cancelled 单终态，无后续幽灵 delta |
| TRN-05 | P0 | L2/L3 | follow-up after terminal | 新 turn identity，旧 turn 不被改写 |
| TRN-06 | P1 | L2/L3 | duplicate terminal/event replay | 幂等，不产生重复 item 或统计 |
| TRN-07 | P1 | L2/L3 | queued turn after restart | 队列事实可恢复或按合同显式失败 |

## 4. Item、投影与内容

| ID | Pri | 主要层 | 场景 | 核心断言 |
| --- | --- | --- | --- | --- |
| ITM-01 | P0 | L2/L3 | user/assistant message lifecycle | create/update/complete identity 稳定 |
| ITM-02 | P0 | L2/L3 | reasoning before/around answer | ordinal 决定位置，不靠到达时间猜序 |
| ITM-03 | P0 | L2/L3 | out-of-order/stale update | fail closed 或可证明 repair，不污染 current projection |
| ITM-04 | P0 | L2/L3 | tool item begin/delta/end | call id、turn id、terminal status 一致 |
| ITM-05 | P0 | L2/L3 | multimodal content parts | text/image/file/ref 顺序、metadata、恢复一致 |
| ITM-06 | P1 | L2/L3 | remove/rollback/repair | materialized view 与 event/store 收敛 |
| ITM-07 | P0 | L3 | pagination boundary | 无遗漏/重复，cursor 与 ordinal 稳定 |
| ITM-08 | P1 | L3 | import historical content | plan/message lifecycle 与 native thread 同语义 |

## 5. Provider、Context 与使用量

| ID | Pri | 主要层 | 场景 | 核心断言 |
| --- | --- | --- | --- | --- |
| PRV-01 | P0 | L2 | Responses request lowering | captured request 与 capability/parts/tool schema 匹配 |
| PRV-02 | P0 | L2 | Chat/Anthropic lowering | provider-specific wire shape 不泄漏到 runtime algebra |
| PRV-03 | P0 | L2 | stream delta + terminal | usage、finish reason、response identity 完整 |
| PRV-04 | P0 | L2 | unsupported capability/media | 发送前 fail closed，错误可见 |
| PRV-05 | P0 | L2 | auth/rate-limit/server error | 分类、重试策略和 terminal 正确 |
| PRV-06 | P1 | L2 | websocket/SSE fallback | transport 切换不改变 item 语义 |
| CTX-01 | P0 | L2 | context construction | 增量历史、边界顺序和 request capture 一致 |
| CTX-02 | P0 | L2 | compaction/truncation | bounded input、摘要接续、工具输出截断正确 |
| CTX-03 | P1 | L2 | prompt cache stability | 无意义变更不破坏稳定前缀/cache key |

## 6. 工具、审批与 Sandbox

| ID | Pri | 主要层 | 场景 | 核心断言 |
| --- | --- | --- | --- | --- |
| TOL-01 | P0 | L2/L4 | read/search/apply/shell success | current registry、结构化 args/output、终态完整 |
| TOL-02 | P0 | L2/L4 | tool failure/timeout | error output 回传模型且 turn 可继续/终止符合合同 |
| TOL-03 | P0 | L2/L4 | oversized/binary output | 截断、artifact/reference 和上下文上限正确 |
| APR-01 | P0 | L2/L3 | approval allow | request/response id 对齐，执行一次 |
| APR-02 | P0 | L2/L3 | approval deny | 不执行工具，结果回传，turn 收敛 |
| APR-03 | P0 | L2/L3 | approval cancel/restart | pending request 可恢复或显式关闭 |
| SBX-01 | P0 | L2 | sandbox allowed path | 权限范围精确，不扩大到父目录 |
| SBX-02 | P0 | L2 | sandbox/network denied | 拒绝可解释，不通过 fallback 绕过 |

## 7. MCP、Skills 与 Multi-Agent

| ID | Pri | 主要层 | 场景 | 核心断言 |
| --- | --- | --- | --- | --- |
| MCP-01 | P0 | L2/L4 | server start/list/call/stop | tool/resource/prompt identity 与 connection owner 一致 |
| MCP-02 | P0 | L2/L4 | elicitation/sampling request | reverse JSON-RPC、capability 与 response metadata 完整 |
| MCP-03 | P0 | L2/L4 | one server failure | 连接故障隔离，不拖垮其他 server/turn |
| MCP-04 | P1 | L2/L4 | restart/reconnect | pending/tombstone 处理和 active timeout 正确 |
| SKL-01 | P0 | L2/L4 | skill discovery/read/bind | stable id、metadata、workspace scope 一致 |
| SKL-02 | P0 | L2/L4 | malformed/unauthorized skill | fail closed，不注入上下文或工具面 |
| AGT-01 | P0 | L2/L4 | spawn child with fork_turns | none/all/N 语义、parentThreadId 和 child history 正确 |
| AGT-02 | P0 | L2/L4 | send/follow-up/list/wait | mailbox、trigger-turn 和状态语义与 Codex 对齐 |
| AGT-03 | P0 | L2/L4 | interrupt/close/restart child | terminal、edge 和持久化恢复一致 |
| AGT-04 | P1 | L2/L4 | concurrent children | 路由隔离、无串消息、聚合统计正确 |

## 8. 恢复、GUI 与桌面链

| ID | Pri | 主要层 | 场景 | 核心断言 |
| --- | --- | --- | --- | --- |
| RCV-01 | P0 | L3/L4 | restart after completed turn | history/detail/list 与重启前整对象一致 |
| RCV-02 | P0 | L3/L4 | restart during running turn | running/failed/interrupted 状态不伪造 completed |
| RCV-03 | P0 | L3/L4 | corrupted/stale projection | repair/fail-closed 可见且不覆盖 canonical store |
| GUI-01 | P0 | L5 | send and stream | 用户消息、reasoning、tool、assistant、terminal DOM 可见 |
| GUI-02 | P0 | L5 | cancel/retry/re-entry | 输入状态、按钮、导航与 turn terminal 一致 |
| GUI-03 | P0 | L5 | history switch/reopen | 不丢 item/content part/artifact，选择 identity 正确 |
| GUI-04 | P0 | L5 | approval/MCP/multi-agent | pending/decision/child state 可操作且可恢复 |
| ELN-01 | P0 | L6 | Electron current chat | preload/IPC/App Server/runtime/read model/DOM 同一 identity |
| ELN-02 | P0 | L6 | Electron cold restart | userData/appData 隔离，history 与 pending state 正确 |
| ELN-03 | P0 | L6 | sidecar/backend unavailable | 明确错误，无 renderer/App Server production mock fallback |
| ELN-04 | P1 | L6 | packaged resources/path | bundled sidecar、schema、assets 和平台路径可用 |

## 9. Live、平台与非功能

| ID | Pri | 主要层 | 场景 | 核心断言 |
| --- | --- | --- | --- | --- |
| LIV-01 | P1 | L7 | live text turn | provider/model/config/usage/latency/transcript 可复核 |
| LIV-02 | P1 | L7 | live tool loop | 多轮工具成功率、恢复率和成本 |
| LIV-03 | P1 | L7 | live multimodal | 输入输出媒体正确且不泄露凭证/本地路径 |
| EVAL-01 | P2 | L7 | product task suite | outcome grader + pass@k/pass^k + 样本版本 |
| PLT-01 | P0 | L8 | macOS RC | install/start/update/path/permissions/current chain |
| PLT-02 | P0 | L8 | Windows RC | Squirrel install/start/update/path/permissions/current chain |
| PERF-01 | P1 | L8 | long thread/read model | pagination、内存、首帧/首 token 不随历史失控 |
| SOAK-01 | P1 | L8 | repeated turns/restarts | 无资源泄漏、幽灵进程、重复 terminal 或数据漂移 |

## 10. DeepSWE Coding

| ID | Pri | 主要层 | 场景 | 核心断言 |
| --- | --- | --- | --- | --- |
| DSW-00 | P1 | L7 | source/slice preflight | source commit、20 个 task、schema、verifier metadata 一致 |
| DSW-01 | P1 | L7 | single-task adapter | App Server current chain、真实 terminal、patch 和 verifier evidence 完整 |
| DSW-02 | P1 | L7 | Smoke 10 | 五语言各两题，基础设施失败为零，pass@1/成本/失败类别完整 |
| DSW-03 | P1 | L7 | Release 20 | 语言与 focus 分层，不低于冻结 baseline 的 non-inferiority 门槛 |
| DSW-04 | P2 | L7 | three-trial bake-off | pass@3/pass^3、成本和稳定性在相同配置下可比较 |

具体任务见 [deepswe-coding-slice.md](./deepswe-coding-slice.md)。

## 11. 首批交付顺序

1. `THR-01`、`TRN-01`、`TRN-04`、`ITM-03`、`RCV-01`：验证 T1 harness。
2. `TOL-01`、`APR-01`、`APR-02`、`CTX-02`：验证工具/审批/context 主链。
3. `AGT-01`、`AGT-02`、`MCP-02`、`MCP-03`：验证高级 runtime 能力。
4. `GUI-01`、`GUI-02`、`ELN-01`、`ELN-03`：形成首个完整 Gate A/B vertical slice。
5. 再扩展 P1、live 和平台矩阵。
