# Supervisor / LLM Judge 使用边界

> 目标：把 LLM judge 用在该用的地方，避免浪费 token 和制造假绿。

## 1. 只做第二层裁判

Supervisor 只处理 deterministic checks 之后仍无法机械判断的问题。

适合：

- 最终回答是否满足用户意图
- artifact 是否可用
- Agent 路径是否合理
- 多轮目标是否接近成功标准
- 错误恢复说明是否可接受

不适合：

- schema 是否正确
- command 是否注册
- bridge 是否同步
- mock 是否误入生产
- evidence 是否导出
- GUI owner 是否独占
- release scope 是否明确

## 2. 输入必须裁剪

Supervisor 输入只允许：

```text
任务预期
baseline evidence summary
candidate evidence summary
runtime transcript 摘要
GUI / artifact 摘要
rubric
```

禁止：

- 完整 stderr
- 完整聊天历史
- 开发过程解释
- 未脱敏请求 / 响应
- API key / token

## 3. 输出必须结构化

```json
{
  "score": 0.78,
  "verdict": "pass",
  "regressions": [],
  "needsHumanReview": false,
  "reason": "满足任务意图，未发现关键退化"
}
```

## 4. Token 限制

建议默认：

- 单次 judge 输入不超过裁剪摘要。
- 每个场景最多 1 次 judge。
- judge 失败不自动重试 3 次以上。
- 需要多次 judge 时，先沉淀 deterministic signal。
- 每个场景最多 1 次 judge。

推荐输出固定为：

```json
{
  "score": 0.78,
  "verdict": "pass",
  "regressions": [],
  "needsHumanReview": false,
  "reason": "满足任务意图，未发现关键退化"
}
```

## 5. 人审触发

以下情况必须人审：

- Supervisor 分数接近阈值。
- deterministic pass 但用户体验明显不确定。
- 涉及外部发布、支付、生产 API、敏感数据。
- baseline / candidate 结果都差，无法判断 regression。
