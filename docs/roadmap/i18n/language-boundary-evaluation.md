# i18n language boundary 评估

> 关联 PRD：`docs/roadmap/i18n/prd.md`
> 关联进度：`docs/roadmap/i18n/implementation-progress.md`
> 评估时间：2026-05-24

## 评估目标

在实现 AI response language 或扩大 content target language 前，先确认仓库里现有 `language` / `locale` / `accept_language` 等 language-like 字段分别属于哪个产品语义，避免把 UI locale 当成所有语言能力的隐式事实源。

## 当前事实

- 新增 `scripts/i18n-language-boundary-report.ts`，默认扫描 `src/` 与 `src-tauri/`，并把 language-like marker 分类为：
  - `uiLocale`
  - `agentResponseLanguage`
  - `contentTargetLanguage`
  - `browserEnvironmentLanguage`
  - `asrLanguage`
  - `codeLanguage`
  - `unknownLanguageLike`
- 证据已落盘到 `docs/roadmap/i18n/evidence/language-boundary-report.json`。
- 报告已支持 `--category <category>` 聚焦输出，并在 summary 中提供 file / marker 热点，便于后续把新增 language-like 字段挂回明确边界。
- 当前全量扫描 3007 个源码文件，识别 1935 个 marker。
- `contentTargetLanguage` 聚焦证据已落盘到 `docs/roadmap/i18n/evidence/content-target-language-boundary-report.json`。

## 当前统计

| 分类 | 数量 | 说明 |
| ---- | ---- | ---- |
| `uiLocale` | 1081 | 主要来自 i18next、格式化、设置页、配置默认值和运行时导出 locale |
| `contentTargetLanguage` | 418 | Artifact、Knowledge、media task、workspace artifact preview 等内容 / 产物语言 |
| `codeLanguage` | 121 | code fence、Markdown renderer、Artifact parser、general chat code block language |
| `asrLanguage` | 97 | 语音模型、语音输入、转写任务和 ASR 配置 |
| `browserEnvironmentLanguage` | 91 | Browser Environment preset 的 `Accept-Language`、locale、WebView 启动语言 |
| `agentResponseLanguage` | 32 | Agent request metadata、prompt stage 与 runtime projection 的 response language |
| `unknownLanguageLike` | 95 | 仍需人工判定的 language-like marker |

## Content target language 证据

聚焦命令：

```bash
npm run i18n:language-boundary-report:json -- --category contentTargetLanguage --output "docs/roadmap/i18n/evidence/content-target-language-boundary-report.json"
```

当前 `contentTargetLanguage=418`，marker 分布为：

| marker | 数量 | 说明 |
| ------ | ---- | ---- |
| `language` | 257 | Artifact document、Knowledge、media task 等内容元数据 |
| `target_language` | 82 | Service Skill / task payload 中的显式任务目标语言 |
| `targetLanguage` | 48 | 前端派生 payload、预览或 helper 层的 camelCase 形式 |
| `locale` | 31 | 已被 Artifact / content 相关路径吸收的 locale-like 内容字段，后续修改时仍需人工确认是否真是内容语言 |

当前热点文件前五位：

| 文件 | 数量 | 边界判断 |
| ---- | ---- | ---- |
| `src-tauri/src/commands/media_task_cmd.rs` | 46 | media task 产物语言 / 内容语言 |
| `src/components/artifact/ArtifactToolbar.test.ts` | 24 | Artifact UI 测试里的内容 language fixture |
| `src/components/agent/chat/utils/taskPreviewFromToolResult.ts` | 22 | tool result preview 的内容语言展示 |
| `src-tauri/crates/knowledge/src/lib.rs` | 19 | Knowledge 内容语言元数据 |
| `src/components/artifact/renderers/CodeRenderer.tsx` | 15 | Artifact code renderer 的内容 / code language 边界热点 |

本轮结论：`target_language` 是任务级 content target language，Artifact document `language` 是文档级元数据，两者都不能从 UI locale 自动写回；需要默认值时，应在具体任务或文档生成协议中显式定义，而不是复用 `Config.language`。

已补可执行反向回归：导出型 Service Skill 若只携带 adapter `locale` 参数、没有显式 `target_language`，不会生成 `translation_skill_launch`；这证明 locale-like 参数不会被当作 content target language 自动写入翻译任务。

Artifact document runtime 也已收口：validator 会保留显式 `document.language`，只在缺失时回退 `zh-CN`；stage2 output schema 会优先读取 turn metadata 里的 `target_language` / `artifact_language` / `content_target_language` 并把文档 `language` enum 收窄到该内容语言。该链路没有读取 UI locale 或 `Config.language`。

## 结论

当前不应直接新增一个全局 `response language` 并复用 `Config.language`。

原因：

1. 仓库里已经有 UI locale、Browser Environment、Artifact / Knowledge 内容语言、ASR 语言和 code block language 多套语义。
2. `unknownLanguageLike=95` 已收敛到可人工 review 的规模，但仍说明还有若干泛名字段尚未被清晰归类，贸然接入统一字段会扩大语义混用风险。
3. Browser Environment 里的 `Accept-Language` 已经是独立事实源，不能跟随 Lime UI locale 自动变化。
4. Artifact / Knowledge 的 `language` 更接近内容产物语言，也不应被 UI language 自动覆盖。

## 建议下一步

1. 先按 `unknownLanguageLike` 与 `contentTargetLanguage` 热点继续人工复核，尤其是 workspace artifact preview、transcription task preview、CLI 参数、mock fixture 和 Artifact renderer 中的泛名 `language` / `locale` 字段。
2. 实现 AI response language 前，先选定独立事实源，例如 workspace preference 或 agent request metadata，而不是复用 `Config.language`。
3. 每次修改 language-like 字段时复跑 `npm run i18n:language-boundary-report:json`；若改动涉及 Artifact / 文档 / 文章 / 翻译 / media task，再额外复跑 `--category contentTargetLanguage`。
4. 在剩余 unknown 被确认不会与 UI locale 混用后，再推进 response language 设置入口和 request metadata 注入。

## 证据链接

- [language-boundary-report.json](/Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/evidence/language-boundary-report.json)
- [content-target-language-boundary-report.json](/Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/evidence/content-target-language-boundary-report.json)
- [i18n-language-boundary-report.ts](/Users/coso/Documents/dev/ai/aiclientproxy/lime/scripts/i18n-language-boundary-report.ts)
- [PRD](/Users/coso/Documents/dev/ai/aiclientproxy/lime/docs/roadmap/i18n/prd.md)
