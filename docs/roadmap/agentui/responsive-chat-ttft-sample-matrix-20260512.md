# AgentUI responsive_chat TTFT 样本矩阵

> 状态：真实样本审计与缺口清单
> 更新时间：2026-05-12 12:51 CST
> 范围：`agentui-stream-latency-map-20260509.svg` 所指的“真实 answer 首字慢”主线，只记录 provider/model 路由与 TTFT 证据，不记录用户 prompt、密钥或响应正文。

## 目标审计

整体目标不是“UI 看起来有状态”，而是让 AgentUI 的简单对话在真实 provider 下稳定进入 answer 首字秒级，并且慢样本能被 current 事实源解释和回灌。

| 成功标准 | 当前证据 | 判定 |
| --- | --- | --- |
| Runtime status 百毫秒级可见 | Playwright 实测 `submitAccepted=95/102ms`、`firstRuntimeStatus=116/122ms`；GUI smoke 新会话可读 `latestModelDeltaTiming` | 已达标，不是主瓶颈 |
| 真实 TTFT 进入唯一事实源 | `agent_runs.metadata.model_first_visible_delta_ms / model_first_thinking_delta_ms / model_first_text_delta_ms`；`latest_model_delta --lib` 2 个测试通过 | 已闭环 |
| `responsive_chat_auto` 消费历史样本 | `request_model_resolution --lib` 67 个测试覆盖 first text 优先、timeline fallback、slow / reasoning / unsupported / recent error fallback | 单测闭环 |
| AgentUI 可见 routing / TTFT / fallback reason | `AgentThreadReliabilityPanel.test.tsx` 19 个测试；可靠性面板读取 `latestModelDeltaTiming.routing.decisionReason / fallbackChain` | 已闭环 |
| 路线图图像同步最新结论 | `agentui-stream-latency-map-20260509.svg` v5；XML parse、`rsvg-convert` 渲染 1600x1120 通过 | 已闭环 |
| 多 provider 真实样本矩阵 | 本文从本机 `agent_runs` 聚合已有真实运行记录；多数跨 provider run 缺少 `model_first_text_delta_ms`，只能看总 duration | 未完成 |

结论：工程主链已从“状态秒级”推进到“TTFT 可观测 + 自动路由可解释”，但完整目标仍不能标记完成；剩余缺口是真实多 provider、慢设置、错误与 unsupported 场景的 TTFT 样本矩阵。

## 本机真实样本快照

数据来源：本机 Lime SQLite `agent_runs.metadata` 聚合查询。以下只保留 provider/model、路由来源、运行计数和 timing 摘要，不写用户内容。

### responsive_chat_auto 样本

| provider/model | runs | success/error | first text 样本 | text min/avg/max | duration min/avg/max | 结论 |
| --- | ---: | --- | ---: | --- | --- | --- |
| `deepseek/deepseek-v4-flash` | 8 | 7 / 0 | 5 | `1377 / 21573 / 91275ms` | `1386 / 19595 / 111475ms` | 已有真实 TTFT，但存在大 outlier；均值不能代表当前快路径 |
| `custom-0f61e11f.../MiniMax-M2.7` | 11 | 11 / 0 | 0 | 无 | `2135 / 4577 / 13831ms` | 有真实运行但缺 TTFT 字段，需新版本复测 |
| `siliconflow-cn/deepseek-ai/DeepSeek-V4-Flash` | 8 | 6 / 0 | 0 | 无 | `1797 / 56664 / 318713ms` | 有运行波动但缺 TTFT 字段，不能用 duration 代替首字 |
| `custom-cae6e762.../mimo-v2-flash` | 2 | 0 / 1 | 0 | 无 | `38849ms` error 样本 | 有失败样本，缺错误分类与 TTFT |
| `lime-hub/claude-sonnet-4-6` | 1 | 0 / 1 | 0 | 无 | `8519ms` error 样本 | 有失败样本，缺错误分类与 TTFT |
| `openrouter/aion-labs/aion-1.0` | 1 | 0 / 1 | 0 | 无 | `9778ms` error 样本 | 有失败样本，缺 unsupported / recent error 分类证据 |

补充快样本：

- Playwright 真实会话：`firstTextDelta=1803ms` 与 `1674ms`，页面最终显示“收到 / 绿灯OK”。
- SQLite 已落库样本：`deepseek/deepseek-v4-flash` 的 `model_first_text_delta_ms=1377ms / 1244ms`。
- GUI smoke 新会话：`latestModelDeltaTiming.firstTextDeltaMs=1299ms`。

### request_override / session_default 对照样本

| provider/model | decision | runs | first text 样本 | text min/avg/max | 结论 |
| --- | --- | ---: | ---: | --- | --- |
| `deepseek/deepseek-v4-flash` | `request_override` | 18 | 3 | `1244 / 2014 / 2518ms` | 显式模型也能记录 TTFT，可作 auto 路由对照 |
| `deepseek/deepseek-v4-flash` | `session_default` | 3 | 1 | `1299ms` | GUI smoke 样本证明 read model 投影可用 |
| `custom-da3283.../claude-sonnet-4-6` | `request_override` | 11 | 2 | `10680 / 11510 / 12341ms` | 慢首字对照样本，适合验证自动路由是否避开 |
| `custom-02edcbdf.../astron-code-latest` | `session_default` | 1 | 1 | `14427ms` | 慢首字对照样本，不能当 responsive_chat 达标证据 |

## 缺口矩阵

| 场景 | 当前覆盖 | 缺口 | 下一步验收 |
| --- | --- | --- | --- |
| 慢 `service_models.responsive_chat` 设置 | 单测覆盖 slow first text fallback；真实库里有慢对照模型 | 缺真实“服务模型设置为慢模型 -> 自动 fallback”的运行样本 | 运行一次显式慢服务设置，面板显示 fallback reason，选中快模型 |
| reasoning 模型误入简单对话 | 单测覆盖 `reasoning_output_observed` | 缺真实 `responsive_chat` 服务设置命中 reasoning 输出后的 fallback 样本 | 面板显示 reason 包含 reasoning，fallbackChain 指向非 reasoning 快模型 |
| unsupported model | 单测覆盖 unsupported fallback；库里有 `openrouter/aion-labs/aion-1.0` error | 真实 error 未证明为 unsupported 分类，缺 `unsupported_model` reason | 面板显示 `unsupported_model`，且下一轮避开该模型 |
| recent error without success | 单测覆盖 recent error fallback；库里有多个 provider error | 缺同一 provider/model 的“近期失败且无成功”真实设置样本 | 面板显示 recent error fallback，并记录新 success 样本 |
| trusted unknown 探索 | 单测覆盖 trusted unknown 排序 | 缺真实候选池中新 provider 的探索样本 | 新 provider 第一次进入候选时有 routing evidence 和后续 TTFT |
| 跨 provider TTFT p50 | `deepseek-v4-flash` 有 TTFT；其他 provider 多数只有 duration | 缺新版 telemetry 后的 Minimax / SiliconFlow / OpenRouter / Lime Hub TTFT | 每个 provider 至少 3 条 `model_first_text_delta_ms` |

## 不能用作完成证据的信号

- `duration_ms` 只能辅助定位，不等于 answer 首字；长回答、工具调用、错误恢复都会拉长总时长。
- `responsive_chat_auto` run count 不能证明首字秒级，必须有 `model_first_text_delta_ms`。
- 单测能证明 fallback 规则，不证明真实 provider 延迟；真实样本仍要进入 `agent_runs.metadata`。
- UI 显示 runtime status 秒级不等于 answer token 秒级。

## 下一刀

不直接消耗生产 provider API 作为默认动作。下一刀需要用户明确允许后，再按最小样本矩阵运行真实对话：

1. `deepseek/deepseek-v4-flash`：保留为快样本基线。
2. 一个慢 service setting：验证自动 fallback 不被锁死。
3. 一个 unsupported / recent error 模型：验证错误样本进入 fallback reason。
4. 一个 trusted unknown provider：验证探索策略和首字回灌。

每条样本验收标准一致：

- `agent_runs.metadata` 写入 `model_first_text_delta_ms`。
- `thread_read.model_routing.latestModelDeltaTiming` 可读。
- AgentUI 可靠性面板可见 selected provider/model、TTFT、decision reason、fallback chain。
- 样本结果回写本文，而不是停留在终端查询。
