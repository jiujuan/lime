# Lime Agent 与 Coding Evaluation

> status: current / Refactor v2

## 1. 与确定性测试分开

Agent evaluation 回答“指定模型和配置完成任务的质量与稳定性如何”，不回答协议、状态机或 Electron 链是否正确。L0-L6 deterministic gate 失败时不运行 eval；eval 失败中可确定复现的 runtime/tool 缺陷必须下沉为内部回归测试。

## 2. Evaluation 单元

| 术语 | 含义 |
| --- | --- |
| Task | 版本化任务、环境、预算和 grader |
| Trial | 指定 model/provider/config 下的一次独立执行 |
| Trajectory | Thread/Turn/Item、工具、审批、请求和结果的脱敏记录 |
| Outcome | verifier/grader 观察到的最终结果 |
| Failure class | agent/model/runtime/tool/environment/verifier/budget |

Task 不能把参考解、隐藏测试或 task-specific prompt patch 暴露给 Agent。

## 3. Grader

优先级：

1. 程序化 verifier：测试、schema、文件、数据库或可观察状态。
2. 结构化规则 grader：输出合同、工具权限、状态和 evidence 完整性。
3. 模型 grader：语义/质量判断；必须版本化 rubric，并用人工样本校准。
4. 人工评审：处理高价值、无法稳定自动判定的边界。

不要用 LLM grader 判定本可由代码精确验证的行为。

## 4. 指标

```text
pass@k = P(k 次尝试至少一次成功)
pass^k = P(k 次尝试全部成功)
```

同时记录：pass@1、成本、wall time、token、tool failures、approval/sandbox failures、no-op、timeout、patch size 和 failure class。所有比较必须固定 task slice、source commit、model/provider、tool policy、预算和 adapter version。

## 5. DeepSWE Coding

[DeepSWE v2 Coding 切片](../roadmap/benchmark/deepswe-coding-slice.md) 固定：

- Smoke 10：5 种语言各两题，用于 adapter/model/runtime 候选快速比较。
- Release 20：覆盖 streaming、cancellation、cache/persistence、multi-agent、parser/API 和 deterministic rewrite。
- Adapter 必须通过 Lime App Server JSON-RPC current 链执行，DeepSWE separate verifier 独立判分。

DeepSWE source、任务 ID 和执行合同见 `deepswe-coding-slice-v2.json`。旧 fixed-ten dry-run 结果不继承。

## 6. 产品任务 Eval

产品 eval 应来自真实高价值 workflow，例如 coding、工具审批、MCP/Skills、multi-agent、history recovery 和 multimodal。Replay 提升为 current task 前必须：

- 脱敏并最小化；
- 固定输入、环境和 expected outcome；
- 指定 grader 与失败分类；
- 映射 [../roadmap/benchmark/scenario-matrix.md](../roadmap/benchmark/scenario-matrix.md)；
- 证明不是某次实现轨迹的过拟合快照。

## 7. 运行 Lane

| Lane | Trials | 用途 |
| --- | --- | --- |
| bring-up | 1 | adapter/verifier/evidence 完整性，不评模型质量 |
| smoke | 1/task | runtime/model 候选快速信号 |
| bake-off | 3/task 或预算批准值 | pass@k/pass^k、成本和稳定性比较 |
| release | 冻结策略 | 对稳定 baseline 做 non-inferiority 判断 |

Live/eval 必须显式授权并隔离凭证。默认 PR 不调用真实 provider。

## 8. Evidence 与安全

每次 trial 记录 task/source、candidate、model/provider/config、tool catalog、budget、trajectory、outcome、grader、cost 和 failure class。不得保存 API key、Authorization、真实用户数据、reference solution、隐藏 verifier 内容或敏感本地路径。

公开 benchmark prompt 不进入 system prompt、skill 或 task router；发现 task-specific 特判时结果作废并按数据污染处理。
