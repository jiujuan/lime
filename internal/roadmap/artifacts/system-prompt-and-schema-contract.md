# Artifact Prompt 与 Schema 合同

> 状态：current
> 更新时间：2026-06-17
> 边界：本文件只定义正式交付物的 prompt/schema 合同；Preview Artifact Contract 不由模型 prompt 主导。

## 核心观点

正式交付物质量不能靠渲染器补救，必须由四层控制：

1. turn metadata 表达 intent。
2. prompt policy 表达规则。
3. output schema 表达结构。
4. validator / repair 决定能否进入 ready。

Preview artifact 不走这套生成合同。它是 source-backed UI projection，由系统根据 source 创建，模型最多引用或要求打开 source。

## 正式 Artifact 回合

适用：

- 生成报告、PRD、方案、研究、对比、计划。
- 局部 rewrite。
- 从 preview source 整理成正式文档。

不适用：

- 点击文件。
- 打开 DOCX。
- 打开 HTML。
- 打开图片或二进制。
- 打开 Plugin shell。

## Prompt 分层

正式 Artifact 回合继续采用分层 prompt：

1. Base Runtime Layer
2. Workspace / Team Layer
3. Memory Layer
4. Search / Source Layer
5. Artifact Policy Layer
6. Stage Contract Layer
7. Turn Context Layer
8. Schema Hint Layer

其中 Artifact 层只描述正式交付物：

- 不在消息区重复整篇文档。
- 输出白名单 block。
- 引用 sources。
- rewrite 只改目标 block 或显式范围。

## Output Schema

current 输出类型：

- `artifact_document_draft`
- typed incremental op
- `artifact_rewrite_patch`
- legacy `artifact_ops` compat 输入壳

方向：

- stage2 收敛到正式 draft 或单条增量 op。
- rewrite 收敛到 `artifact_rewrite_patch` 或目标 block 增量 op。
- `artifact_ops` 保留到模型稳定后删除。

## Preview Source 进入正式文档

当用户要求“把这个 DOCX / HTML / 文件整理成正式文档”时：

1. 系统先通过 Preview Artifact Contract 打开 source。
2. Runtime 把 source content 和 source metadata 放入 turn context。
3. 模型输出新的 `ArtifactDocument v1`。
4. validator 校验 sources 与 block。
5. Workbench 打开正式文档，而不是复用临时 preview artifact id。

## 失败策略

- 模型输出结构不合格：validator repair。
- repair 后仍不合格：降级为 failed artifact document，并保留 issue。
- source 内容不可读：在 preview artifact 中显示不可预览，不启动正式文档生成。
- DOCX 抽取失败：错误留在 file preview/domain 层，不伪造正式文档。
