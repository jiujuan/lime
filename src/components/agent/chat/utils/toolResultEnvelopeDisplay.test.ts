import { describe, expect, it } from "vitest";

import {
  shouldHideSkillToolGateResultEnvelope,
  shouldHideToolResultEnvelope,
} from "./toolResultEnvelopeDisplay";

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
});
