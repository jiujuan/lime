# 历史归档策略

> status: archive policy
> owner: governance
> last_verified: 2026-07-12

## v1 的处理

v1 保留为历史研究目录，不作为 v2 current owner。不要把已经从工作树删除的 v1 handoff、priority log 或 upstream diff 恢复回来；需要追溯时使用 Git history，并在 v2 evidence 中记录 commit/path。

v2 不复制 v1 的断链导航。任何历史引用必须写成：

```text
历史来源：v1/<path>@<commit>
当前替代：v2/<path>
```

## 文档状态

| 状态 | 规则 |
| --- | --- |
| `current` | 可作为 owner/契约依据，被 active 计划引用 |
| `research` | 只读对照，不能定义 current API |
| `evidence` | 不可变命令结果和截图索引 |
| `archive` | 只能追溯，不能进入导航/测试/实现 |

## 链接门禁

提交前扫描所有 `v2/**/*.md` 的相对链接：

- 目标不存在即失败。
- 链接指向 v1 已删除文件即失败。
- active 计划不得引用 `99-archive` 作为实现 owner。
- 归档文件不得被代码、catalog 或测试 import。

## 归档完成条件

只有当 v2 S7 完成、evidence 汇总已生成、旧入口已删除并通过 Gate B 后，才可以把 v2 文档标记为 archive；在此之前 v2 是 current research/plan，不得提前冻结。
