# Scheduler 任务治理 P1（连续失败 + 冷却恢复）

## 1. 目标

在不引入新子系统的前提下，为现有 `scheduled_tasks` 增加最小治理能力：

1. 连续失败计数（`consecutive_failures`）
2. 自动停用冷却（`auto_disabled_until`）
3. 冷却到期后自动恢复执行资格（无需人工启用）

## 2. 默认策略

- 连续失败阈值：`3`
- 冷却时长：`300s`
- 健康告警阈值（默认）：
  - 冷却任务数 `>= 1`（warning）
  - 悬挂运行任务数 `>= 1`（critical）
  - 24h 失败数 `>= 5`（warning）
- 适用入口：
  - `SchedulerService` 后台轮询执行链路
  - WebSocket RPC `cron.run` 手动触发链路

## 3. 数据模型与存储

`scheduled_tasks` 新增字段：

- `consecutive_failures INTEGER NOT NULL DEFAULT 0`
- `auto_disabled_until TEXT NULL`（RFC3339）

兼容策略：

- `SchedulerDao::create_tables` 会自动检查并补齐缺失列（`PRAGMA table_info` + `ALTER TABLE`）

## 4. 行为定义

### 成功

- `mark_completed` 时重置治理状态：
  - `consecutive_failures = 0`
  - `retry_count = 0`
  - `auto_disabled_until = NULL`

### 失败

- `mark_failed` 时：
  - `consecutive_failures += 1`
  - `retry_count += 1`
- 达到阈值后触发冷却：
  - 设置 `auto_disabled_until = now + cooldown_secs`

### 执行门控

- 任务在冷却窗口内：
  - `cron.run` 返回拒绝（cooldown）
  - `SchedulerService` 标记运行前会阻断执行
- 冷却到期：
  - 自动恢复可执行（按时间条件放行）

## 5. 对外可见变化

- `cron.list` 的 `enabled` 在冷却中会返回 `false`
- `cron.run` 对冷却任务返回参数错误，包含冷却截止时间
- 新增 `cron.health` 聚合接口，返回状态分布、冷却任务数、悬挂运行数、24h 失败数、高风险任务 TopN
- `cron.health` 新增告警输出（`alerts`），用于前端/远程入口直接消费
- Telegram 入站新增 `/cron_health`，可直接查看治理概览
- Tauri 命令新增 `get_heartbeat_task_health`（内部复用 `cron.health`），供设置页直接查询
- Tauri 命令新增 `deliver_heartbeat_task_health_alerts`，可按当前 `heartbeat.delivery` 配置手动推送告警
- 心跳设置页新增“任务健康概览”卡片，展示关键治理指标和高风险任务列表
- 健康卡片新增“最近 24h 失败趋势”图（小时粒度）与“高风险任务详情”弹窗
- 健康卡片新增“推送当前告警”按钮（Webhook/Telegram），用于运维手动触发通知闭环

## 6. 验证

关键测试：

- `lime-scheduler`：
  - `scheduler::tests::test_mark_task_failed_should_trigger_cooldown`
  - `dao::tests::test_create_tables_should_add_missing_columns_for_existing_table`
- `lime-websocket`：
  - `handlers::rpc_handler::tests::test_cron_run_should_block_when_task_in_cooldown`
