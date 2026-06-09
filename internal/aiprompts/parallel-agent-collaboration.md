# 并行 Agent 协作

本文件约束多个 Agent / 终端进程同时开发 Lime 仓库时的协作方式。目标是减少猜测、避免夹写，并让每个进程都能明确知道自己能做什么。

## 启动协议

1. **先确认主线** - 用一句话复述当前路线图目标、阶段和本轮最小交付。
2. **先只读盘点** - 在目标范围内执行 `git status --short -- <scope>` 和 `git diff --name-only -- <scope>`；不要先改文件。
3. **声明写集** - 在动手前明确说出“我认领哪些文件 / 目录”“我只读哪些文件 / 目录”“我不碰哪些文件 / 目录”。
4. **写集要窄** - 优先按垂直切片认领最少文件；不能用“整个 `src/features/agent-app`”替代真实写集，除非任务确实需要。
5. **DevBridge 先分类再认领** - 涉及 `src/lib/dev-bridge/**` 时，先声明本轮触碰的是 `current` renderer bridge（`safeInvoke`、HTTP client、`app_server_handle_json_lines`、事件监听、可用性探测）还是 `compat / deprecated` 命令 policy / mock fallback。不要把整个目录当成旧 Rust DevBridge 的删除写集；清旧命令只认领对应命令组的 `commandPolicy`、`mockPriorityCommands`、负向测试和 contract guard。若只是只读审计但发现删不动且跨命令组长期存在的 legacy residual，也要回写到当前执行计划和 `CCD-012`，不能只留在 handoff。
6. **测试可共享** - 定向测试、`typecheck`、`git diff --check` 可以由任一进程执行，但报告时要说明它验证的是当前工作树，不代表改动归属。

## 冲突处理

1. **目标文件已脏时不夹写** - 如果目标文件已经被其他进程修改，默认切到只读审阅 / 验证；除非用户明确要求接管该文件。
2. **未跟踪相邻产物先确认** - 发现未确认的未跟踪文档、源码或生成物时，不合并、不删除、不改名，先说明风险和可选处理。
3. **必须改同一文件时先汇报补丁点** - 如果主线必须触碰对方写集，先给出文件、函数、最小补丁意图和验证命令，等待合并窗口。
4. **发现意外变化立即停下** - 修改过程中若同一文件出现非本人改动，停止写入并询问如何继续；不要用 checkout / reset 抹平。
5. **不要抢占外部仓库** - 跨仓库联动时，除非用户明确授权当前进程负责外部仓库，否则只读外部仓库并把需要的变更写成 handoff。
6. **共享热区先登记治理，不夹写** - App Server protocol / runtime / client、`src/lib/api/appServer.ts`、`src/lib/api/channelsRuntime.ts`、`scripts/check-command-contracts.mjs` 等命令迁移热区已被其它进程持有时，本进程只能做只读审计、边界测试或文档治理登记；需要修改的命令名、文件、退出条件必须回写到对应执行计划。跨命令组或长期存在的 DevBridge policy / mock residual 必须额外回挂 `internal/exec-plans/tech-debt-tracker.md` 的 `CCD-012`。

## 汇报格式

并行任务收尾时必须补充：

- **本轮认领写集**：列出实际修改的文件。
- **避让写集**：列出发现但没有触碰的并行文件或未跟踪产物。
- **验证口径**：说明跑过的命令验证了哪些边界。
- **下一刀归属**：说明下一步适合由当前进程做，还是应交给正在持有相关写集的进程。
- **治理分类**：如果涉及命令迁移或 `src/lib/dev-bridge/**`，必须说明残留 surface 属于 `current`、`compat / deprecated`、`dead / retired guard-only` 还是 `test-only`，以及是否已回挂当前执行计划；跨命令组长期 residual 还必须说明是否已回挂 `CCD-012`。
