# 清理库存

> status: cleanup inventory
> owner: governance
> last_verified: 2026-07-12
> source: `npm run governance:legacy-report`（扫描 2418 文件，0 零引用候选，0 分类漂移候选，0 边界违规；受控残留仍需按下表迁出）

## v1 文档清理

| 问题 | v2 处理 |
| --- | --- |
| v1 README/roadmap/follow-up/provider audit 引用已删除的 11 个文件 | 不恢复；v2 只引用现存 v2 文档和 Git history，链接检查设为硬门禁 |
| v1 研究、实施日志、完成审计混层 | 已拆成 facts/decisions/plan/evidence/upstream |
| v1 checkpoint 过期 | 以 `14-upstream/ledger.md` 当前 checkout 为准 |
| v1 把已存在的 catalog/scope 当作缺口 | 以 `01-current-facts/snapshot.md` 重新审计；下一步是拆分巨型 catalog |

## Lime 代码清理候选

| Surface | 分类 | 清理动作 | 回流守卫 |
| --- | --- | --- | --- |
| `agent_runtime_*` 生产命令/旧 bridge | `dead` | 删除 production registration、client export、正向 mock；保留负向 contract | `electron/ipcChannels.test.ts`、`commandPolicy.test.ts` |
| `lime-rs/src/**` / 旧 Tauri wrapper | `dead` | 不恢复；扫描路径和文档引用 | governance legacy catalog |
| `src/lib/api/agentRuntime.ts` 兼容 barrel | `compat` | 迁移 consumer 到分域 client 后删除 | import boundary test |
| 旧 direct provider mapper（`runtime-core` wire lowering） | `deprecated` | 迁到 `model-provider` 后删文件/模块声明 | provider source guard |
| `AgentChatWorkspace.tsx` 内 runtime 状态机 | `current debt` | 抽 command/projection/view model，删除重复 reducer/timeout | file-size + projection boundary |
| `app-server-protocol/v0/catalog.rs` 巨型手工表 | `current debt` | 按 domain 声明并生成 aggregate；不再复制列表 | generated diff/contract test |
| 旧 transcript/read model/GUI history path | `deprecated` | 统一到 ThreadStore/ProjectionStore 后删除 | read-model source guard |
| 生产 mock fallback/defaultMocks | `dead` | 删除 fallback；fixture 显式注入 external backend | mock policy tests + Gate B |
| 旧 Team/Board 多 agent UI runtime | `dead` | 删除入口、state、正向 fixture；保留 SubAgent projection | legacy surface catalog |

## 清理顺序

```text
先迁调用 -> 复制 current contract/test -> 删除实现/export/catalog -> 补负向 guard -> 跑 Gate B
```

任何 surface 若仍有真实 consumer，不能标为 `dead`；先把 consumer 列在对应 S 切片写集，禁止用新增 compat 延期。

## 退出条件

- `npm run governance:legacy-report` 无新增回流。
- `npm run test:contracts` 无旧命令正向注册。
- 旧目录、旧文档和旧 i18n key 无生产引用。
- 每个删除 surface 有负向测试或扫描规则。
