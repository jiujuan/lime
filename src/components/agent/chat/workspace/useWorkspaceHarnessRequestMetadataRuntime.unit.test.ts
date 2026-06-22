import { describe, expect, it } from "vitest";
import type { AgentRuntimeWorkspaceSkillBinding } from "@/lib/api/agentRuntime";
import { resolveWorkspaceHarnessRequestMetadata } from "./useWorkspaceHarnessRequestMetadataRuntime";

const workspaceSkillBinding = {
  directory: "capability-report",
  name: "只读 CLI 报告",
  description: "把只读 CLI 输出整理成 Markdown 报告。",
  registered_skill_directory: "/tmp/project/.agents/skills/capability-report",
  binding_status: "ready_for_manual_enable",
  next_gate: "manual_runtime_enable",
  query_loop_visible: false,
  tool_runtime_visible: false,
  launch_enabled: false,
  permission_summary: ["Level 0 只读发现"],
  registration: {
    source_draft_id: "capdraft-1",
    source_verification_report_id: "capver-1",
  },
} as AgentRuntimeWorkspaceSkillBinding;

describe("workspace harness request metadata runtime", () => {
  it("应保持主组件原 harness metadata 映射语义", () => {
    const metadata = resolveWorkspaceHarnessRequestMetadata({
      agentResponseLanguage: "en-US",
      browserAssistAutoLaunch: false,
      browserAssistPreferredBackend: "lime_extension_bridge",
      browserAssistProfileKey: "general_browser_assist",
      contentId: "content-1",
      currentGateKey: "write_mode",
      effectiveChatToolPreferences: {
        task: true,
        subagent: true,
      },
      isThemeWorkbench: true,
      mappedTheme: "general",
      preferredTeamPresetId: "builtin-research",
      resolvedTeamMemoryShadowSnapshot: {
        repoScope: "/tmp/project",
        entries: {
          "team.selection": {
            key: "team.selection",
            content: "Team：前端联调团队",
            updatedAt: 1,
          },
        },
      },
      selectedTeam: {
        id: "team-1",
        source: "builtin",
        description: "负责跨文件定位与修复",
        roles: [
          {
            id: "researcher",
            label: "研究员",
            summary: "负责收集资料",
            profileId: "code-explorer",
            roleKey: "explorer",
            skillIds: ["repo-exploration"],
          },
        ],
      },
      selectedTeamLabel: "前端联调团队",
      selectedTeamSummary: "按定位、修复、验证三段推进",
      themeWorkbenchActiveQueueTitle: "  修复导入渲染  ",
      workspaceSkillBindings: [workspaceSkillBinding],
      workspaceSkillRuntimeEnable: {
        workspaceRoot: "/tmp/project",
        bindings: [workspaceSkillBinding],
      },
    });

    expect(metadata).toMatchObject({
      theme: "general",
      preferences: {
        task: true,
        subagent: true,
      },
      session_mode: "general_workbench",
      gate_key: "write_mode",
      run_title: "修复导入渲染",
      content_id: "content-1",
      preferred_team_preset_id: "builtin-research",
      selected_team_id: "team-1",
      selected_team_source: "builtin",
      selected_team_label: "前端联调团队",
      selected_team_description: "负责跨文件定位与修复",
      selected_team_summary: "按定位、修复、验证三段推进",
      agent_response_language: "en-US",
      browser_assist: {
        enabled: true,
        profile_key: "general_browser_assist",
        preferred_backend: "lime_extension_bridge",
        auto_launch: false,
        stream_mode: "both",
      },
      team_memory_shadow: {
        repo_scope: "/tmp/project",
        entries: [
          {
            key: "team.selection",
            content: "Team：前端联调团队",
            updated_at: 1,
          },
        ],
      },
      workspace_skill_bindings: {
        source: "p3c_runtime_binding",
        bindings: [
          expect.objectContaining({
            directory: "capability-report",
            source_draft_id: "capdraft-1",
          }),
        ],
      },
      workspace_skill_runtime_enable: {
        source: "manual_session_enable",
        approval: "manual",
        workspace_root: "/tmp/project",
        bindings: [
          expect.objectContaining({
            directory: "capability-report",
            skill: "project:capability-report",
          }),
        ],
      },
    });
    expect(metadata.selected_team_roles).toEqual([
      {
        id: "researcher",
        label: "研究员",
        summary: "负责收集资料",
        profile_id: "code-explorer",
        role_key: "explorer",
        skill_ids: ["repo-exploration"],
      },
    ]);
  });

  it("非主题工作台时不应写入 gate key", () => {
    const metadata = resolveWorkspaceHarnessRequestMetadata({
      effectiveChatToolPreferences: {
        task: false,
        subagent: false,
      },
      isThemeWorkbench: false,
      mappedTheme: "general",
      currentGateKey: "write_mode",
      workspaceSkillBindings: [],
    });

    expect(metadata.session_mode).toBe("default");
    expect(metadata.gate_key).toBeUndefined();
    expect(metadata.workspace_skill_bindings).toBeUndefined();
  });
});
