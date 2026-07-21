# 验证与回流守卫

## 1. 验收分层

### Gate A：协议与投影

证明 Codex v2 typed schema、App Server request/notification、Thread/Turn/Item projection、分页和 cold read 正确；不得以 `protocol/v0` 或 `agentSession/*` 通过。

最小命令：

```bash
npm run test:contracts
npm run test:rust:related -- lime-rs/crates/app-server lime-rs/crates/agent-protocol lime-rs/crates/thread-store
npm run governance:legacy-report
```

### Gate B：真实 Electron

证明真实链路：

```text
Renderer -> preload/IPC -> app_server_handle_json_lines
  -> App Server JSON-RPC -> RuntimeCore/agent-runtime
  -> provider/tool -> EventLog/ThreadStore/read model -> GUI
```

最小命令：

```bash
npm run verify:gui-smoke
npm run smoke:agent-runtime-current-fixture
npm run bridge:health -- --timeout-ms 120000
```

Gate B 不接受 renderer mock、defaultMocks、localhost provider 作为 production backend 证明；fixture 只能证明 typed bridge 和 lifecycle。

### Recovery：重启与恢复

必须覆盖：

- App Server restart 前后 parent/child session、provider/model default、mailbox 和 queue。
- v2 `thread/start|resume|fork|archive|delete|unarchive` 与 `turn/start|interrupt|steer` 的 request/response/notification。
- EventLog 尾部损坏、projection 失败、duplicate sequence、late delta。
- raw rollout canonical append、metadata patch、ThreadHistoryBuilder coalesce/rollback、fork boundary、compaction replacement/window lineage。
- model catalog refresh 期间的当前模型、in-flight Turn、breaker state。
- approval pending、MCP elicitation、tool process、PTY 和 child wait。

## 2. Codex 对齐断言

| 断言 | 失败含义 | 守卫 |
| --- | --- | --- |
| `thread/read` 与 live notification 使用同一 Item ID | 第二 projection 或 Renderer synthesis | canonical projection contract test |
| terminal Item 拒绝 late delta | stream reducer 或 identity gate 错误 | provider stream tests |
| ThreadStore append 不修改 metadata | history/store 边界错误 | raw append + metadata patch contract |
| ThreadHistoryBuilder coalesce/rollback 与 cold read 一致 | 第二 history projection | thread history projection tests |
| compaction replacement/window lineage 可重建 | summary 丢失或双发全量历史 | compaction/reconstruction tests |
| Turn route/capability/attempt/usage 可追溯 | provider metadata 丢失或旁路 | trace/evidence provenance test |
| tool definitions 与 executor 同 snapshot | tool inventory 与执行器漂移 | tool snapshot contract |
| approval deny/timeout 不执行副作用 | sandbox/approval 边界错误 | permission preflight tests |
| child 不缺 provider/model | runtime options 未持久化或 recovery 猜测 | restart regression |
| model switch 不改历史 | session default 与 history owner混淆 | model switch tests |
| provider fallback 在可见副作用后禁用 | retry policy 可能重复执行 | provider retry tests |
| 未知 model/capability/credential readiness 直接失败 | route fail-open 或名称猜测 | model route contract + negative test |
| cache key 绑定 credential/tenant identity | 旧身份 catalog 泄漏 | model registry cache tests |
| `lime-providers` 无 workspace/consumer 引用 | 重复 provider owner 回流 | crate/import scan |
| ws/unix transport 有真实 acceptor 或 variant 已删除 | enum 声明冒充实现 | transport tests |

## 3. 多模型专项回归矩阵

| 场景 | 预期 |
| --- | --- |
| 无远端 catalog，仅 bundled default | 使用 bundled route；若 provider 未 ready 则 fail closed |
| remote catalog 首次到达 | 按 layered precedence 选择默认；发 model selection change |
| 后续 catalog refresh | 保留用户已选模型；模型消失/不可选时才重选 |
| allowed_models 非法 glob | 配置拒绝或 selectable 集合为空，不静默放行 |
| text-only model + 当前图片输入 | 联网前 capability gap |
| text-only model + 历史图片 | 按 Codex 语义显式占位，文本回合可继续 |
| reasoning effort 不支持 | 忽略/拒绝 typed override，不向 provider 发非法字段 |
| 已有 Turn 的不兼容 model switch | 拒绝并建议新 Thread/Session |
| zero-turn 的 harness/model switch | 可 rebuild；失败则原子回滚 |
| provider 429/5xx/timeout | transport retry；每次新 attempt identity |
| 首个 text/tool event 后网络错误 | 不重放整次 request，不重复副作用 |
| child spawn 没有显式 provider/model | 从 parent effective turn options 复制并持久化 |
| auxiliary route/variant/options | 每个 Turn 固化 web-search/title/image/compaction/subagent route 和 effective request options |

## 4. 守卫

### 4.1 事实源扫描

更新 `internal/aiprompts/architecture.md`、`overview.md`、`governance.md` 后，任何新增 OpenCode provider 事实源、`agentSession` production 调用或 `lime-providers` 引用都应被视为回流。扫描可先使用：

```bash
npm run governance:legacy-report
rg -n "opencode|OpenCode" internal/aiprompts internal/refactor/v1
rg -n "agentSession|lime-providers|crate = \"providers\"" electron src scripts lime-rs internal
```

历史研究目录可以保留 provenance，但不得成为 current owner。`agentSession`/`protocol/v0`/`lime-providers` 命中只能出现在删除守卫或历史 evidence，不能出现在 production path。

### 4.2 命令边界

涉及 App Server/Electron/Renderer 的变更必须同步：

- protocol schema / generated client
- Electron host/preload IPC 白名单
- renderer gateway / catalog / fixture
- `npm run test:contracts`

### 4.3 owner 方向

禁止下列依赖：

```text
Renderer -> provider wire / DB / executor
Electron -> runtime state / model route
App Server handler -> provider body / tool implementation
model-provider -> App Server / Electron / React
tool-runtime -> App Server handler / Renderer
thread-store -> provider history / UI cache
```

用 import boundary、crate dependency、catalog guard 和负向测试阻止回流。

### 4.4 文件体量

对齐工作不得继续向以下高频文件堆业务逻辑：

- `app-server/src/runtime.rs`
- `app-server/src/processor/mod.rs`
- `agent-runtime/src/lib.rs` / `session_loop.rs`
- `model-provider/src/provider_stream.rs`
- `AgentChatWorkspace.tsx`

新逻辑落到 domain module，并保持 `npm run governance:file-size` 只减不增。

## 5. 完成证据

每个 V1 条目必须记录：

1. Codex/grok-build 参考路径和 commit。
2. Lime current owner、修改写集和删除 surface。
3. 运行的定向测试、contracts、GUI smoke、Gate B 证据。
4. `current/compat/deprecated/dead` 分类变化。
5. 未验证原因和下一刀。

没有真实 read model、Electron bridge 和 durable identity 的证据，不得将条目标记为完成。
