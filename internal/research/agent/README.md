# Agent 研发验证研究

> 状态：current research reference
> 更新时间：2026-07-02
> 目标：沉淀 AI Agent 开发验证体系，以及 Lime 如何把 Agent 验证变成工程能力。

## 阅读入口

1. [AI Agent 开发，如何省掉那 90% 的手动验证](./ai-agent-verification-original.md)
   - 用户提供视频文案的整理版。
   - 保留原讲述顺序，仅修正断句、明显错字和专有名词。

2. [Lime 应该如何开发 Lime：把 Agent 验证变成系统能力](./lime-verifiable-agent-development-researched.md)
   - 基于 WebSearch 主来源调研后的 Lime 方案稿。
   - 包含 Verifier's Law、SWE-agent / ACI、OpenAI / Anthropic / Google Agent eval、Playwright GUI 验证证据链。
   - 给出 Lime 三阶段可行性方案、8 条 Golden Agent Scenarios、Supervisor 使用边界和下一刀建议。

3. [Lime Agent 可验证研发体系计划](./lime-agent-verification-plan/README.md)
   - 把文章里的判断拆成可执行计划骨架。
   - 重点处理 Agent QC token 成本过高的问题：默认低 token、证据复用优先、按风险升级 qcloop / live Provider / LLM judge。
   - 包含当前资产地图、Token 预算策略、Agent QC 分级、验证合同模板、P0 green 计划、场景分层、Supervisor 边界、flag differential harness 和 30 / 60 / 90 天路线图。

4. [Managed Objective 场景草案](./lime-agent-verification-plan/19-managed-objective-scenario-draft.md)
   - 把 `objective-checklist`、`managed-objective-continuation`、`managed-objective-automation` 收敛成低 token 的 P1 / P2 场景入口。
   - 说明 Managed Objective 下一步该怎么验、怎么省 token、什么时候才值得进 Agent QC。

## 说明

`lime-verifiable-agent-development.md` 是早版草稿，已由调研版 `lime-verifiable-agent-development-researched.md` 取代。
