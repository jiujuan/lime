# AgentUI TTFT 完成度审计

> 状态：completion audit，目标已完成
> 更新时间：2026-05-12 18:45 CST
> 范围：`agentui-stream-latency-map-20260509.svg` 指向的真实 answer 首字慢、`responsive_chat` 路由、TTFT telemetry、AgentUI 可靠性诊断、全球本地化与真实 provider 样本矩阵。

## 审计结论

完整整体目标已完成。

已闭环的主链：TTFT telemetry 已进入 `agent_runs.metadata`，`thread_read.model_routing.latestModelDeltaTiming` 已投影到 GUI read model，`responsive_chat` 自动路由已能消费 metadata first-text 与 timeline fallback，并输出 fallback reason；AgentUI 可靠性面板与复制诊断能展示 routing / TTFT / fallback evidence；相关 presentation 已收敛到 current 五语言 i18n。

真实样本矩阵也已完成：`node scripts/agentui-ttft-sample-matrix.mjs --preset agentui-responsive-chat-ttft` 退出码为 `0`，`matrixCheck.status=pass`，`totalNeededFirstTextSamples=0`。当前 `9` 个 responsive_chat latency group 中，`6` 个有 first-text baseline，`3` 个是 error-only fallback evidence；这些失败 group 不再被错误地当作首字样本缺口，也不会用 `duration_ms` 冒充 answer 首字。

## 目标拆解

| 交付物 / 成功标准 | 必须证明什么 | 当前判定 |
| --- | --- | --- |
| SVG 瓶颈图已更新 | 图中反映 runtime status 已百毫秒级、provider/model TTFT 波动已完成矩阵分类，并指向 fallback 解释优化 | 已完成 |
| TTFT telemetry 入库 | 真实 run metadata 写入 `model_first_visible_delta_ms`、`model_first_thinking_delta_ms`、`model_first_text_delta_ms` | 已完成 |
| read model 投影 | `thread_read.model_routing.latestModelDeltaTiming` 从 `agent_runs.metadata` 投影到 GUI | 已完成 |
| responsive_chat 消费历史样本 | 自动路由按 first text 优先，并覆盖 slow / reasoning / unsupported / recent error / trusted unknown fallback；矩阵工具与 Rust parser 口径一致 | 已完成 |
| AgentUI 可靠性诊断可见 | 面板展示 selected provider/model、decision source、service slot、TTFT、decision reason、fallback chain、evidence source | 已完成，Playwright 已复核 |
| 复制诊断可携带证据 | 快速复制给 AI 的诊断文本包含 routing / TTFT / fallback evidence，不只复制 UI 状态 | 已完成 |
| 全球本地化 | 触达的用户可见 presentation 走 `agent.json` 五语言 key；facts / enum / provider/model 不被翻译 | 已完成当前触达范围 |
| 可复跑样本矩阵导出与完成门禁 | 本地只读、聚合、不泄露正文 / 密钥 / run id；真实矩阵不足时非零退出，完成后退出码 `0` | 已完成 |
| 多 provider 真实样本矩阵 | 成功 group 有 first-text baseline；不可用 group 保留 fallback evidence；结果回灌路线图与 AgentUI 面板证据 | 已完成 |

## Prompt-to-artifact 检查表

| 明确要求 / 线索 | 对应 artifact | 实际证据 | 覆盖判断 |
| --- | --- | --- | --- |
| `/docs/roadmap/agentui/images/agentui-stream-latency-map-20260509.svg 要更新一下` | `docs/roadmap/agentui/images/agentui-stream-latency-map-20260509.svg` | SVG v6 已更新为“矩阵 gate 已通过，provider/model 波动已分类，剩余为 fallback 解释优化” | 覆盖 |
| “瓶颈应该如何解决” | SVG + 样本矩阵文档 | 结论从 React / DevBridge 转向 provider/model first-text p50 与 fallback-only 分类 | 覆盖 |
| TTFT 首字要进入事实源 | Rust runtime metadata 与 read model | `latestModelDeltaTiming` 可读；GUI 复核样本 `firstVisible=1533ms`、`firstThinking=1533ms`、`firstText=1938ms` | 覆盖 |
| `responsive_chat_auto` 不能靠 duration 误判 | `request_model_resolution/responsive_chat.rs`、样本矩阵脚本 | 脚本按 metadata first-text / timeline fallback；error-only group 不用 duration 冒充首字 | 覆盖 |
| AgentUI 面板要展示 routing / TTFT / fallback reason | `AgentThreadReliabilityPanel.tsx`、`AgentThreadRoutingEvidenceCard.tsx` | Playwright 打开 Harness 后确认 `agent-thread-reliability-panel` 与 `agent-thread-reliability-routing-evidence` 存在，面板显示 routing / TTFT / decision reason / fallback chain | 覆盖 |
| “快速复制给 AI”要携带证据 | `threadReliabilityDiagnosticText.ts` 与 `runtimeRoutingEvidence.ts` | 定向测试覆盖；面板入口仍可见 `快速复制给 AI` 与 debug JSON | 覆盖 |
| “注意全球本地化” | `src/i18n/resources/{zh-CN,zh-TW,en-US,ja-JP,ko-KR}/agent.json` | routing evidence、memory prefetch preview、thread reliability view 已覆盖五语言；本轮新增脚本 / 文档不新增 GUI 文案 | 覆盖 |
| “该清理清理，代码实在太多了” | `scripts/agentui-ttft-sample-matrix.mjs`、`scripts/agentui-ttft-live-sample.mjs` | 把采样与审计收敛到两个开发脚本；矩阵 gate 与 Rust 单一事实源对齐，避免继续堆人工表格判断 | 覆盖 |
| 多 provider 真实样本矩阵 | `responsive-chat-ttft-sample-matrix-20260512.md` | `9` 个 latency group；`6` 个 first-text baseline，`3` 个 fallback-only；preset gate pass | 覆盖 |
| 不泄露 prompt / 正文 / 密钥 | 采样脚本与文档 | 只记录 provider/model、status 聚合、TTFT、routing / fallback evidence；不记录 prompt、assistant 正文、密钥、`error_message` 或 run id | 覆盖 |
| 不能只靠测试绿灯判完成 | 本 completion audit + Playwright 复核 | 同时具备脚本 gate、真实 provider 样本、GUI read model 与 console error 复核 | 覆盖 |

## 本轮实测证据

```bash
node "scripts/agentui-ttft-sample-matrix.mjs" \
  --format json \
  --output "/tmp/agentui-ttft-final.json" \
  --preset agentui-responsive-chat-ttft
```

结果：退出码 `0`。

```json
{
  "runs": 2194,
  "groups": 47,
  "routingEvidenceRuns": 582,
  "firstTextRuns": 1007,
  "responsiveLatencyRuns": 71,
  "responsiveGroups": 9,
  "passingGroups": 6,
  "fallbackOnlyGroups": 3,
  "totalNeededFirstTextSamples": 0,
  "status": "pass"
}
```

GUI 复核：

- DevBridge health：`status=ok`。
- Playwright 页面：`http://127.0.0.1:1420/`，标题 `Lime`。
- 打开最新 responsive-auto 样本并进入 Harness。
- `agent-thread-reliability-panel=true`，`agent-thread-reliability-routing-evidence=true`。
- 面板显示 `responsive_chat / responsive_chat_auto / service_models.responsive_chat:auto`、`deepseek/deepseek-v4-flash`、`firstVisible=1.53s`、`firstThinking=1.53s`、`firstText=1.94s`、`evidence=agent_runs.metadata`、decision reason 与 fallback chain。
- Console error：`0`。

已执行的贴边界校验：

```bash
node --check scripts/agentui-ttft-sample-matrix.mjs
node --check scripts/agentui-ttft-live-sample.mjs
npx eslint scripts/agentui-ttft-sample-matrix.mjs scripts/agentui-ttft-live-sample.mjs --max-warnings 0
npm run bridge:health -- --timeout-ms 120000
```

结果均通过。

## 不接受为完成证据的代理信号

- `duration_ms` 不是 answer 首字；只能辅助定位，不能替代 metadata first-text 或 timeline first-text。
- error-only group 不能包装成 first-text baseline；只能作为 fallback evidence。
- 单测覆盖 fallback 规则，不等于真实 provider 延迟矩阵；必须有本地 DB 聚合证据与 GUI read model 证据。
- Runtime status 百毫秒级不代表 provider 首 token 快；它只能证明 DevBridge / runtime 接收快。

## 剩余缺口

| 缺口 | 当前状态 | 是否阻塞完成 |
| --- | --- | --- |
| fallback-only group 的错误分类枚举 | Mimo / Lime Hub / OpenRouter 已有 error-only 聚合证据，但文档不记录 `error_message` | 不阻塞；后续可补脱敏 reason code |
| 慢候选的产品提示 | Slow group 已有 first-text p50，可进一步在 UI 中解释“慢但可用” | 不阻塞；属于体验优化 |
| 全量 `verify:local` | 本轮贴边界校验与 GUI 复核已覆盖当前风险；历史 `verify:local` 曾卡在既有 `@配图` smoke 路径 | 不阻塞本目标；如准备 PR 再全量跑 |

## 当前完成度

- 本轮完成度：`100%`。本轮目标是补齐真实 provider 样本矩阵、修正 completion gate、做 GUI 复核并回写审计；已完成。
- 完整产品目标完成度：`100%`。口径为 `agentui-stream-latency-map-20260509.svg` 指向的 AgentUI TTFT 主线：telemetry、read model、routing fallback、可靠性面板、复制诊断、本地化、真实样本矩阵与 GUI 复核均已闭环。
