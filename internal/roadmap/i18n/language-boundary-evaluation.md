# i18n language boundary 评估

> 关联 PRD：`internal/roadmap/i18n/prd.md`
> 关联进度：`internal/roadmap/i18n/implementation-progress.md`
> 评估时间：2026-05-26

## 评估目标

在实现 AI response language 或扩大 content target language 前，先确认仓库里现有 `language` / `locale` / `accept_language` 等 language-like 字段分别属于哪个产品语义，避免把 UI locale 当成所有语言能力的隐式事实源。

## 当前事实

- 新增 `scripts/i18n-language-boundary-report.ts`，默认扫描 `src/` 与 `lime-rs/`，并把 language-like marker 分类为：
  - `uiLocale`
  - `agentResponseLanguage`
  - `contentTargetLanguage`
  - `browserEnvironmentLanguage`
  - `asrLanguage`
  - `codeLanguage`
  - `unknownLanguageLike`
- 证据已落盘到 `internal/roadmap/i18n/evidence/language-boundary-report.json`。
- 报告已支持 `--category <category>` 聚焦输出，并在 summary 中提供 file / marker 热点，便于后续把新增 language-like 字段挂回明确边界。
- 当前全量扫描 3128 个源码文件，识别 1999 个 marker。
- `contentTargetLanguage` 聚焦证据已落盘到 `internal/roadmap/i18n/evidence/content-target-language-boundary-report.json`。

## 当前统计

| 分类 | 数量 | 说明 |
| ---- | ---- | ---- |
| `uiLocale` | 1111 | 主要来自 i18next、格式化、设置页、配置默认值和运行时导出 locale |
| `contentTargetLanguage` | 428 | Artifact、Knowledge、media task、workspace artifact preview 等内容 / 产物语言 |
| `codeLanguage` | 177 | code fence、Markdown renderer、Artifact parser、general chat code block language |
| `asrLanguage` | 123 | 语音模型、语音输入、转写任务和 ASR 配置 |
| `browserEnvironmentLanguage` | 114 | Browser Environment preset 的 `Accept-Language`、locale、WebView 启动语言 |
| `agentResponseLanguage` | 45 | Agent request metadata、prompt stage 与 runtime projection 的 response language |
| `unknownLanguageLike` | 1 | 当前仅剩 `vision-language` 模型能力别名这一条人工复核 false positive，不是 UI locale / 自然语言偏好 |

## Content target language 证据

聚焦命令：

```bash
npm run i18n:language-boundary-report:json -- --category contentTargetLanguage --output "internal/roadmap/i18n/evidence/content-target-language-boundary-report.json"
```

当前 `contentTargetLanguage=428`，marker 分布为：

| marker | 数量 | 说明 |
| ------ | ---- | ---- |
| `language` | 257 | Artifact document、Knowledge、media task 等内容元数据 |
| `target_language` | 90 | Service Skill / task payload 中的显式任务目标语言 |
| `targetLanguage` | 49 | 前端派生 payload、预览或 helper 层的 camelCase 形式 |
| `locale` | 32 | 已被 Artifact / content 相关路径吸收的 locale-like 内容字段，后续修改时仍需人工确认是否真是内容语言 |

当前热点文件前五位：

| 文件 | 数量 | 边界判断 |
| ---- | ---- | ---- |
| `lime-rs/src/commands/media_task_cmd.rs` | 57 | media task 产物语言 / 内容语言 |
| `src/components/artifact/ArtifactToolbar.test.ts` | 24 | Artifact UI 测试里的内容 language fixture |
| `src/components/agent/chat/utils/taskPreviewFromToolResult.ts` | 22 | tool result preview 的内容语言展示 |
| `lime-rs/crates/knowledge/src/lib.rs` | 19 | Knowledge 内容语言元数据 |
| `src/components/artifact/renderers/CodeRenderer.tsx` | 15 | Artifact code renderer 的内容 / code language 边界热点 |

本轮结论：`target_language` 是任务级 content target language，Artifact document `language` 是文档级元数据，两者都不能从 UI locale 自动写回；需要默认值时，应在具体任务或文档生成协议中显式定义，而不是复用 `Config.language`。

已补可执行反向回归：导出型 Service Skill 若只携带 adapter `locale` 参数、没有显式 `target_language`，不会生成 `translation_skill_launch`；这证明 locale-like 参数不会被当作 content target language 自动写入翻译任务。

Artifact document runtime 也已收口：validator 会保留显式 `document.language`，只在缺失时回退 `zh-CN`；stage2 output schema 会优先读取 turn metadata 里的 `target_language` / `artifact_language` / `content_target_language` 并把文档 `language` enum 收窄到该内容语言。该链路没有读取 UI locale 或 `Config.language`。

Media task runtime 继续收口：`audio_generate` 会把显式 `target_language` 同步保留到 pending / failed / completed 的 `audio_output` 摘要，并在支持 instruction 的 provider 请求中按该内容目标语言生成语音指令；`transcription_generate` 的 `language: "auto"` 只表示 ASR 自动识别，不会被发送为 provider 的显式语言参数，完成态 transcript language 以 provider 返回值为准。两条链路都没有从 UI locale 或 `Config.language` 自动派生内容 / ASR 语言。

## 结论

当前不应直接新增一个全局 `response language` 并复用 `Config.language`。

原因：

1. 仓库里已经有 UI locale、Browser Environment、Artifact / Knowledge 内容语言、ASR 语言和 code block language 多套语义。
2. `unknownLanguageLike=1` 已收敛到人工复核 false positive：`src/lib/model/oemCloudModelMetadata.ts` 的 `"vision-language"` 是模型能力别名，不是自然语言偏好；这证明 current 代码里的真实 language-like 字段已基本挂回明确边界。
3. Browser Environment 里的 `Accept-Language` 已经是独立事实源，不能跟随 Lime UI locale 自动变化。
4. Artifact / Knowledge 的 `language` 更接近内容产物语言，也不应被 UI language 自动覆盖。

## 建议下一步

1. 继续把唯一剩余 `unknownLanguageLike` 当作人工复核哨兵保留；如果后续出现新的 unknown，必须在同一刀内归类或说明其不是自然语言偏好。
2. 后续扩展 AI response language 时，继续沿 workspace preference / agent request metadata 独立事实源，不回退复用 `Config.language`。
3. 每次修改 language-like 字段时复跑 `npm run i18n:language-boundary-report:json`；若改动涉及 Artifact / 文档 / 文章 / 翻译 / media task，再额外复跑 `--category contentTargetLanguage`。
4. 后续新增 language-like 字段时，优先扩展分类规则和测试，而不是重新扩大模糊 unknown 池。

## 证据链接

- [language-boundary-report.json](/Users/coso/Documents/dev/ai/aiclientproxy/lime/internal/roadmap/i18n/evidence/language-boundary-report.json)
- [content-target-language-boundary-report.json](/Users/coso/Documents/dev/ai/aiclientproxy/lime/internal/roadmap/i18n/evidence/content-target-language-boundary-report.json)
- [i18n-language-boundary-report.ts](/Users/coso/Documents/dev/ai/aiclientproxy/lime/scripts/i18n-language-boundary-report.ts)
- [PRD](/Users/coso/Documents/dev/ai/aiclientproxy/lime/internal/roadmap/i18n/prd.md)
