# Execution Tracker 旧路径退场计划（P0 收口）

## 1. 范围

本计划只针对统一执行追踪相关的“旧路径并存”问题，核心对象：

- `heartbeat_executions`（历史任务执行表，当前仍在写入）
- 各入口中散落的手工生命周期代码（`start -> finish`）

## 2. 当前状态（2026-02-20）

已完成：

1. `agent_runs` 已上线并接入 chat / skill / heartbeat
2. 统一查询命令 `execution_run_list/get` 已上线
3. 前端已提供执行轨迹观测入口

待收口：

1. `heartbeat_executions` 仍保留写入
2. Skill 入口仍有局部手工 finish 分支（因 `Ok(success=false)` 语义）

## 3. 退场策略

### Stage A（2026-02-20 ~ 2026-03-05）

- 保持双写：`agent_runs` + `heartbeat_executions`
- 观察数据一致性（status、duration、error）
- 将所有新入口默认接入 `ExecutionTracker`

### Stage B（2026-03-06 ~ 2026-03-20）

- 对 `heartbeat_executions` 增加“只读旧数据”标记说明（代码注释 + 文档）
- 停止新增依赖方读取 `heartbeat_executions`
- 评估并落地 Skill 入口 `Ok(success=false)` 的统一映射方案

### Stage C（2026-03-21 ~ 2026-04-10）

- 切换 Heartbeat 写入到 `agent_runs` 单写（保留旧表只读）
- 清理重复生命周期实现，统一走 `with_run` 或等价包装
- 发布迁移公告与运维回滚预案

## 4. 风险控制

1. 任何阶段都保留 `PROXYCAST_EXECUTION_TRACKER_ENABLED` 开关
2. 单写切换前必须完成：
   - 一周线上无“running 悬挂”增长
   - 关键入口失败率无异常抬升
3. 如出现回归，优先回退到 Stage A 双写策略

## 5. 验收口径

满足以下条件视为“旧路径可下线”：

1. `agent_runs` 覆盖 chat/skill/heartbeat > 95%
2. 过去 7 天内 `heartbeat_executions` 与 `agent_runs` 核心字段一致性 > 99%
3. 无新增模块直接依赖 `heartbeat_executions` 写路径
