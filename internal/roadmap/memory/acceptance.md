# Lime 文件化记忆验收标准

> 状态：current acceptance plan
> 更新时间：2026-06-18
> 目标：定义 memory store、summary 注入、工具读取、Soul 保留、写入整理、旧路径清理和派生索引的可验证标准。

## 1. Store 验收

必须满足：

1. memory root 通过统一路径 resolver 获取。
2. 工具输出只使用相对路径。
3. `memory_summary.md`、`MEMORY.md`、`extensions/ad_hoc/notes/` 结构稳定。
4. hidden path、symlink、path traversal 默认拒绝。
5. 非 UTF-8 文件不会导致 search/list 整体失败。
6. reset 能清空 memory folder 和 index。

不通过：

1. 代码里硬编码 macOS / Windows 用户目录。
2. 工具返回绝对路径。
3. 前端组件绕过 backend 直接扫描文件。

## 2. Prompt 注入验收

必须满足：

1. 每轮默认只读 `memory_summary.md`。
2. summary 为空时不注入。
3. summary 超预算时截断。
4. 注入块明确标识为 memory，不是用户本轮输入。
5. summary 读取失败不阻塞 turn。
6. summary 不包含未脱敏凭证或敏感原文。
7. Soul 片段来自保存后的 `memory.soul`，并受开关和范围控制。

不通过：

1. 自动读取 `MEMORY.md` 全文注入。
2. 每轮自动搜索所有 rollout summaries。
3. 注入内容随历史线性增长。
4. 把 `SOUL.md` 文件路径当运行时事实源。

## 3. Tool 验收

### 3.1 `memory_list`

必须满足：

1. 支持 `path`、`cursor`、`maxResults`。
2. 返回 file / directory 类型。
3. 支持 `truncated / nextCursor`。

### 3.2 `memory_read`

必须满足：

1. 支持 `path`、`lineOffset`、`maxLines`、`maxTokens`。
2. 返回 `startLineNumber`、`content`、`truncated`。
3. 行号为 1-indexed。
4. 超范围有明确错误。

### 3.3 `memory_search`

必须满足：

1. 支持多 query。
2. 支持 `any`、`allOnSameLine`、`allWithinLines`。
3. 支持 `caseSensitive`、`normalized`、`contextLines`、`cursor`。
4. 返回 `matchedQueries`、`matchLineNumber`、`contentStartLineNumber`。
5. 空 query 被拒绝。

### 3.4 `memory_add_note`

必须满足：

1. 只写 `extensions/ad_hoc/notes/`。
2. 文件名经过校验。
3. 空 note 被拒绝。
4. 不直接修改 `MEMORY.md` 或 `memory_summary.md`。

## 4. Soul 验收

必须满足：

1. `memory.soul` / `MemorySoulConfig` 保持 current。
2. `SOUL.md` 导入必须先预览，再应用到草稿并保存。
3. `SOUL.md` 导入 warning 至少覆盖 `project_rules`、`local_path`、`secret_like`、`too_long`。
4. `SOUL.md` 复制输出只是快照；运行时读取保存后的 app config。
5. balanced / direct / creator 模板仍能写入 `memory.soul`。
6. `buildSoulArtifactVoiceGenerationBrief` 只生成 `generation_brief_only`。
7. artifact voice brief 不写 `MEMORY.md`、`memory_summary.md` 或 ad-hoc note。
8. expert persona 只继承 `communication_rhythm`，并且 `writes_back_to_global_soul` 为 false。

不通过：

1. 把 Soul 判成旧 `companion_*` 桌宠链路并删除。
2. `SOUL.md` 导入绕过 warning 直接保存。
3. artifact voice 进入长期记忆。
4. expert persona 覆盖全局 Soul。

## 5. Citation 验收

必须满足：

1. 任何被最终回答使用的 memory hit 都能产生 path / line range。
2. citation 指向 memory folder 内实际读取的文件。
3. 不引用空行。
4. 不把 workspace 普通文件伪装成 memory citation。
5. 回答里不把未验证旧记忆当成当前事实。

## 6. 写入与整理验收

必须满足：

1. 显式“记住”写入 ad-hoc note。
2. 后台 consolidation 才能更新 `MEMORY.md` / `memory_summary.md`。
3. consolidation 有安全扫描。
4. 敏感或冲突条目进入待审或跳过。
5. consolidation 失败不让当前 turn 失败。
6. 写入当前 turn 后不立即改写当前 prompt。

不通过：

1. 用户一句话被无审计地写进 summary。
2. 自动整理候选马上影响当前生成。
3. secret-like 内容进入 `memory_summary.md`。

## 7. 旧记忆与旧灵感库清理验收

必须满足：

1. `unified_memory_*` 不再作为产品入口、写入入口或旁路事实源。
2. `memory_runtime_*` 不再决定默认 recall。
3. 旧 MemoryPage 灵感库 / 高级诊断混合视图被删除或 retired guard 封住。
4. `inspiration_*` 不再作为长期事实源出现。
5. embedding BLOB 不成为新事实源。
6. 旧入口删除前只允许 fail-fast / retired guard。
7. 不把旧数据批量导入为 memory store canonical content。
8. 旧 `companion_*` 桌宠命令链路只作为 dead / forbidden-to-restore 出现。

不通过：

1. 同一条记忆同时在文件和数据库里双写为 current。
2. 旧 `memory_runtime_*` 继续决定默认 recall。
3. 旧路径为了兼容继续新增业务逻辑。
4. 旧灵感库继续作为 GUI 或旁路入口。
5. 清理失败无报告或无 owner。

## 8. 派生索引验收

必须满足：

1. index 可删除。
2. index 可完整重建。
3. index 损坏时降级文本扫描。
4. index manifest 记录 schema version、source checksum 或更新时间。
5. index 不保存 canonical content。
6. 向量库或 FTS 库不影响 memory store 读写。

不通过：

1. 没有索引就不能搜索。
2. 索引成为唯一存储。
3. 向量库动态库加载失败导致 memory tools 全部不可用。

## 9. Governance 验收

必须满足：

1. `internal/roadmap/memory` 不再把旧灵感库路线当 current。
2. 不再引用 `lime-rs/src/**` 作为新实现落点。
3. 不再把 active recall、external provider、Dreaming 作为默认主线。
4. 不再把任何具体外部索引库作为 P0 current。
5. 不出现外部项目名作为路线图标题或主线口径。
6. 不出现旧数据搬入口径。
7. `make-next-generation-more-like-me.md` 已删除。

建议检查：

```bash
rg -n "make-next-generation-more-like-me|active memory|external memory provider|lime-rs/src" "internal/roadmap/memory"
rg -ni "具体外部索引库|外部向量数据库" "internal/roadmap/memory"
rg -n "Soul|SOUL|soul|companion" "internal/roadmap/memory"
```

允许出现的情况：

1. 旧主线词只在 `dead` / `非目标` / `清理` 段落中出现。
2. `Soul` / `SOUL` / `soul` 出现在 current、功能需求、图谱和验收边界中。
3. `companion_*` 只在 dead / 不通过判定中出现。

## 10. 不通过判定

出现任一情况，本路线图阶段不算完成：

1. 新增第二套长期记忆数据库事实源。
2. 默认依赖向量数据库才能检索记忆。
3. summary 注入无预算。
4. 记忆工具不能返回 citation。
5. 前端或 Electron Host 承接记忆业务逻辑。
6. 旧 `unified_memory_*` 继续增长下一代能力。
7. reset 后仍注入旧 summary。
8. 派生索引损坏导致记忆系统不可用。
9. 生产路径依赖 mock memory backend。
10. Soul 功能被旧桌宠治理误删。
