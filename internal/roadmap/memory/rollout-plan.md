# Lime 文件化记忆实施计划

> 状态：current rollout plan
> 更新时间：2026-06-18
> 目标：用小步交付把 Lime 记忆主线收敛到文件化 memory store，清理旧记忆 / 旧灵感库 surface，并保留 Soul 交互配置。

## 1. 实施原则

1. 先定 store 和 backend 合同，再删除旧入口。
2. 先让 summary 注入稳定，再开放工具读取。
3. 先文本搜索和 citation，再考虑派生索引。
4. 旧记忆和旧灵感库数据不批量导入为新事实源。
5. Soul 保留在 `memory.soul` 配置层，不并入长期记忆文件。
6. 派生索引损坏时必须可降级。
7. 不在本路线图继续扩展旧灵感库、active recall、external provider。

## 2. Phase 0：文档和事实源收口

目标：

1. 删除旧“更像我 / companion / taste layer”扩展路线。
2. 把 memory roadmap 改成文件化记忆单主线。
3. 明确 `unified_memory_*` / `memory_runtime_*` / 旧灵感库为 dead / cleanup surface。
4. 明确 Soul 是 current 交互配置，不是旧 companion 桌宠。
5. 明确向量数据库只是未来派生索引候选。

主产物：

1. `README.md`
2. `prd.md`
3. `architecture.md`
4. `diagrams.md`
5. `rollout-plan.md`
6. `acceptance.md`

验证：

```bash
rg -n "make-next-generation-more-like-me|active memory|external memory provider|lime-rs/src" "internal/roadmap/memory"
rg -n "Soul|SOUL|soul|companion" "internal/roadmap/memory"
```

预期：

1. 不出现外部项目名或旧数据搬入口径。
2. 旧主线词只出现在 dead / 非目标 / 清理说明中。
3. Soul 出现在 current 和验收边界中；`companion_*` 只作为 dead 出现。

## 3. Phase 1：Memory Store、Backend 合同与 Soul 保留

目标：

1. 定义 memory folder layout。
2. 定义 `MemoryBackend` request / response。
3. 实现本地文件系统 backend。
4. 建立 path traversal、symlink、hidden path 防护。
5. 保持 `memory.soul` 配置读写、模板、`SOUL.md` 导入 / 复制能力。

建议落点：

1. App Server / RuntimeCore current 主链。
2. 新增领域模块命名用 `memory_store` / `memory_tools`，不新增品牌前缀。
3. 路径解析复用统一 app path / workspace path 边界。
4. Soul 复用现有 `MemorySoulConfig` 和 `src/lib/soul/soulConfig.ts` 契约。

最小测试：

1. list/read/search/add note 单元测试。
2. symlink / traversal / hidden path 拒绝测试。
3. 非 UTF-8 文件跳过测试。
4. `SOUL.md` 导入预览、warning、应用草稿、复制输出测试。
5. artifact voice brief 不写长期记忆测试。

## 4. Phase 2：Summary 注入与 Memory Tools

当前进度：

1. 已完成 `memory_summary.md` prompt contributor：`RuntimeCore` 在 turn start 前通过 `MemoryAppDataSource::read_memory_store` 读取 summary，写入 `runtime_options.metadata.memory_store_prompt_context`，`runtime_backend` 在合成 system prompt 时追加受控 memory block。
2. 已覆盖空 summary 不注入、读取失败不阻塞、workspace scope 优先、summary block 标识为长期记忆且不是用户本轮输入。
3. 已完成 Soul 交互 contributor：运行时读取保存后的 `memory.soul` 配置，注入受控交互片段；不读取、不引用 `SOUL.md` 路径。
4. 已完成 dedicated memory tools 注册：`RuntimeBackend` 通过 App Server current `AppDataSource / MemoryAppDataSource` 注入 `memory_list`、`memory_read`、`memory_search`、`memory_add_note` native tools，避免只存在 catalog 的假入口。
5. 尚未完成 tool telemetry 的持久化与 GUI 展示增强；当前工具结果已经通过 tool result metadata 返回 path / citation / truncated / nextCursor。

目标：

1. thread start / turn start 注入截断后的 `memory_summary.md`。
2. 注册 dedicated memory tools。
3. 工具输出带 citation 字段。
4. prompt 指令约束 quick memory pass，避免无界搜索。
5. Soul 作为交互 contributor 注入受控片段。

建议改动：

1. Prompt contributor 只读 summary。
2. Tool contributor 挂到 App Server current runtime。
3. Tool telemetry 记录 tool name、path scope、truncated。
4. 前端或 GUI 只展示工具结果，不自行读取 memory folder。
5. 专家 persona 只继承 Soul 的 `communication_rhythm`，不回写全局 Soul。

最小测试：

1. 空 summary 不注入。
2. 长 summary 截断。
3. `memory_search` 分页和 `matchMode`。
4. `memory_read` 的 `lineOffset / maxLines / maxTokens`。
5. Soul 关闭时不注入交互片段。
6. expert persona metadata 不包含 `SOUL.md` 文件路径。

如涉及 App Server JSON-RPC 或前端 API 网关，补：

```bash
npm run test:contracts
```

## 5. Phase 3：旧记忆与旧灵感库清理

当前进度：

1. 旧 `src/components/memory/**` 混合 MemoryPage、旧灵感保存 helper、旧 `unifiedMemory` / `memoryRuntime` 前端网关、旧 memory feedback 前端侧链已删除。
2. 旧 `lime-rs/crates/memory/**` SQLite memory crate、App Server 旧 `local_data_source/unified_memory.rs` 和旧 `processor/unified.rs` 已删除。
3. `legacySurfaceCatalog` 与 `memoryStore.current-boundary.test.ts` 已把上述路径标记为 `dead / forbidden-to-restore`。
4. 旧 MemoryPage 的 `memoryLibrary.*` 多语言资源已删除，并由 `memoryStore.current-boundary.test.ts` 防回流。
5. 旧数据不迁移，不批量导入 memory store canonical content。

目标：

1. 删除 `unified_memory_*` 产品入口和新增写入入口。
2. 删除 `memory_runtime_*` 默认 recall 入口。
3. 删除旧 MemoryPage 灵感库 / 高级诊断混合入口。
4. 为暂未物理删除的旧命令名、旧 UI 入口和旧 provider 口径补负向守卫。

建议改动：

1. 旧入口 fail-fast，而不是继续做数据导入或只读续命。
2. 旧 embedding 只保留到物理删除窗口，不进入 canonical file。
3. 删除前保留必要 retired guard。
4. 清理报告记录 remaining references、owner 和删除条件。

退出条件：

1. `unified_memory_*` 不再作为产品入口、写入入口或旁路事实源。
2. runtime 不再依赖 `memory_runtime_*` 做默认 recall。
3. 旧灵感库页面、旧 API 和旧 provider 口径不再服务业务流程。
4. `companion_*` 不再出现在 current 文档、命令目录或 GUI 主路径中。
5. `npm run governance:legacy-report` 中 memory 相关条目只允许表现为已删除、零引用或显式 retired guard；若出现 production 引用，必须先处理再继续 memory tools / Soul 注入。

## 6. Phase 4：用户控制与 Reset

目标：

1. 用户能查看 memory store 摘要状态。
2. 用户能清空全局或 workspace memory。
3. 用户能添加修正 note。
4. 用户能看到记忆是否参与当前 turn。
5. 用户能明确选择 reset 是否包含 Soul。

建议改动：

1. 设置页提供 memory summary、store health、reset。
   - 2026-06-19：已补 `memoryStore/health` / `memoryStore/reset` App Server current 方法、Rust / npm client、前端 `memoryStore` 网关和设置页日常记忆状态面板。
   - reset 当前默认只清文件化 memory store root 下的 `MEMORY.md`、`memory_summary.md`、notes、index 与稳定目录内容；执行后重建空布局。
   - reset 默认保留 `memory.soul`，设置页确认文案明确 AI 个性不会被清理。
2. reset 清 memory folder、index；旧 SQLite stage data 已随旧 memory crate / unified memory 删除，不再作为 current reset 对象。
3. reset 不删除 thread history。
4. 使用记忆的回答可展示 citation。
5. Soul reset 单独受 scope 控制，不被 memory folder 清空隐式触发；包含 Soul scope 的 reset 不是当前默认入口，后续如需要再定义显式参数和 UI。

最小测试：

1. reset 后 summary 不再注入。
   - 已覆盖后端 reset 会清空并重建 `memory_summary.md`。
2. reset 不删除 thread history。
   - 当前 reset 实现只遍历 memory store root 子项，不触碰 session / thread store；仍需补跨 store 集成验证。
3. add note 后 note 文件存在且不会立即改 summary。
   - Phase 2 已覆盖 add note 写入 `extensions/ad_hoc/notes`；summary 合并仍是后续 consolidation 入口。
4. 不含 Soul scope 的 reset 保留 `memory.soul`。
   - 已覆盖后端返回 `preserved_soul: true`，设置页确认文案和回归测试确认 reset 只调 `memoryStore/reset`。
5. 包含 Soul scope 的 reset 恢复默认 Soul 配置。
   - 后续可选入口；当前默认 reset 不包含 Soul，避免把交互配置误当长期记忆本体。

## 7. Phase 5：派生索引

目标：

1. 当 memory folder 增大后，加入可选索引。
2. 索引只缓存 search projection，不保存 canonical content。
3. 支持 rebuild / health / fallback。

候选类型：

1. 内嵌全文索引。
2. 嵌入式搜索索引。
3. 可选向量索引。
4. 远端索引适配器。

准入条件：

1. 双平台打包验证通过。
2. 索引损坏能自动降级。
3. index 删除后可完整重建。
4. 不要求生产路径加载 mock backend。

## 8. 每轮完成定义

每个阶段收尾必须回答：

1. 当前唯一记忆事实源是否仍是 memory store。
2. Soul 是否仍在 `memory.soul` 配置层，而不是长期记忆文件。
3. 旧 `unified_memory_*` / `memory_runtime_*` 是否只在 dead / cleanup 范围。
4. 是否新增了平行记忆事实源。
5. summary 注入是否有预算和空态处理。
6. 工具结果是否可 citation。
7. 派生索引是否可删除、可重建、可降级。
