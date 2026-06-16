# Agent Workspace Search / Browser / Research 评分卡

> 当前静态分：`2.4 / 5`  
> 目标：验证 Agent Workspace 是否能完成带来源、浏览器状态和证据链的研究任务，而不是只调用搜索工具。

## 1. 5 分标准

| 能力 | 5 分要求 |
| --- | --- |
| Web search | 查询、结果、选择理由、来源引用可见 |
| Browser 操作 | 打开、点击、输入、等待、截图、DOM / URL / console / network 证据 |
| Grounded answer | 最终答案引用真实 source refs，不从记忆编造 |
| Research artifact | 长研究结果进入 artifact / report，不只在聊天正文 |
| Failure handling | 搜索失败、页面打不开、权限/登录阻塞可见 |
| External benchmark | 可对齐 WebArena / Mind2Web / OSWorld mini 场景 |

## 2. 当前证据

| 证据 | 判断 |
| --- | --- |
| Claude Code WebSearchTool / WebFetchTool 文件 | Search 和 fetch 是独立工具，需要独立 UI |
| Codex app-server search / fuzzy file search / browser-like event references | Search / file search 有协议参考 |
| Lime browser runtime / site adapter smoke 文档 | Browser 能力有测试入口 |
| AG-UI shared state / frontend tools | Browser / frontend action 应作为结构化 state/action，而非文本描述 |
| WebArena / OSWorld | 浏览器和桌面任务需要 outcome + 操作轨迹评分 |

## 3. 评分维度

| 评测项 | 当前分 | 必须补证 |
| --- | ---: | --- |
| Web search lifecycle | 2.5 | 查询、结果、选中来源、引用 |
| Source citation | 2.0 | final answer 与 source refs 绑定 |
| Browser attach/status | 2.5 | attach、current URL、page title、cleanup |
| Browser action trace | 2.0 | click/type/wait/screenshot 可复核 |
| Console/network evidence | 2.0 | GUI smoke 采集 console/network |
| Research artifact | 2.5 | 报告进入 artifact，不堆聊天 |
| WebArena mini | 1.5 | 至少一个可重复 browser task |

## 4. P0 实测场景

| 场景 | 输入 | 必须通过 |
| --- | --- | --- |
| `search-grounded-answer` | 查询一个需要最新来源的问题 | 搜索 query、source refs、final answer 引用 |
| `browser-read-page` | 打开网页并总结关键信息 | URL、title、截图或 DOM 证据、final answer |
| `browser-form-task` | 在测试页填写表单 | action trace、页面结果、cleanup |
| `research-artifact` | 生成一份短报告 | artifact refs、sources、evidence refs |

## 5. 失败模式

| 失败 | 阻断原因 |
| --- | --- |
| final answer 无来源但声称“查到” | 研究可信度为零 |
| Browser UI 只显示“运行中” | 无法复核实际页面状态 |
| 登录/权限阻塞被模型忽略 | 任务 outcome 不可信 |
| 来源和结论不匹配 | 需要模型评分器或人工复核阻断 |

## 6. 下一刀

先做 `search-grounded-answer`，它比 full browser 更轻，但能立即检验 search、source、answer、evidence 的主链。
