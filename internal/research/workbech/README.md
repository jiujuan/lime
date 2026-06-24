# Workbech 研究总入口

> 状态：current research reference  
> 更新时间：2026-06-24  
> 来源：本地源码调研 `/Users/coso/Documents/dev/rust/codex` 与 Lime current Agent Chat 主链  
> 目标：沉淀 Agent chat / workbench streaming 展示正确性的外部参考、差距判断和重构准则。

## 1. 目录定位

`internal/research/workbech/` 只回答一类问题：

**Agent 工作台主聊天如何在 reasoning、工具调用、WebSearch / WebFetch、阶段性输出和最终正文同时流式到达时，保持顺序、归属和完成态正确。**

这里是研究目录，不是实现目录。实现必须回到 Lime current 主链：

1. App Server current stream event / read model。
2. 前端 `Message.contentParts` / timeline projection。
3. `StreamingRenderer` 只渲染结构化 `ContentPart[]`。
4. Electron fixture / GUI E2E 证明真实链路可交付。

## 2. 固定结论

1. **不要用自然语言内容识别生命周期**
   - “已完成思考”“正在搜索”“Finding”“今天的国际新闻”等展示文案不能作为 reasoning、search 或 final answer 的判据。

2. **最终正文不是全局字符串缓冲**
   - final answer 必须来自结构化 assistant message item / final phase / item-scoped delta。
   - streaming overlay 只能承载 final answer 的可见增量，不能承载 commentary、search progress 或 reasoning。

3. **过程项必须是一等渲染对象**
   - reasoning、tool、web search、action、plan 都必须以结构化 item 进入显示投影。
   - Renderer 不负责推断 lifecycle；renderer 只按已投影的顺序渲染。

4. **live stream 与 history hydrate 必须同构**
   - 同一轮事件在 live streaming 与历史恢复后应投影成同构 `ContentPart[]`。
   - 不允许 live 用 overlay 一套逻辑、history 用 `Message.content` 字符串再补一套逻辑。

## 3. 建议阅读顺序

1. [codex-streaming-rendering.md](./codex-streaming-rendering.md)
2. [../../aiprompts/claw-streaming-rendering-correctness.md](../../aiprompts/claw-streaming-rendering-correctness.md)
3. [../../aiprompts/quality-workflow.md](../../aiprompts/quality-workflow.md)
4. [../../aiprompts/playwright-e2e.md](../../aiprompts/playwright-e2e.md)

一句话：

**本目录负责把 Codex 的正确做法转成 Lime 可执行的 streaming 展示重构准则；真正代码收口必须回到 current projection 主链和 GUI/E2E 验证。**
