# 样例：`claw-chat-ready-streaming` structured evidence summary

> 状态：local runtime + GUI current fixture evidence sample
> 更新时间：2026-07-02
> 目标：证明 `claw-chat-ready-streaming` 可以在不调用 live Provider、不启动 full qcloop 的前提下，用真实 Electron GUI、Desktop Host bridge、App Server JSON-RPC 和 external fixture backend 形成低成本证据；本文不是 official Evidence Pack，不可作为 release green。

## 1. 本次运行范围

```text
Scenario: claw-chat-ready-streaming
Risk: P0
Budget: budget:tight
Evidence depth: current-fixture-regression / gui-electron-fixture / source-guard
Release scope: local-sidecar-only
LLM / qcloop / live Provider: not used
GUI full P0 batch: not used
```

本次只回答四个问题：

```text
1. Claw 默认新闻输入是否能通过真实 GUI textarea 进入 agentSession/turn/start？
2. streaming 完成态是否由 current turn.completed / read model 收口，而不是靠 timeout 或 renderer mock？
3. 图片命令、Plan hydrate、Skills Runtime、MCP structuredContent、Expert、内容工厂这些 current fixture 场景是否仍能稳定通过？
4. Electron fixture reload / history hydrate 是否能在 source-tree file URL 环境下稳定恢复？
```

结论：四项均通过。首次聚合运行暴露出 `image-command` 场景裸 `page.reload` 在 source-tree Electron fixture 下可能触发 `net::ERR_FILE_NOT_FOUND`；本轮已修复为 current fixture reload 辅助，不做兼容降级，不绕过真实 GUI 恢复验证。

## 2. 结构化摘要

```json
{
  "schema_version": "lime-agent-qc-evidence-summary.v1",
  "generated_at": "2026-07-02T02:38:00+08:00",
  "scenario_id": "claw-chat-ready-streaming",
  "result": "pass_local_low_cost",
  "budget": "budget:tight",
  "evidence_depth": [
    "source-guard",
    "agent-runtime-current-fixture",
    "claw-gui-current-fixture",
    "electron-history-hydrate",
    "fixture-reload-regression-fix"
  ],
  "release_scope": {
    "official_evidence_pack": false,
    "can_gate_release": false,
    "reason": "本次只证明低成本 current 主链；release 仍要求同一批次 8/8 P0 qcloop item success 与 official evidence pack。"
  },
  "commands": [
    {
      "command": "npx vitest run \"scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs\"",
      "status": "pass",
      "summary": "Claw current fixture source guard 23 tests 通过；测试口径已从要求场景文件直接裸 page.reload，改为要求使用 reloadRendererDocument current helper。"
    },
    {
      "command": "node \"scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs\" --scenario image-command --prefix \"claw-chat-current-fixture-image-command-regression\" --timeout-ms 180000",
      "status": "pass",
      "summary": "定向复跑失败场景通过；@配图 GUI 输入、Skill(image_generate)、mediaTaskArtifact/image/create|get|list、task card terminal、reload 后恢复均通过。"
    },
    {
      "command": "npm run smoke:agent-runtime-current-fixture",
      "status": "pass",
      "summary": "聚合 current fixture 通过：history/cache hydration、final_done 工具收尾、failed read model、Claw 终态 UI、Coding Workbench、图片命令、停止后继续、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert、内容工厂 Article Editor 均通过；liveProviderUsed=false。"
    },
    {
      "command": "npm run smoke:claw-chat-current-fixture",
      "status": "pass",
      "summary": "默认新闻输入 GUI current fixture 通过：真实 Electron textarea 发送“整理今天的国际新闻”，进入 agentSession/turn/start；GUI 用户消息、assistant 输出、read model completed、agentSession/event 对齐、工具调用对齐均通过。"
    }
  ],
  "artifacts": [
    ".lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json",
    ".lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-image-command-regression-summary.json",
    ".lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-plan-history-hydrate-regression-summary.json",
    ".lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-content-factory-article-workspace-regression-summary.json"
  ],
  "runtime_fix": {
    "current_fact_source": "Electron fixture + App Server JSON-RPC + Agent Runtime read model",
    "changes": [
      "新增 reloadRendererDocument，保留真实 page.reload 语义，并在可恢复的 Electron reload race / file URL 场景下显式恢复。",
      "ERR_FILE_NOT_FOUND 只有目标 file URL 实际存在时才通过 goto-current-file-url 恢复；真正缺失 dist/index.html 时仍 fail closed。",
      "image-command、Plan history hydrate、Expert Panel catalog reload、内容工厂 Article Editor 编辑稿恢复统一使用该 helper。"
    ],
    "compat_policy": "开发期无用户，不新增旧协议兼容层；只修 current Electron fixture / App Server 主链证据。"
  },
  "default_news_fixture": {
    "gui_input_visible": true,
    "turn_start_method": "agentSession/turn/start",
    "used_current_session_start": true,
    "used_current_session_read": true,
    "used_current_session_list": true,
    "external_fixture_backend_used": true,
    "live_provider_not_used": true,
    "gui_assistant_output_visible": true,
    "gui_input_remains_ready": true,
    "gui_not_stuck_streaming": true,
    "read_model_completed": true,
    "event_read_probe_observed": true,
    "read_model_event_read_aligned": true,
    "read_model_tool_call_aligned": true
  },
  "current_fixture_matrix": {
    "image_command": "pass",
    "cancel_then_continue": "pass",
    "plan_history_hydrate": "pass",
    "skills_runtime": "pass",
    "mcp_structured_content": "pass",
    "expert_skills_runtime": "pass",
    "expert_plaza_skills_runtime": "pass",
    "expert_panel_skills_runtime": "pass",
    "content_factory_article_workspace": "pass"
  },
  "missing_for_release": [
    "同一批次 8/8 P0 qcloop item success。",
    "official .lime/qc/agent-qc-evidence.json verdict.status=pass。",
    "agent-qc:release-summary --check pass。",
    "agent-qc:audit complete。",
    "如 release 风险要求，还需要显式授权后再跑 live Provider streaming E2E。"
  ],
  "next_action": "继续保持 budget:tight，补 release-package-startup-smoke 的 source-tree startup / release-artifact 分层 summary；不要升级 full qcloop。"
}
```

## 3. 这份 summary 证明了什么

- 默认 Claw GUI 输入链路使用真实 Electron textarea，不是直接调用 `turn/start`。
- Renderer 到 Electron preload bridge、App Server JSON-RPC、RuntimeCore external fixture backend、read model 投影在同一条 current 主链上闭环。
- `message.delta` 与 `turn.completed` 可以驱动 GUI 完成态，输入框恢复，页面不持续 streaming。
- `agentSession/event` 和 read model 能在同一 turn 上对齐。
- current fixture 矩阵中的图片任务、Plan hydrate、Skills、MCP、Expert 和内容工厂场景仍可运行。
- 本轮修复了 fixture 自身的 reload 脆弱点，并保持缺失构建产物时 fail closed。

## 4. 这份 summary 不能证明什么

- 不能证明 full qcloop worker / verifier 已采信本次证据。
- 不能证明 live Provider 的真实网络 streaming 稳定性。
- 不能覆盖 official `.lime/qc/agent-qc-evidence.json`。
- 不能 gate release。

## 5. 回写规则

后续如果继续推进本场景，按以下顺序处理：

1. 日常开发默认先跑 `npm run smoke:agent-runtime-current-fixture`。
2. 涉及真实输入框、自然语言新闻请求或 `agentSession/turn/start` GUI 链路时，再跑 `npm run smoke:claw-chat-current-fixture`。
3. 如果 reload / history hydrate 再失败，优先检查 `reloadRendererDocument`、Electron file URL、session sidebar reopen 和 read model hydrate，不要改成跳过恢复验证。
4. 只有发布或明确授权时，才升级 live Provider streaming E2E。
5. official Evidence Pack 只能来自同一批次 8/8 P0 pass，不拼接 partial sidecar。
