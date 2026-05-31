# Lime 统一执行追踪（Execution Tracker）技术规划

## 1. 背景与问题定义

当前 Lime 的执行入口分散在多个模块：

- `aster_agent_cmd.rs`（通用 Agent 对话）
- `skill_exec_cmd.rs`（Skill 执行）
- `heartbeat_service/mod.rs`（定时任务/心跳执行）

虽然各自功能完整，但执行状态、错误语义、追踪字段和观测口径不一致，导致：

1. 故障排查链路长（跨表、跨日志、跨命令）
2. 前端难以给出统一执行状态
3. 后续接入新入口（如 IM、批处理）时容易重复造轮子
4. 技术债风险：若“每个入口各写一套 run 逻辑”，将出现明显胶水代码

本规划目标是在不重写执行引擎的前提下，新增一个高内聚、低侵入的统一追踪层。

---

## 2. 目标与非目标

### 2.1 目标（Must Have）

1. 引入统一 `run` 语义模型（跨 chat/skill/heartbeat）
2. 所有入口通过同一服务写入执行生命周期
3. 统一状态枚举与错误归一化，消除字符串散落
4. 支持灰度开关，可快速回滚
5. 首期不影响既有执行能力和用户主流程

### 2.2 非目标（Not in Scope）

1. 不重构 Aster 执行引擎
2. 不重做前端大页面
3. 不在首期迁移历史数据
4. 不引入复杂事件总线或新中间件框架

---

## 3. 设计原则（防“垃圾代码”约束）

1. **单点收敛**：仅新增一个核心模块 `execution_tracker`
2. **边界接入**：只在命令/服务边界包裹，不侵入工具执行内部
3. **幂等优先**：重复 finish/fail 不产生状态抖动
4. **最小数据**：`agent_runs` 只存摘要索引，细节继续由现有表承载
5. **先兼容后替换**：短期并存，验证后收敛，避免长期双写

---

## 4. 总体架构

### 4.1 新增模块

建议新增：`src-tauri/crates/services/src/execution_tracker.rs`

核心职责：

- 创建 run（start）
- 更新 run（success/error/timeout/canceled）
- 统一错误归一化
- 提供 `with_run` 包装器减少入口代码重复

### 4.2 统一入口接口（示意）

```rust
with_run(ctx, RunSource::Skill, Some("pptx"), Some(session_id), async {
    // 原有执行逻辑，不改
})
```

入口业务只关心“执行什么”，生命周期交给 tracker 处理。

---

## 5. 数据模型设计

## 5.1 新表：`agent_runs`

核心字段建议：

- `id`（TEXT, PK, run_id）
- `source`（TEXT: `chat | skill | heartbeat`）
- `source_ref`（TEXT，可选：skill 名称/heartbeat task id）
- `session_id`（TEXT，可选）
- `status`（TEXT: `queued | running | success | error | canceled | timeout`）
- `started_at`（TEXT, ISO8601）
- `finished_at`（TEXT，可空）
- `duration_ms`（INTEGER，可空）
- `error_code`（TEXT，可空）
- `error_message`（TEXT，可空）
- `metadata`（TEXT，可空，JSON 摘要）

### 5.2 索引建议

- `idx_agent_runs_source_started_at (source, started_at DESC)`
- `idx_agent_runs_session_started_at (session_id, started_at DESC)`
- `idx_agent_runs_status_started_at (status, started_at DESC)`

---

## 6. 统一状态与错误规范

## 6.1 状态机（最小版）

允许流转：

- `queued -> running`
- `running -> success | error | timeout | canceled`

禁止回退与二次终态覆盖（幂等）。

### 6.2 错误归一化

统一输出：

- `error_code`：机器可读（如 `permission_denied` / `provider_unavailable`）
- `error_message`：用户可读
- `retryable`：仅内部使用（可放 metadata）

---

## 7. 接入点改造方案

## 7.1 `skill_exec_cmd.rs`（第一接入点）

原因：边界清晰、风险最低，适合作为 P0 首个落地。

做法：

- 在 `execute_skill` 外围包 `with_run`
- `source = skill`
- `source_ref = skill_name`
- `session_id = 当前执行会话 id`

## 7.2 `aster_agent_cmd.rs`

做法：

- 在会话执行入口处创建 run
- 流式完成/异常时由 tracker 统一收敛状态
- 复用错误归一化，不再各处拼接文本

## 7.3 `heartbeat_service/mod.rs`

做法：

- 每次任务执行都创建 run
- `source = heartbeat`
- `source_ref = task_id 或 task_description`
- 首期可保留旧 `heartbeat_executions`，但需设置退场计划（见第 10 节）

---

## 8. 前端最小改造

1. 新增轻量查询接口（`list_runs/get_run`）
2. 聊天与任务页面先展示统一状态徽标（不新增复杂页面）
3. run 详情仍跳转现有日志与消息明细，避免重复 UI

---

## 9. 配置与灰度策略

新增配置建议：

- `agent.execution_tracker.enabled`（默认 `true`）
- 环境变量覆盖：`PROXYCAST_EXECUTION_TRACKER_ENABLED`

灰度步骤：

1. 内部开启（开发/测试）
2. 小流量开启（beta 用户）
3. 全量开启后进入旧路径收敛阶段

---

## 10. 实施计划（P0）

### Phase A：基础能力（2-3 天）

1. 新建 `agent_runs` migration
2. 实现 `execution_tracker` 服务 + `with_run`
3. 新增 DAO 与单元测试

### Phase B：接入 Skill（1-2 天）

1. 接入 `skill_exec_cmd.rs`
2. 验证状态流转与错误归一化
3. 前端显示最小状态徽标

### Phase C：接入 Chat 与 Heartbeat（2-4 天）

1. 接入 `aster_agent_cmd.rs`
2. 接入 `heartbeat_service/mod.rs`
3. 增加跨入口一致性测试

### Phase D：收敛与清理（1-2 天）

1. 标记旧追踪路径为 deprecated
2. 清理重复状态转换代码
3. 完成技术债登记与后续移除计划

---

## 11. 验收标准（架构 + 产品）

### 11.1 技术验收

1. run 覆盖率：chat/skill/heartbeat >= 90%
2. 终态一致性：无“running 悬挂”记录
3. 幂等性：重复 finish/fail 不改写终态

### 11.2 产品验收

1. 故障定位可追溯率 >= 95%
2. 平均排障时间下降 >= 50%
3. 前端状态一致性（同一执行在各页面状态一致）

---

## 12. 风险与应对

1. **状态竞争条件**：通过 DB 事务 + 终态幂等保护
2. **双写长期化**：设置明确退场日期，进入 roadmap 追踪
3. **性能回归**：metadata 严格控量，避免大字段写入
4. **认知负担上升**：仅增加“run 摘要层”，不复制业务明细

---

## 13. 成功标准（Definition of Done）

满足以下条件即判定 P0 完成：

1. 三个执行入口全部接入 `execution_tracker`
2. 至少一个统一查询接口可用于调试与 UI 展示
3. 旧路径进入可下线状态（有迁移清单和时间点）
4. 无新增重复生命周期逻辑（通过 code review checklist 约束）

