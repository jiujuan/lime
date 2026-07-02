import { describe, expect, it } from "vitest";

import {
  formatWorkspaceSkillRuntimeEnableDisplay,
  resolveWorkspaceSkillRuntimeEnableResultDisplay,
  shouldHideImageTaskToolResultEnvelope,
  shouldHideProtocolToolResultEnvelope,
  shouldHideSkillToolGateResultEnvelope,
  shouldHideToolResultEnvelope,
} from "./toolResultEnvelopeDisplay";

function translate(
  _key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  return defaultValue.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key) => {
    const value = options?.[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

describe("toolResultEnvelopeDisplay", () => {
  it("应隐藏 SkillTool gate proof 运行包络", () => {
    const rawResultText = JSON.stringify({
      allow: {
        phase: "skill_tool_gate_allow",
        hasRequest: true,
        hasDecision: true,
        hasResult: true,
        hasSourceMetadata: true,
        request: {
          toolName: "SkillTool",
          sessionId: "skill-source-session",
          skill: "capability-report",
          authorizationScope: "session",
        },
        decision: {
          action: "allow",
          gate: "session_allowlist",
          enabled: true,
          allowlisted: true,
          reason: "workspace_skill_runtime_enable_allowlist_matched",
        },
        result: {
          status: "passed",
          permissionBehavior: "Allow",
          sourceMetadataAttached: true,
          workspaceSkillRuntimeEnableAttached: true,
        },
      },
      summary:
        "SkillTool allow/deny events both contain request, decision and result.",
    });

    expect(
      shouldHideSkillToolGateResultEnvelope({
        toolName: "SkillTool",
        rawResultText,
      }),
    ).toBe(true);
    expect(
      shouldHideToolResultEnvelope({
        toolName: "SkillTool",
        rawResultText,
      }),
    ).toBe(true);
  });

  it("应隐藏字符串化嵌套的 SkillTool gate proof", () => {
    expect(
      shouldHideSkillToolGateResultEnvelope({
        toolName: "Skill",
        rawResultText: JSON.stringify({
          output: JSON.stringify({
            events: [
              {
                phase: "skill_tool_gate_allow",
                request: {
                  toolName: "SkillTool",
                  skill: "capability-report",
                },
                decision: {
                  action: "allow",
                  gate: "session_allowlist",
                },
                result: {
                  status: "passed",
                  permissionBehavior: "Allow",
                },
              },
            ],
          }),
        }),
      }),
    ).toBe(true);
  });

  it("不应隐藏普通 SkillTool 输出正文", () => {
    expect(
      shouldHideSkillToolGateResultEnvelope({
        toolName: "SkillTool",
        rawResultText: JSON.stringify({
          output: "已完成能力分析。",
          sourceMetadata: {
            sourceDraftId: "capdraft-1",
          },
          workspaceSkillRuntimeEnable: {
            enabledSkillNames: ["capability-report"],
          },
        }),
      }),
    ).toBe(false);
  });

  it("应格式化 workspace skill runtime enable 摘要", () => {
    expect(
      formatWorkspaceSkillRuntimeEnableDisplay(
        {
          workspace_skill_runtime_enable: {
            source: "manual_session_enable",
            approval: "manual",
            bindings: [
              { skill: "project:capability-report" },
              { skill: "project:article-image" },
            ],
          },
        },
        translate,
      ),
    ).toBe("运行启用 · 手动会话 · 人工确认 · 2 个绑定");
  });

  it("不应把 legacy 或未知 runtime enable source 原样渲染给用户", () => {
    const summary = formatWorkspaceSkillRuntimeEnableDisplay(
      {
        workspaceSkillRuntimeEnable: {
          source: "legacy_tool_event",
          approval: "runtime_probe",
          bindings: [{ skill: "project:capability-report" }],
        },
      },
      translate,
    );

    expect(summary).toBe("运行启用 · 1 个绑定");
    expect(summary).not.toContain("legacy_tool_event");
    expect(summary).not.toContain("runtime_probe");
  });

  it("应从 SkillTool gate proof 输出解析 runtime enable 摘要", () => {
    expect(
      resolveWorkspaceSkillRuntimeEnableResultDisplay({
        toolName: "SkillTool",
        rawResultText: JSON.stringify({
          allow: {
            phase: "skill_tool_gate_allow",
            request: {
              toolName: "SkillTool",
              skill: "capability-report",
            },
            decision: {
              action: "allow",
              gate: "session_allowlist",
              reason: "workspace_skill_runtime_enable_allowlist_matched",
            },
            result: {
              status: "passed",
              permissionBehavior: "Allow",
              workspaceSkillRuntimeEnableAttached: true,
            },
          },
        }),
        translate,
      }),
    ).toBe("运行启用");
  });

  it("普通 SkillTool 输出中的非 gate runtime 字段不应误报为启用摘要", () => {
    expect(
      resolveWorkspaceSkillRuntimeEnableResultDisplay({
        toolName: "SkillTool",
        rawResultText: JSON.stringify({
          output: "已完成能力分析。",
          workspaceSkillRuntimeEnable: {
            enabledSkillNames: ["capability-report"],
          },
        }),
        translate,
      }),
    ).toBeNull();
  });

  it("应隐藏非命令工具的纯协议诊断包络", () => {
    const rawResultText = JSON.stringify({
      request_metadata: {
        turnId: "turn-1",
        route: "agentSession/turn/start",
      },
      diagnostics: {
        source: "runtime",
        code: "tool_result_projection",
      },
      metadata: {
        durationMs: 12,
      },
    });

    expect(
      shouldHideProtocolToolResultEnvelope({
        toolName: "mcp__runtime__diagnostic_probe",
        rawResultText,
      }),
    ).toBe(true);
    expect(
      shouldHideToolResultEnvelope({
        toolName: "mcp__runtime__diagnostic_probe",
        rawResultText,
      }),
    ).toBe(true);
  });

  it("应隐藏 legacy tool event runtime enable payload", () => {
    expect(
      shouldHideToolResultEnvelope({
        toolName: "Skill",
        rawResultText: JSON.stringify({
          runtime_enable_source: "legacy_tool_event",
          internal_payload: "skill protocol payload should stay hidden",
        }),
      }),
    ).toBe(true);
  });

  it("应隐藏图片任务创建结果的内部 task JSON", () => {
    const rawResultText = JSON.stringify({
      success: true,
      task_id: "task-image-1",
      task_type: "image_generate",
      task_family: "image",
      status: "pending_submit",
      normalized_status: "pending",
      artifact_path: ".lime/tasks/image_generate/task-image-1.json",
      record: {
        payload: {
          prompt: "画一张广州夏天的图",
        },
      },
    });

    expect(
      shouldHideImageTaskToolResultEnvelope({
        toolName: "mediaTaskArtifact/image/create",
        rawResultText,
      }),
    ).toBe(true);
    expect(
      shouldHideToolResultEnvelope({
        toolName: "mediaTaskArtifact/image/create",
        rawResultText,
      }),
    ).toBe(true);
  });

  it("应隐藏 v2 image_generation task_family 的内部 task JSON", () => {
    const rawResultText = JSON.stringify({
      success: true,
      task_id: "task-image-v2-family",
      task_family: "image_generation",
      status: "pending_submit",
      normalized_status: "pending",
      artifact_path: ".lime/tasks/image_generate/task-image-v2-family.json",
      record: {
        payload: {
          prompt: "画一张广州夏天的图",
        },
      },
    });

    expect(
      shouldHideImageTaskToolResultEnvelope({
        toolName: "mediaTaskArtifact/image/create",
        rawResultText,
      }),
    ).toBe(true);
  });

  it("不应隐藏带正文的协议包络或命令 stdout JSON", () => {
    expect(
      shouldHideProtocolToolResultEnvelope({
        toolName: "mcp__runtime__diagnostic_probe",
        rawResultText: JSON.stringify({
          metadata: { durationMs: 12 },
          output: "诊断已完成。",
        }),
      }),
    ).toBe(false);

    expect(
      shouldHideProtocolToolResultEnvelope({
        toolName: "Bash",
        rawResultText: JSON.stringify({
          metadata: { durationMs: 12 },
          result: { ok: true },
        }),
      }),
    ).toBe(false);
  });
});
