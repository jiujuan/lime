# Benchmark 测试集选择方案

> 更新时间：2026-07-10
> 信息来源：官方站点、官方 GitHub、论文页；Context7 本轮未暴露可调用工具，后续如接入 Context7，应只用来补官方文档索引，不替代仓库内事实源。
> WebSearch 复核日期：2026-07-10。

## 0. 最新复核结论

1. **DeepSWE 可以用，但不能单独用。**
   官方 v1.1 仍是同一批 113 个长程工程任务，更新重点在执行和评分可复现性；它适合作为 P1 coding gate，不覆盖 Lime GUI、App Server、browser、tool policy 和 evidence 主链。

2. **Terminal-Bench / Harbor 比 DeepSWE 更贴近 Lime 的终端和工具链风险。**
   官方站点已列出 Terminal-Bench 2.x active 线，Harbor 仍是主要 harness 方向；本地 fixed slice 继续 pin 当前下载 commit，升级到新上游版本时必须重新建立 baseline。

3. **BrowserGym 是 WebArena / WorkArena 的优先 adapter 候选。**
   它能减少 Web benchmark 之间的观察 / 动作接口差异，适合后续承接 Lime browser runtime 和网页任务雷达。

4. **OSWorld 2.0、GAIA、tau3-bench 更适合 P2 能力雷达。**
   OSWorld 侧重真实桌面 computer-use，GAIA 侧重通用助手和工具推理，tau 系列侧重多轮用户 + API tool + policy consistency；它们对能力画像重要，但默认不应阻断每个大版本发布。

## 1. 选择原则

Lime 的测试集选择按以下标准排序：

1. **覆盖 Lime 真实风险**：App Server、RuntimeCore、Electron GUI、terminal、tool、browser、coding、evidence、release startup。
2. **有确定性 verifier**：优先使用程序化测试、环境状态检查、数据库状态检查、patch verifier；LLM judge 只作为辅助。
3. **可复现和可归档**：任务环境、模型配置、工具面、日志和结果必须可回放。
4. **能接入 Evidence Pack**：外部 runner 不能只输出 leaderboard 分数。
5. **成本可控**：固定 smoke、小样本 release slice、nightly / weekly 扩展、full run 分层。
6. **污染风险可控**：公开固定集只用于趋势，不作为唯一发布门禁。
7. **覆盖弱项而不是重复强项**：同类 coding benchmark 不需要全部变成 P0。

## 2. 推荐分层

### P0：Lime Release Benchmark

性质：私有、版本门禁、必须每个大版本运行。

来源：

- `internal/test/agent-qc-scenarios.manifest.json`
- `internal/test/harness-evals.manifest.json`
- `.lime/harness/sessions/*/replay`
- 发布前真实 GUI / runtime / tool / browser / workspace 失败沉淀

覆盖：

- Command bridge / App Server JSON-RPC / Electron Desktop Host
- Claw / AgentRuntime streaming / cancel / continue
- Tool approval / sandbox / terminal process
- Skill Forge / MCP / Browser Runtime / Knowledge / Workspace restore
- Harness replay / evidence / review / trend
- Release package startup

结论：这是发布 gate 的主事实源，不允许被任何外部 benchmark 替代。

### P1：Terminal-Bench / Harbor

定位：Lime 外部 benchmark 首选。

原因：

- 任务形态是 terminal-native agent，贴近 Lime 的 shell、sandbox、tool timeline、process control、long-horizon execution。
- Terminal-Bench 2.x / Harbor 是当前较稳定的使用入口；上游版本升级先进入新 manifest / 新 baseline，不直接和旧 fixed slice 混比。
- 容易把 `/logs/agent/trajectory.json`、命令输出、最终环境状态接到 Lime Evidence Pack。

采用方式：

- P1 release slice：固定 10-20 个任务，覆盖 coding、server setup、debugging、data / ML、system task。
- weekly full / expanded slice：按成本扩大。
- 大版本必须至少跑 release slice；full run 可作为 RC 后置或 nightly。

通过门槛：

- 不要求每次绝对高分，但不能相对上一稳定版本出现未解释回退。
- 失败必须归类为 agent bug、tool/runtime bug、environment issue、grader issue 或 expected model limitation。

官方来源：

- https://www.tbench.ai/
- https://github.com/harbor-framework/terminal-bench
- https://www.tbench.ai/news/announcement-2-0

### P1：DeepSWE

定位：长程真实开源代码修改能力。

原因：

- 官方说明为 113 个任务，覆盖 TypeScript、Go、Python、JavaScript、Rust，并带隔离环境和程序化 verifier。
- 比 SWE-bench 更强调长程、多语言、较大 patch，贴近 Lime coding agent 的上限测试。
- 截图中的固定 10 题适合 smoke / model bake-off，但不能作为唯一质量判断。

采用方式：

- DeepSWE smoke：固定 10 题，用于版本前快速比较。
- DeepSWE release slice：20-30 题，覆盖语言和任务类型。
- DeepSWE full：大版本 RC 或模型候选最终比较时运行。

通过门槛：

- 记录 pass@1、成本、用时、工具错误、测试失败类型。
- 相对上一稳定版本不得出现显著回退；如回退，必须有模型切换、工具限制或环境差异解释。

官方来源：

- https://deepswe.datacurve.ai/
- https://github.com/datacurve-ai/deep-swe

### P1 / P2：SWE-bench

定位：行业横向对比，不作为 Lime 首选外部 gate。

原因：

- SWE-bench 原始集是 2,294 个 Python GitHub issue；Verified 是 500 个 human-filtered 实例。
- 生态成熟，横向比较价值高。
- 但任务域偏 Python issue patch，不能覆盖 Lime GUI、terminal policy、browser、evidence 和 App Server 主链。

采用方式：

- SWE-bench Lite / Verified 子集用于横向兼容。
- 不进入 P0 发布阻断；只在 coding profile 或模型候选比较时进入 P1/P2。

官方来源：

- https://github.com/swe-bench/SWE-bench
- https://www.swebench.com/
- https://www.swebench.com/verified.html

### P2：WebArena / BrowserGym / WorkArena

定位：浏览器自动化、站点适配、网页任务完成度。

原因：

- WebArena 提供 self-hostable web environment，论文页说明有 812 个 web-based tasks。
- BrowserGym / AgentLab 提供统一 web agent research harness；WorkArena 更偏 enterprise web workflow。
- 对 Lime browser runtime、site adapter、visual / DOM grounding 有价值。

采用方式：

- 先接 WebArena fixed smoke：信息查找、表单、配置、导航。
- BrowserGym 作为后续统一 web benchmark adapter 候选。
- WorkArena 只在 enterprise workflow 产品化后进入扩展集。

官方来源：

- https://github.com/web-arena-x/webarena
- https://arxiv.org/html/2307.13854v4
- https://github.com/ServiceNow/BrowserGym
- https://servicenow.github.io/WorkArena/

### P2：OSWorld

定位：真实桌面 computer-use / GUI 自动化能力。

原因：

- OSWorld 官方说明包含 369 个真实 computer tasks，并提供可复现 setup / evaluation scripts。
- Lime 是桌面 GUI 产品，但 OSWorld 环境重、成本高，且不能直接覆盖 Lime 自己的 Electron GUI 主路径。

采用方式：

- 不作为 P0 发布阻断。
- 大版本只跑小样本或专项能力评估。
- 更适合验证 computer-use、跨应用操作、文件系统和视觉 grounding。

官方来源：

- https://os-world.github.io/
- https://github.com/xlang-ai/OSWorld-V2
- https://github.com/xlang-ai/OSWorld

### P2：GAIA

定位：通用助手、搜索、文件、多模态、工具推理。

原因：

- 官方论文说明 GAIA 有 466 个真实问题，要求 reasoning、multi-modality、web browsing 和 tool use。
- 适合评估 Lime 的 general assistant 能力，但不是代码修复或 GUI 产品回归。

采用方式：

- 先跑 public dev set / Level 1 子集。
- 只作为能力雷达，不作为 release blocker。
- 对 search / file / multimodal / citation / exact answer 做专项趋势。

官方来源：

- https://huggingface.co/papers/2311.12983
- https://huggingface.co/datasets/gaia-benchmark/GAIA
- https://huggingface.co/spaces/gaia-benchmark/leaderboard

### P2：tau3-bench / tau2-bench / tau-bench

定位：多轮用户交互、API tool use、业务策略遵循、一致性。

原因：

- tau 系列关注 simulated user + domain-specific API tools + policy guidelines，强调 pass^k 一致性。
- 对 Lime 的 approval、policy、tool strategy、长对话可靠性有价值。
- 2026-07-10 WebSearch 复核后，旧 tau-bench 仓库只作为历史参考缓存；新的 fixed slice 应优先评估 tau3-bench，再按领域和 runner 成熟度决定是否回补 tau2-bench。

采用方式：

- 先做 tau3-bench 小样本；若 banking / airline / retail 领域 runner 可复现，再纳入 weekly radar。
- 重点记录 pass^k，不只看 pass@1。
- 适合 release 后 weekly / model candidate 比较，不直接进入 P0。

官方来源：

- https://github.com/sierra-research/tau3-bench
- https://tau3-bench.github.io/
- https://github.com/sierra-research/tau-bench
- https://github.com/sierra-research/tau2-bench
- https://arxiv.org/abs/2406.12045
- https://taubench.com/

## 3. 不建议当前进入门禁的集合

| 测试集 | 当前处理 | 原因 |
| --- | --- | --- |
| Terminal-Bench 3.0 | 跟踪 | 官方显示 in progress，先不设为稳定 release gate。 |
| VisualWebArena | 候选 | 对视觉网页任务有价值，但先等 WebArena / BrowserGym adapter 成熟。 |
| OSWorld full | 候选 | 环境重、成本高，适合专项，不适合每个版本默认 full run。 |
| GAIA full / private leaderboard | 候选 | 能力雷达价值高，但和 Lime 发布回归的直接关联弱。 |
| 单一 DeepSWE 10 题 | 只做 smoke | 样本太小，公开固定，不能代表整体质量。 |

## 4. 首批固定测试集建议

### Release Gate P0

- Lime 私有 P0 场景：全部必跑。
- Harness replay fixtures：全部必跑。
- GUI smoke：全部必跑。
- Agent QC release summary：必产出。

### Release Gate P1

- Terminal-Bench / Harbor fixed slice：10-20 题。
- DeepSWE fixed slice：10-20 题。
- SWE-bench Lite / Verified small slice：可选，用于对外横向口径。

### Release Radar P2

- WebArena fixed slice：5-10 题。
- OSWorld small slice：3-5 题。
- GAIA Level 1 dev slice：10-20 题。
- tau3-bench small slice：优先选可复现领域各 5-10 题。

## 5. 测试集维护规则

1. 每个测试集必须有 owner、版本、source URL、license / usage note、task count、成本预算、默认 slice。
2. 固定 slice 每个大版本运行；轮换 slice 用于防止过拟合。
3. 公开 benchmark 任务不得出现在系统提示词或专门 prompt patch 中。
4. 新失败必须进入 failure taxonomy，并至少沉淀一个内部 regression artifact。
5. 上游 benchmark 版本变化时，必须重新建立 baseline，不能和旧版本直接比较。
