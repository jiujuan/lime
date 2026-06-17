# Agent Workspace Artifact / Evidence / Replay 评分卡

> 当前静态分：`3.5 / 5`  
> 目标：验证 Agent Workspace 是否把最终交付、过程证据、review 和 replay 从聊天正文中分离出来。

## 1. 5 分标准

| 能力 | 5 分要求 |
| --- | --- |
| Artifact Workspace | 交付物可预览、编辑、复制、导出、定位 |
| Version / diff | artifact 版本、文件 diff、review 状态可见 |
| Evidence Pack | 工具、来源、请求、响应、审批、验证结果可导出 |
| Replay | 从 evidence / transcript 重放关键 UI 状态 |
| Review lane | 机器/人工 review verdict 与 evidence 绑定 |
| Source refs | 研究/搜索/浏览引用真实来源，不用 prose 伪造 |

对导入会话，Evidence Pack 还必须保留 source provenance 和 fidelity summary：session metadata / business object 中包含 `codexImportFidelity`，message / runtime event 层包含 `sourceProvenance`，至少能追溯 source client、thread id、source path、rollout line seq、event type、payload type 和 call id。Replay / review 只能消费 Lime current read model 与 evidence/export 输出，不允许为了补细节再直接读取 Codex 原始 rollout 作为第二套 trace store。

## 2. 当前证据

| 证据 | 判断 |
| --- | --- |
| Lime Evidence Pack / qcloop / agent-qc 文档 | Evidence 是 Lime 强项 |
| `CanvasWorkbenchLayout`、Artifact refs、artifact renderer tests | Artifact UI 有基础 |
| AgentUI artifact / evidence surface | Artifact 和 Evidence 是独立 surface |
| Claude Artifacts 产品模式 | 大交付物应离开聊天正文 |
| CodexMonitor diff / git / review | Coding artifact 与 diff/review 强相关 |

## 3. 评分维度

| 评测项 | 当前分 | 必须补证 |
| --- | ---: | --- |
| Artifact card | 3.0 | 真实 artifact.created -> UI card |
| Preview / edit | 3.0 | artifact 内容可预览并可继续编辑 |
| Version / diff | 2.5 | 多版本和 diff 可见 |
| Export | 2.5 | 导出进入 artifact/evidence 事实 |
| Evidence pack | 4.0 | qcloop evidence 与 Agent Workspace UI 联动 |
| Replay | 3.0 | 从 transcript 重建过程 |
| Review lane | 2.5 | review verdict 绑定 evidence |

## 4. P0 实测场景

| 场景 | 输入 | 必须通过 |
| --- | --- | --- |
| `artifact-delivery` | 生成短文档或代码文件 | artifact card、preview、final answer 引用 |
| `artifact-diff` | 修改已有 artifact | version / diff 可见 |
| `evidence-export` | 导出一次工具任务 evidence | evidence refs、文件存在、schema 通过 |
| `replay-basic` | 用 transcript 重放 | UI summary 和原运行一致 |
| `imported-codex-evidence` | 导入一条含 tool / command / patch / approval 的 Codex 会话后导出 evidence | evidence pack 中有 `codexImportFidelity`，message / runtime event 下钻有 item `sourceProvenance`，unsupported / budgetDropped 不丢失摘要 |

## 5. 失败模式

| 失败 | 阻断原因 |
| --- | --- |
| 大交付只在聊天正文 | 不可继续编辑、不可版本化 |
| Evidence 只存在工程脚本，产品 UI 看不到 | 用户不可复核 |
| Review verdict 无 source/evidence | 审查无法追责 |
| Replay 与原过程不一致 | release gate 不可信 |

## 6. 下一刀

把 `artifact-delivery` 和 `evidence-export` 合成一条 P0：生成一个 artifact，同时导出包含 artifact refs 的 evidence。
