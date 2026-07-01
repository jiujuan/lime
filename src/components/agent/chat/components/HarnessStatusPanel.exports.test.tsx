import { act } from "react";
import { describe, expect, it } from "vitest";
import {
  flushUntilTextAppears,
  renderExpandedPanel as renderPanel,
  getHarnessPanelTestMocks,
} from "./HarnessStatusPanel.testFixtures";
import {
  conversationProjectionStore,
  selectLatestAgentUiProjectionEventForEvidence,
} from "../projection/conversationProjectionStore";

const {
  exportAgentRuntimeAnalysisHandoffMock,
  exportAgentRuntimeEvidencePackMock,
  exportAgentRuntimeHandoffBundleMock,
  exportAgentRuntimeReplayCaseMock,
  mockToast,
} = getHarnessPanelTestMocks();

describe("HarnessStatusPanel exports", () => {
  it("存在 sessionId 时只暴露 App Server current 的问题证据包导出入口", () => {
    renderPanel({
      diagnosticRuntimeContext: {
        sessionId: "session-handoff-1",
        workspaceId: "workspace-handoff-1",
        providerType: "openai",
        model: "gpt-5.4",
        executionStrategy: "react",
        activeTheme: "default",
        selectedTeamLabel: null,
      },
    });

    expect(document.body.textContent).toContain("问题证据包");
    expect(
      document.body.querySelector('button[aria-label="跳转到问题证据包"]'),
    ).not.toBeNull();
    expect(
      document.body.querySelector('button[aria-label="导出问题证据包"]'),
    ).not.toBeNull();
    expect(
      document.body.querySelector('button[aria-label="导出交接制品"]'),
    ).toBeNull();
    expect(
      document.body.querySelector('button[aria-label="导出 Replay 样本"]'),
    ).toBeNull();
    expect(
      document.body.querySelector('button[aria-label="导出外部分析交接"]'),
    ).toBeNull();
    expect(
      document.body.querySelector('button[aria-label="一键复制给 AI"]'),
    ).toBeNull();
    expect(
      document.body.querySelector('button[aria-label="导出人工审核记录"]'),
    ).toBeNull();
    expect(
      document.body.querySelector('button[aria-label="填写人工审核结果"]'),
    ).toBeNull();
    expect(exportAgentRuntimeHandoffBundleMock).not.toHaveBeenCalled();
    expect(exportAgentRuntimeReplayCaseMock).not.toHaveBeenCalled();
    expect(exportAgentRuntimeAnalysisHandoffMock).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("会话交接四件套");
    expect(document.body.textContent).not.toContain("Replay 样本");
    expect(document.body.textContent).not.toContain("外部分析交接");
    expect(document.body.textContent).not.toContain("人工审核记录");
  });

  it("旧派生导出控件下线后点击导出问题证据包不应触发 legacy compat 命令", async () => {
    exportAgentRuntimeEvidencePackMock.mockResolvedValue({
      session_id: "session-evidence-only-1",
      thread_id: "thread-evidence-only-1",
      workspace_id: "workspace-evidence-only-1",
      workspace_root: "/tmp/workspace-evidence-only-1",
      pack_relative_root:
        ".lime/harness/sessions/session-evidence-only-1/evidence",
      pack_absolute_root:
        "/tmp/workspace-evidence-only-1/.lime/harness/sessions/session-evidence-only-1/evidence",
      exported_at: "2026-03-27T09:36:00.000Z",
      thread_status: "running",
      latest_turn_status: "running",
      turn_count: 1,
      item_count: 2,
      pending_request_count: 0,
      queued_turn_count: 0,
      recent_artifact_count: 1,
      known_gaps: [],
      artifacts: [
        {
          kind: "summary",
          title: "问题摘要",
          relative_path:
            ".lime/harness/sessions/session-evidence-only-1/evidence/summary.md",
          absolute_path:
            "/tmp/workspace-evidence-only-1/.lime/harness/sessions/session-evidence-only-1/evidence/summary.md",
          bytes: 128,
        },
      ],
    });

    renderPanel({
      diagnosticRuntimeContext: {
        sessionId: "session-evidence-only-1",
        workspaceId: "workspace-evidence-only-1",
        providerType: "openai",
        model: "gpt-5.4",
        executionStrategy: "react",
        activeTheme: "default",
        selectedTeamLabel: null,
      },
    });

    const exportButton = document.body.querySelector(
      'button[aria-label="导出问题证据包"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      exportButton?.click();
      await Promise.resolve();
    });

    expect(exportAgentRuntimeEvidencePackMock).toHaveBeenCalledWith(
      "session-evidence-only-1",
    );
    expect(exportAgentRuntimeHandoffBundleMock).not.toHaveBeenCalled();
    expect(exportAgentRuntimeReplayCaseMock).not.toHaveBeenCalled();
    expect(exportAgentRuntimeAnalysisHandoffMock).not.toHaveBeenCalled();
  });

  it("存在 sessionId 时应支持导出问题证据包并展示缺口与文件列表", async () => {
    exportAgentRuntimeEvidencePackMock.mockResolvedValue({
      session_id: "session-evidence-1",
      thread_id: "thread-evidence-1",
      workspace_id: "workspace-evidence-1",
      workspace_root: "/tmp/workspace-evidence-1",
      pack_relative_root: ".lime/harness/sessions/session-evidence-1/evidence",
      pack_absolute_root:
        "/tmp/workspace-evidence-1/.lime/harness/sessions/session-evidence-1/evidence",
      exported_at: "2026-03-27T09:40:00.000Z",
      thread_status: "running",
      latest_turn_status: "running",
      turn_count: 2,
      item_count: 5,
      pending_request_count: 1,
      queued_turn_count: 1,
      recent_artifact_count: 2,
      known_gaps: [
        "当前 Evidence Pack 尚未纳入 GUI smoke / browser 验证结果。",
      ],
      completion_audit_summary: {
        source: "runtime_evidence_pack_completion_audit",
        decision: "completed",
        owner_run_count: 1,
        successful_owner_run_count: 1,
        workspace_skill_tool_call_count: 1,
        artifact_count: 2,
        owner_audit_statuses: ["audit_input_ready"],
        required_evidence: {
          automation_owner: true,
          workspace_skill_tool_call: true,
          artifact_or_timeline: true,
        },
        blocking_reasons: [],
        notes: ["证据齐全。"],
      },
      observability_summary: {
        schema_version: "v1",
        known_gaps: [
          "当前 Evidence Pack 尚未纳入 GUI smoke / browser 验证结果。",
        ],
        signal_coverage: [
          {
            signal: "correlation",
            status: "exported",
            source: "runtime thread identity",
            detail: "已导出关联键。",
          },
          {
            signal: "artifactValidator",
            status: "exported",
            source: "artifact_document_validator",
            detail: "已导出 Artifact 校验结果。",
          },
        ],
        verification_summary: {
          artifact_validator: {
            applicable: true,
            record_count: 1,
            issue_count: 2,
            repaired_count: 1,
            fallback_used_count: 0,
            outcome: "blocking_failure",
          },
          browser_verification: {
            record_count: 2,
            success_count: 1,
            failure_count: 1,
            unknown_count: 0,
            outcome: "blocking_failure",
          },
          focus_verification_failure_outcomes: [
            "Artifact 校验存在 2 条未恢复 issues。",
            "浏览器验证存在 1 条失败线索。",
          ],
          focus_verification_recovered_outcomes: [
            "Artifact 校验已恢复 1 个产物，fallback 0 次。",
          ],
        },
        skill_invocations: [
          {
            event: "skill_invocation",
            skill_name: "project:capability-report",
            status: "completed",
            source_event_id: "evt-skill-1",
            source_event_type: "tool.result",
            turn_id: "turn-evidence-1",
            tool_call_id: "skill-call-1",
            workspace_skill_runtime_enable: {
              source: "manual_session_enable",
              approval: "manual",
            },
          },
        ],
        skill_searches: [
          {
            event: "skill_search",
            query: "capability report",
            result_count: 2,
            snapshot_skill_count: 7,
            status: "completed",
            source_event_id: "evt-skill-search-1",
            source_event_type: "tool.result",
            turn_id: "turn-evidence-1",
            tool_call_id: "skill-search-call-1",
          },
        ],
        mcp_resource_reads: [
          {
            event: "mcp_resource_read",
            tool_name: "ReadMcpResourceTool",
            server: "docs",
            uri: "file:///docs/intro.md",
            status: "completed",
            source_event_id: "evt-mcp-resource-1",
            source_event_type: "tool.result",
            mime_types: ["text/markdown"],
            content_count: 1,
            content_refs: [
              {
                index: 0,
                type: "text",
                uri: "file:///docs/intro.md",
                mime_type: "text/markdown",
                text_char_count: 64,
              },
            ],
            turn_id: "turn-evidence-1",
            tool_call_id: "mcp-resource-call-1",
          },
        ],
        modality_runtime_contracts: {
          snapshot_count: 2,
          snapshot_index: {
            task_index: {
              snapshot_count: 2,
              thread_ids: ["thread-evidence-1", "thread-evidence-2"],
              turn_ids: ["turn-evidence-1", "turn-evidence-2"],
              content_ids: ["content-browser-1", "content-search-1"],
              entry_keys: ["at_browser_agent_command", "at_search_command"],
              modalities: ["browser", "web_research"],
              skill_ids: ["browser_assist", "research"],
              model_ids: ["gpt-5.2-browser", "gpt-5.2"],
              executor_kinds: ["browser_action", "search_query"],
              executor_binding_keys: ["lime_browser_mcp", "web_search"],
              cost_states: ["estimated", "metered"],
              limit_states: ["within_limit", "quota_low"],
              estimated_cost_classes: ["low", "medium"],
              limit_event_kinds: ["quota_low"],
              quota_low_count: 1,
              items: [
                {
                  artifact_path:
                    "runtime_timeline/browser-tool-1/mcp__lime-browser__navigate",
                  contract_key: "browser_control",
                  thread_id: "thread-evidence-1",
                  turn_id: "turn-evidence-1",
                  content_id: "content-browser-1",
                  entry_key: "at_browser_agent_command",
                  modality: "browser",
                  skill_id: "browser_assist",
                  model_id: "gpt-5.2-browser",
                  executor_kind: "browser_action",
                  executor_binding_key: "lime_browser_mcp",
                  cost_state: "estimated",
                  limit_state: "within_limit",
                  estimated_cost_class: "low",
                  limit_event_kind: "quota_low",
                  quota_low: true,
                },
                {
                  artifact_path: "runtime_timeline/search-tool-1/search_query",
                  contract_key: "web_research",
                  thread_id: "thread-evidence-2",
                  turn_id: "turn-evidence-2",
                  content_id: "content-search-1",
                  entry_key: "at_search_command",
                  modality: "web_research",
                  skill_id: "research",
                  model_id: "gpt-5.2",
                  executor_kind: "search_query",
                  executor_binding_key: "web_search",
                  cost_state: "metered",
                  limit_state: "quota_low",
                  estimated_cost_class: "medium",
                  limit_event_kind: "quota_low",
                  quota_low: true,
                },
              ],
            },
            browser_action_index: {
              action_count: 2,
              session_count: 1,
              observation_count: 1,
              screenshot_count: 1,
              last_url: "https://example.com/",
              session_ids: ["browser-session-1"],
              target_ids: ["target-1"],
              profile_keys: ["general_browser_assist"],
              status_counts: [{ status: "completed", count: 2 }],
              artifact_kind_counts: [
                { artifact_kind: "browser_session", count: 1 },
                { artifact_kind: "browser_snapshot", count: 1 },
              ],
              action_counts: [
                { action: "navigate", count: 1 },
                { action: "get_page_info", count: 1 },
              ],
              backend_counts: [{ backend: "lime_extension_bridge", count: 1 }],
              items: [
                {
                  artifact_kind: "browser_session",
                  action: "navigate",
                  status: "completed",
                  success: true,
                  session_id: "browser-session-1",
                  target_id: "target-1",
                  backend: "cdp_direct",
                  last_url: "https://example.com/",
                },
                {
                  artifact_kind: "browser_snapshot",
                  action: "get_page_info",
                  status: "completed",
                  success: true,
                  session_id: "browser-session-1",
                  target_id: "target-1",
                  entry_source: "at_browser_agent_command",
                  backend: "lime_extension_bridge",
                  last_url: "https://example.com/",
                  observation_available: true,
                  screenshot_available: true,
                },
              ],
            },
            limecore_policy_index: {
              snapshot_count: 1,
              ref_keys: [
                "model_catalog",
                "provider_offer",
                "tenant_feature_flags",
              ],
              missing_inputs: [
                "model_catalog",
                "provider_offer",
                "tenant_feature_flags",
              ],
              status_counts: [{ status: "local_defaults_evaluated", count: 1 }],
              decision_counts: [{ decision: "allow", count: 1 }],
              items: [
                {
                  artifact_path:
                    ".lime/tasks/image_generate/task-policy-gap.json",
                  contract_key: "image_generation",
                  execution_profile_key: "image_generation_default",
                  executor_adapter_key: "skill_image_generate",
                  refs: [
                    "model_catalog",
                    "provider_offer",
                    "tenant_feature_flags",
                  ],
                  status: "local_defaults_evaluated",
                  decision: "allow",
                  decision_source: "local_default_policy",
                  decision_scope: "local_defaults_only",
                  decision_reason:
                    "declared_policy_refs_with_no_local_deny_rule",
                  unresolved_refs: [
                    "model_catalog",
                    "provider_offer",
                    "tenant_feature_flags",
                  ],
                  missing_inputs: [
                    "model_catalog",
                    "provider_offer",
                    "tenant_feature_flags",
                  ],
                  policy_inputs: [
                    {
                      ref_key: "model_catalog",
                      status: "declared_only",
                      source: "modality_runtime_contract",
                      value_source: "limecore_pending",
                    },
                  ],
                  source: "modality_runtime_contract",
                },
              ],
            },
          },
        },
      },
      artifacts: [
        {
          kind: "summary",
          title: "问题摘要",
          relative_path:
            ".lime/harness/sessions/session-evidence-1/evidence/summary.md",
          absolute_path:
            "/tmp/workspace-evidence-1/.lime/harness/sessions/session-evidence-1/evidence/summary.md",
          bytes: 256,
        },
      ],
    });

    renderPanel({
      diagnosticRuntimeContext: {
        sessionId: "session-evidence-1",
        workspaceId: "workspace-evidence-1",
        providerType: "openai",
        model: "gpt-5.4",
        executionStrategy: "react",
        activeTheme: "default",
        selectedTeamLabel: null,
      },
    });

    const exportButton = document.body.querySelector(
      'button[aria-label="导出问题证据包"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      exportButton?.click();
      await Promise.resolve();
    });

    expect(exportAgentRuntimeEvidencePackMock).toHaveBeenCalledWith(
      "session-evidence-1",
    );
    expect(document.body.textContent).toContain("问题证据包");
    expect(document.body.textContent).toContain("Completion Audit");
    expect(document.body.textContent).toContain("completed · 证据完成");
    expect(document.body.textContent).toContain("Owner success");
    expect(document.body.textContent).toContain("Skill ToolCall");
    expect(document.body.textContent).toContain(
      "project:capability-report · completed",
    );
    expect(document.body.textContent).toContain(
      "运行启用 · 手动会话 · 人工确认",
    );
    expect(document.body.textContent).toContain("Skill Search");
    expect(document.body.textContent).toContain(
      "capability report · 2/7 · completed",
    );
    expect(document.body.textContent).toContain("MCP Resource Reads");
    expect(document.body.textContent).toContain("file:///docs/intro.md");
    expect(document.body.textContent).toContain(
      "server docs · completed · text/markdown · 1 个内容项",
    );
    expect(document.body.textContent).toContain(
      "#0 · text · text/markdown · 64 chars",
    );
    expect(document.body.textContent).toContain("验证结果");
    expect(document.body.textContent).toContain("阻塞失败");
    expect(document.body.textContent).toContain("验证失败焦点");
    expect(document.body.textContent).toContain("已恢复结果");
    expect(document.body.textContent).toContain("Browser Assist 索引");
    expect(document.body.textContent).toContain("https://example.com/");
    expect(document.body.textContent).toContain("browser_snapshot");
    expect(document.body.textContent).toContain("get_page_info");
    expect(document.body.textContent).toContain("observation / screenshot");
    expect(document.body.textContent).toContain("多模态任务索引");
    expect(document.body.textContent).toContain("任务中心过滤列表");
    expect(document.body.textContent).toContain("thread-evidence-1");
    expect(document.body.textContent).toContain("content-browser-1");
    expect(document.body.textContent).toContain("lime_browser_mcp");
    expect(document.body.textContent).toContain("within_limit");
    expect(document.body.textContent).toContain("LimeCore 策略缺口");
    expect(document.body.textContent).toContain("model_catalog");
    expect(document.body.textContent).toContain("provider_offer");
    expect(document.body.textContent).toContain("本地允许");
    expect(document.body.textContent).toContain("等待 LimeCore");
    expect(document.body.textContent).toContain("local_defaults_only");
    const replayButton = document.body.querySelector(
      'button[aria-label="打开 Browser Assist 复盘"]',
    ) as HTMLButtonElement | null;
    expect(replayButton).not.toBeNull();

    await act(async () => {
      replayButton?.click();
      await Promise.resolve();
    });
    await flushUntilTextAppears("最近浏览器动作");

    expect(document.body.textContent).toContain("最近浏览器动作");
    expect(document.body.textContent).toContain("browser_replay_viewer");
    expect(document.body.textContent).toContain("当前已知缺口");
    expect(document.body.textContent).toContain(
      ".lime/harness/sessions/session-evidence-1/evidence/summary.md",
    );
    expect(mockToast.success).toHaveBeenCalledWith("已导出 1 个问题证据文件");
    expect(
      selectLatestAgentUiProjectionEventForEvidence(
        conversationProjectionStore.getSnapshot(),
        ".lime/harness/sessions/session-evidence-1/evidence",
      ),
    ).toMatchObject({
      type: "evidence.changed",
      sourceType: "evidence_projection",
      sessionId: "session-evidence-1",
      threadId: "thread-evidence-1",
      evidenceId: ".lime/harness/sessions/session-evidence-1/evidence",
      owner: "evidence",
      scope: "evidence",
      phase: "completed",
      surface: "timeline_evidence",
      persistence: "evidence_pack",
      refs: {
        artifactPaths: [
          ".lime/harness/sessions/session-evidence-1/evidence/summary.md",
        ],
      },
      payload: {
        kind: "evidence_pack",
        status: "ready",
        verdict: "gaps_present",
        itemCount: 5,
      },
    });
  });

});
