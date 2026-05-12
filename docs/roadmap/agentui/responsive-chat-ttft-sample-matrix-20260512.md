# AgentUI responsive_chat TTFT 样本矩阵

> 状态：completion gate 已通过
> 更新时间：2026-05-12 18:45 CST
> 范围：`agentui-stream-latency-map-20260509.svg` 所指的“真实 answer 首字慢”主线；只记录 provider/model 路由、状态聚合与 TTFT 证据，不记录用户 prompt、assistant 正文、密钥、`error_message` 或 run id。

## 目标审计

整体目标不是“UI 看起来有状态”，而是让 AgentUI 简单对话在真实 provider 下进入可解释的 answer 首字链路：快路径有 first-text TTFT 基线，慢 / error / unsupported 路径能作为 routing fallback evidence 被 current 事实源消费，并在 AgentUI 可靠性面板可见。

| 成功标准 | 当前证据 | 判定 |
| --- | --- | --- |
| Runtime status 百毫秒级可见 | Playwright 复测与 GUI smoke 已证明 submit/runtime status 在百毫秒级；最新 GUI 复核样本 `durationMs=1953ms` | 已达标，不是主瓶颈 |
| 真实 TTFT 进入唯一事实源 | `agent_runs.metadata.model_first_visible_delta_ms / model_first_thinking_delta_ms / model_first_text_delta_ms`；样本矩阵也按 Rust 逻辑支持 `agent_thread_items` timeline fallback | 已闭环 |
| `responsive_chat` 消费历史样本 | Rust `load_responsive_chat_auto_latency_hints` 的口径为 `responsive_chat_auto` / `serviceModelSlot=responsive_chat` / `settingsSource=service_models.responsive_chat`；矩阵脚本已对齐该事实源 | 已闭环 |
| AgentUI 可见 routing / TTFT / fallback reason | Playwright 复核打开 Harness：`agent-thread-reliability-panel` 与 `agent-thread-reliability-routing-evidence` 均存在；面板显示 selected provider/model、首个可见 / 思考 / 正文、decision reason 与 fallback chain | 已闭环 |
| 路线图图像同步最新结论 | `agentui-stream-latency-map-20260509.svg` v6 指向 provider/model TTFT 波动已完成分类，真实样本矩阵 gate pass，后续仅剩 fallback 解释优化 | 已闭环 |
| 多 provider 真实样本矩阵 | `--preset agentui-responsive-chat-ttft` 退出码 `0`；`totalNeededFirstTextSamples=0`；`6 / 9` 个 latency group 有 first-text 基线，`3` 个 error-only group 保留为 fallback evidence | 已达标 |

结论：工程主链与产品证据链都已闭环。剩余瓶颈不是 React paint / DevBridge / runtime status，而是 provider/model 本身的首字差异；当前 routing 已有足够样本把快模型作为基线，并把不可用 group 作为 fallback evidence 让后续自动路由避开。

## 可复跑导出工具

只读审计入口：

```bash
node scripts/agentui-ttft-sample-matrix.mjs --format markdown --limit-groups 12
node scripts/agentui-ttft-sample-matrix.mjs --format json --output /tmp/agentui-ttft-sample-matrix.json
node scripts/agentui-ttft-sample-matrix.mjs --preset agentui-responsive-chat-ttft
```

边界：

- 默认读取当前平台的 Lime SQLite 数据库：macOS `~/Library/Application Support/lime/lime.db`、Windows `%APPDATA%/lime/lime.db`、Linux `${XDG_DATA_HOME:-~/.local/share}/lime/lime.db`。
- 使用 SQLite `-readonly`，只查询 `agent_runs` 与 `agent_thread_items` 的聚合证据。
- first-text 口径与 Rust 事实源对齐：优先 `agent_runs.metadata.model_first_text_delta_ms`，成功样本缺该字段时回退到 `agent_thread_items` user -> agent timeline；不使用 `duration_ms` 替代 answer 首字。
- `responsive_chat latency group` 的纳入条件与 Rust parser 对齐：`decisionSource=responsive_chat_auto`，或 `serviceModelSlot=responsive_chat`，或 `settingsSource=service_models.responsive_chat`。
- error-only / unsupported-like group 不进入 first-text baseline 目标；它们作为 routing fallback evidence 保留，不能用 duration 冒充首字。
- Markdown / JSON 不导出 prompt、assistant 正文、`error_message`、密钥、run id；本机用户目录缩写为 `~`，custom provider id 只展示截断形式。
- 该脚本是开发审计工具，不新增 GUI 文案；若后续接入 AgentUI，presentation 必须走 `agent.json` 五语言 key。

## Completion gate 快照

来源：

```bash
node scripts/agentui-ttft-sample-matrix.mjs \
  --format json \
  --output /tmp/agentui-ttft-final.json \
  --preset agentui-responsive-chat-ttft
```

结果：退出码 `0`。

| 指标 | 值 |
| --- | ---: |
| 扫描 run | 2194 |
| 聚合 group | 47 |
| 含 routing evidence 的 run | 582 |
| 含 first-text 证据的 run | 1007 |
| `responsive_chat` latency run | 71 |
| `responsive_chat` latency group | 9 |
| passing first-text group | 6 |
| fallback-only group | 3 |
| `totalNeededFirstTextSamples` | 0 |
| preset status | `pass` |

## 真实样本矩阵

| provider/model | runs | sources | status | first-text 样本 | text min/p50/avg/max | 结论 |
| --- | ---: | --- | --- | ---: | --- | --- |
| `deepseek/deepseek-v4-flash` | 18 | `request_override` / `responsive_chat_auto` | success:17 / running:1 | 17 | `1377 / 2296 / 8007 / 91275ms` | 快路径主基线；存在历史 outlier，p50 仍可用 |
| `custom-0f61e11f.../MiniMax-M2.7` | 14 | `request_override` / `responsive_chat_auto` | success:14 | 14 | `2023 / 3249 / 4023 / 6622ms` | 有稳定 first-text 基线，可用于跨 provider 对照 |
| `siliconflow-cn/deepseek-ai/DeepSeek-V4-Flash` | 11 | `request_override` / `responsive_chat_auto` | success:9 / running:2 | 9 | `1641 / 2796 / 3615 / 6957ms` | 已补足 first-text；整体可作为可用候选但波动高于 deepseek |
| `custom-f74b38b5.../sensenova-6.7-flash-lite` | 4 | `request_override` / `responsive_chat_auto` | success:4 | 4 | `5683 / 7065 / 8121 / 10055ms` | 可用但慢，应被低延迟路由降权 |
| `custom-02edcbdf.../astron-code-latest` | 4 | `request_override` / `responsive_chat_auto` | success:4 | 4 | `2509 / 10552 / 11643 / 18284ms` | 可用但慢，作为 slow fallback 证据 |
| `custom-da3283c4.../claude-sonnet-4-6` | 4 | `request_override` / `responsive_chat_auto` | success:4 | 4 | `2709 / 3830 / 8577 / 18729ms` | 可用但波动明显，作为慢候选证据 |
| `custom-cae6e762.../mimo-v2-flash` | 7 | `request_override` / `responsive_chat_auto` | error:6 / running:1 | 0 | n/a | fallback-only；不作为 first-text baseline |
| `lime-hub/claude-sonnet-4-6` | 5 | `request_override` / `responsive_chat_auto` | error:5 | 0 | n/a | fallback-only；满足必测 provider 的错误证据，不冒充首字 |
| `openrouter/aion-labs/aion-1.0` | 4 | `request_override` / `responsive_chat_auto` | error:4 | 0 | n/a | fallback-only；满足必测 provider 的错误证据，不冒充首字 |

## 授权后采样结果

用户已明确授权外部 provider API 采样。本轮按小批次执行，未记录 prompt、assistant 正文、密钥、`error_message` 或 run id。

| 批次 | 结果 |
| --- | --- |
| responsive-auto 探针 | `deepseek/deepseek-v4-flash` 成功，`firstTextDeltaMs=1579ms`，证明 live sampler 与 read model 可用 |
| SiliconFlow | 补 `2` 条 `deepseek-ai/DeepSeek-V4-Flash` first-text，矩阵累计达标 |
| MiniMax | 补 `3` 条 `MiniMax-M2.7` first-text，矩阵累计达标 |
| custom Claude / Astron / SenseNova | 各补 `3` 条 first-text，矩阵累计达标 |
| Mimo / Lime Hub / OpenRouter | 多次真实调用进入 error-only / running 证据；保留为 fallback-only group，不用 duration 冒充首字 |
| GUI 复核 | 最新 responsive-auto 样本：selected `deepseek/deepseek-v4-flash`，`firstVisible=1533ms`、`firstThinking=1533ms`、`firstText=1938ms`；Harness 可靠性面板与 routing evidence 均可见，console error 为 `0` |

## 不接受为完成证据的信号

- `duration_ms` 不是 answer 首字；只能辅助定位，不能替代 `model_first_text_delta_ms` 或 timeline first-text。
- `responsive_chat_auto` run count 不是首字秒级证据；必须看到 first-text 或明确 fallback-only 分类。
- 单测覆盖 fallback 规则，不等于真实 provider 延迟矩阵；必须有本地 DB 聚合证据与 GUI read model 复核。
- Runtime status 百毫秒级不代表 provider 首 token 快；它只能证明 DevBridge / runtime 接收快。
- error-only group 不能被包装成成功 baseline；只能作为 routing fallback evidence。

## 下一刀

主目标已完成。后续如果继续优化，优先做低风险减法而不是继续扩 provider 样本：

1. 将 `scripts/agentui-ttft-live-sample.mjs` 保持为开发采样工具，不接入 GUI；如需产品化必须先补五语言 i18n。
2. 针对 fallback-only group 补错误分类枚举，但仍不写 `error_message` 到路线图。
3. 把 `responsive_chat` 慢候选阈值可视化为“低延迟 / 慢 / fallback-only”三段，避免用户把慢模型误认为首字达标。
