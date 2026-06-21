import { describe, expect, it } from "vitest";
import type { AgentRuntimeWorkspaceSkillBinding } from "@/lib/api/agentRuntime";
import { buildWorkspaceSkillRuntimeLaunchParams } from "./workspaceSkillRuntimeLaunch";

function createBinding(
  overrides: Partial<AgentRuntimeWorkspaceSkillBinding> = {},
): AgentRuntimeWorkspaceSkillBinding {
  return {
    key: "workspace_skill:capability-report",
    name: "只读 CLI 报告",
    description: "把本地只读 CLI 输出整理成 Markdown 报告。",
    directory: "capability-report",
    registered_skill_directory:
      "/Users/demo/Lime/default-workspace/.agents/skills/capability-report",
    registration: {
      registration_id: "capreg-1",
      registered_at: "2026-05-05T01:10:00.000Z",
      skill_directory: "capability-report",
      registered_skill_directory:
        "/Users/demo/Lime/default-workspace/.agents/skills/capability-report",
      source_draft_id: "capdraft-1",
      source_verification_report_id: "capver-1",
      generated_file_count: 4,
      permission_summary: ["Level 0 只读发现"],
    },
    permission_summary: ["Level 0 只读发现"],
    metadata: {},
    allowed_tools: [],
    resource_summary: {
      has_scripts: true,
      has_references: false,
      has_assets: false,
    },
    standard_compliance: {
      is_standard: true,
      validation_errors: [],
      deprecated_fields: [],
    },
    runtime_binding_target: "workspace_skill",
    binding_status: "ready_for_manual_enable",
    binding_status_reason: "已具备 runtime binding 候选资格。",
    next_gate: "manual_runtime_enable",
    query_loop_visible: false,
    tool_runtime_visible: false,
    launch_enabled: false,
    runtime_gate: "等待 P3E 显式启用。",
    ...overrides,
  };
}

describe("buildWorkspaceSkillRuntimeLaunchParams", () => {
  it("把手动试用绑定转成 Agent current turn metadata", () => {
    const params = buildWorkspaceSkillRuntimeLaunchParams({
      workspaceRoot: "/Users/demo/Lime/default-workspace",
      projectId: "default-workspace",
      binding: createBinding(),
      prompt: "先试用一次「只读 CLI 报告」技能。",
    });

    expect(params).toMatchObject({
      agentEntry: "new-task",
      theme: "general",
      projectId: "default-workspace",
      initialUserPrompt: "先试用一次「只读 CLI 报告」技能。",
      autoRunInitialPromptOnMount: true,
      initialRequestMetadata: {
        harness: {
          workspace_skill_runtime_enable: {
            source: "manual_session_enable",
            approval: "manual",
            workspace_root: "/Users/demo/Lime/default-workspace",
            bindings: [
              {
                directory: "capability-report",
                skill: "project:capability-report",
                registered_skill_directory:
                  "/Users/demo/Lime/default-workspace/.agents/skills/capability-report",
                source_draft_id: "capdraft-1",
                source_verification_report_id: "capver-1",
                permission_summary: ["Level 0 只读发现"],
              },
            ],
          },
        },
      },
      initialAutoSendRequestMetadata: {
        harness: {
          workspace_skill_runtime_enable: {
            source: "manual_session_enable",
            approval: "manual",
          },
        },
      },
    });
  });

  it("blocked binding 不生成运行入口参数", () => {
    expect(
      buildWorkspaceSkillRuntimeLaunchParams({
        workspaceRoot: "/Users/demo/Lime/default-workspace",
        projectId: "default-workspace",
        binding: createBinding({
          binding_status: "blocked",
        }),
        prompt: "先试用一次「只读 CLI 报告」技能。",
      }),
    ).toBeNull();
  });
});
