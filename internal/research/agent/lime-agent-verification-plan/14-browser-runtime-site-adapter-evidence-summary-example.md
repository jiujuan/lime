# 样例：`browser-runtime-site-adapter` structured evidence summary

> 状态：local browser runtime / adapter guard evidence sample
> 更新时间：2026-07-02
> 目标：证明 `browser-runtime-site-adapter` 可以先用本地 Browser Runtime smoke + Site Adapter retired guard 形成低成本证据；本文不是 official Evidence Pack，不可作为 release green。

## 1. 本次运行范围

```text
Scenario: browser-runtime-site-adapter
Risk: P0
Budget: budget:tight
Evidence depth: deterministic-smoke / gui-trace
Release scope: local-sidecar-only
LLM / qcloop / live Provider: not used
GUI full P0 batch: not used
```

本次只回答一个问题：

```text
在不启动 qcloop、不调用模型的情况下，
能否证明 Browser Runtime current 主链可 attach / read / collect events / cleanup，
并证明旧 Site Adapter command surface 没有回流成成功路径？
```

结论：可以。`smoke:browser-runtime` 在临时 Chrome CDP 9333 上通过；`smoke:site-adapters` 通过。初次复用本机 9222 端口失败，因为该端口 `/json/list` 返回 404，归类为环境端口不匹配，不是产品失败。

## 2. 结构化摘要

```json
{
  "schema_version": "lime-agent-qc-evidence-summary.v1",
  "generated_at": "2026-07-02T01:30:00+08:00",
  "scenario_id": "browser-runtime-site-adapter",
  "result": "pass_with_environment_note",
  "budget": "budget:tight",
  "evidence_depth": ["deterministic-smoke", "gui-trace"],
  "release_scope": {
    "official_evidence_pack": false,
    "can_gate_release": false,
    "reason": "只跑本地 browser runtime smoke、site adapter retired guard 和单场景 payload 生成；official Evidence Pack 必须来自同一批次 8/8 P0 pass。"
  },
  "commands": [
    {
      "command": "npm run smoke:site-adapters",
      "status": "pass",
      "summary": "DevBridge status=ok；site_get_adapter_catalog_status / site_list_adapters / site_recommend_adapters / site_search_adapters 均 fail-closed；旧 Site Adapter 命令未回流成功路径。"
    },
    {
      "command": "npm run smoke:browser-runtime -- --remote-debugging-port 9222",
      "status": "blocked",
      "summary": "现有 9222 端口 /json/list 返回 404；环境端口不匹配，未作为产品失败。"
    },
    {
      "command": "npm run smoke:browser-runtime -- --remote-debugging-port 9333",
      "status": "pass",
      "summary": "使用临时 headless Chrome profile；target/list targets=3；session=3e9357d1-0230-4aa3-adc9-531a8121cb2d；readPageAction / consoleAction / networkAction 均生成；consoleEvents=0；networkEvents=2；browserEvents=15；cleanup=pass。"
    },
    {
      "command": "npm run agent-qc:qcloop-job -- --scenario browser-runtime-site-adapter --cwd \"$(pwd)\" --output .lime/qc/qcloop-browser-runtime-site-adapter-payload.json --check",
      "status": "pass",
      "summary": "仅生成单场景 qcloop payload，不提交 job；payload valid，commands 包含 smoke:browser-runtime 与 smoke:site-adapters，evidence_layers 包含 deterministic-smoke 与 gui-trace。"
    },
    {
      "command": "npm run agent-qc:process-owner-check -- --format json --output .lime/qc/agent-verification-process-owner-current.json --markdown-output .lime/qc/agent-verification-process-owner-current.md",
      "status": "pass",
      "summary": "activeGuiSmoke=0；cargoOrRust=0；qcloopRelated=0；passive Electron runtime 存在但不阻断本场景。"
    }
  ],
  "artifacts": [
    ".lime/qc/qcloop-browser-runtime-site-adapter-payload.json",
    ".lime/qc/agent-verification-process-owner-current.json",
    ".lime/qc/agent-verification-process-owner-current.md"
  ],
  "known_non_blocking_notes": [
    "9222 端口存在监听但不是可用 CDP /json/list 端点，返回 404；已用临时 9333 headless Chrome 复验通过。",
    "临时 Chrome profile 已通过 trap 清理；Browser Runtime session cleanup=pass。",
    "Site Adapter smoke 当前是 retired command fail-closed guard，不是完整 App Server current adapter catalog 成功路径。"
  ],
  "missing_for_release": [
    "同一批次 8/8 P0 qcloop item success。",
    "8/8 QCLOOP_EVIDENCE_SUMMARY_JSON parseable。",
    "official .lime/qc/agent-qc-evidence.json verdict.status=pass。",
    "agent-qc:release-summary --check pass。",
    "agent-qc:audit complete。",
    "若未来 Site Adapter 迁入 App Server current，还需新增正向 adapter catalog / page adaptation evidence。"
  ],
  "next_action": "继续选择下一个低成本 P0：skill-forge-register-bind-enable；先跑 contract + service-skill deterministic smoke，不进入 live Provider。"
}
```

## 3. 这份 summary 证明了什么

- Browser Runtime current 主链可以通过 DevBridge 调用 App Server `browserSession/*`。
- 临时 CDP 浏览器可 attach、读取 data: 页面、采集 console / network / browser events，并成功 cleanup。
- 旧 Site Adapter 命令没有回流成成功路径，仍保持 fail-closed / unsupported。
- 单场景 qcloop payload 可以生成，并且要求 worker 输出结构化 evidence summary。

## 4. 这份 summary 不能证明什么

- 不能证明真实网站长程适配质量。
- 不能证明未来 App Server current Site Adapter 正向 catalog，因为当前 smoke 仍是 retired guard。
- 不能证明 Playwright 深交互或 release artifact。
- 不能覆盖 official `.lime/qc/agent-qc-evidence.json`。

## 5. 回写规则

后续如果 `browser-runtime-site-adapter` 失败，不进入 LLM judge，先按以下顺序回写：

1. CDP port unavailable：区分环境端口错误与 Browser Runtime 产品失败。
2. session leak / cleanup skipped：补 Browser Runtime cleanup guard。
3. read_page 缺 evidence：补 browser snapshot / action result 断言。
4. legacy Site Adapter 成功回流：按 retired command 回流治理处理，而不是降低 smoke。
