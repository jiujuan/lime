import { describe, expect, it } from "vitest";

import {
  buildAutomationFixtureMarkdown,
  buildAutomationJobRequest,
  buildAutomationSmokeEvidence,
  buildCapabilityDraftRequest,
  fixtureChatRequestCount,
  metadataFromRun,
  sessionIdFromRun,
  workspaceIdFromDefaultProject,
  workspaceRootFromDefaultProject,
} from "./managed-objective-automation-smoke-support.mjs";

describe("managed-objective-automation-smoke-support", () => {
  const skillBinding = {
    workspaceRoot: "/tmp/lime-workspace",
    skillDirectory: "capability-automation-smoke",
    skillName: "project:capability-automation-smoke",
    registeredSkillDirectory:
      "/tmp/lime-workspace/.agents/skills/capability-automation-smoke",
    sourceDraftId: "capdraft-automation-smoke",
    sourceVerificationReportId: "capver-automation-smoke",
    permissionSummary: ["Level 0 只读发现"],
  };
  const fixtureProvider = {
    providerPreference: "fixture-openai",
    providerName: "openai",
    modelPreference: "lime-fixture-chat",
    source: "localhost-fixture",
    providerConfig: {
      provider_id: "fixture-openai",
      provider_name: "openai",
      model_name: "lime-fixture-chat",
      api_key: "fixture-key",
      base_url: "http://127.0.0.1:34567",
    },
  };

  it("应构造默认离线 automation job，不携带真实 Provider 偏好", () => {
    const request = buildAutomationJobRequest(
      "workspace-1",
      skillBinding,
      fixtureProvider,
    );
    const serialized = JSON.stringify(request);
    const metadata = request.payload.request_metadata;

    expect(request.workspace_id).toBe("workspace-1");
    expect(request.payload.kind).toBe("agent_turn");
    expect(request.payload.sandbox_policy).toBe("workspace-write");
    expect(request.payload.provider_config).toMatchObject({
      provider_id: "fixture-openai",
      provider_name: "openai",
      model_name: "lime-fixture-chat",
      api_key: "fixture-key",
      base_url: "http://127.0.0.1:34567",
    });
    expect(metadata.artifact_mode).toBe("draft");
    expect(metadata.artifact_kind).toBe("report");
    expect(metadata.harness).toMatchObject({
      agent_envelope: {
        skill: "project:capability-automation-smoke",
        source_draft_id: "capdraft-automation-smoke",
      },
      workspace_skill_runtime_enable: {
        bindings: [
          {
            directory: "capability-automation-smoke",
            skill: "project:capability-automation-smoke",
          },
        ],
      },
      agent_app_runtime_skill_contract: {
        required_skills: [
          {
            skill: "project:capability-automation-smoke",
            required: true,
          },
        ],
      },
      managed_objective: {
        completion_audit: "artifact_or_evidence_required",
        continuation_policy: {
          dispatch: "agent_runtime_submit_turn",
        },
      },
    });
    expect(serialized).not.toMatch(/deepseek|api\.deepseek|OPENAI_API_KEY/);
    expect(serialized).not.toMatch(/provider_preference|model_preference/);
  });

  it("默认 automation job 应拒绝非 localhost provider_config", () => {
    expect(() =>
      buildAutomationJobRequest("workspace-1", skillBinding, {
        ...fixtureProvider,
        providerConfig: {
          ...fixtureProvider.providerConfig,
          base_url: "https://api.deepseek.com",
        },
      }),
    ).toThrow(/localhost fixture provider_config/);
  });

  it("应归一化 workspace、run metadata 与 runtime session id", () => {
    expect(workspaceIdFromDefaultProject({ workspaceId: "workspace-1" })).toBe(
      "workspace-1",
    );
    expect(workspaceRootFromDefaultProject({ rootPath: "/tmp/work" })).toBe(
      "/tmp/work",
    );
    expect(sessionIdFromRun({ session_id: "session-1" })).toBe("session-1");
    expect(metadataFromRun({ metadata: '{"harness":{"ok":true}}' })).toEqual({
      harness: { ok: true },
    });
    expect(metadataFromRun({ metadata: "{not-json" })).toBeNull();
  });

  it("应生成符合 Capability Draft 标准的 workspace skill 草案", () => {
    const request = buildCapabilityDraftRequest("/tmp/lime-workspace");
    const skillMd = request.generatedFiles.find(
      (file) => file.relativePath === "SKILL.md",
    )?.content;

    expect(request.workspaceRoot).toBe("/tmp/lime-workspace");
    expect(request.generatedFiles.map((file) => file.relativePath)).toEqual([
      "SKILL.md",
      "contract/input.schema.json",
      "contract/output.schema.json",
      "examples/input.sample.json",
    ]);
    expect(skillMd).toContain("## 输入");
    expect(skillMd).toContain("## 执行步骤");
    expect(skillMd).toContain("## 输出");
    expect(JSON.stringify(request)).not.toMatch(/deepseek|api\.deepseek/);
  });

  it("fixture 应返回 Markdown 报告而不是模型自报标记", () => {
    const markdown = buildAutomationFixtureMarkdown();

    expect(markdown).toContain("# Managed Objective Automation Smoke Report");
    expect(markdown).toContain("status: completed");
    expect(markdown).not.toContain("MO_AUTOMATION_OK");
  });

  it("应从 fixture 请求与 owner run 构造通过证据", () => {
    const evidence = buildAutomationSmokeEvidence({
      generatedAt: "2026-05-26T00:00:00.000Z",
      options: {
        allowLiveProvider: false,
        timeoutMs: 180_000,
        intervalMs: 1_000,
      },
      health: { status: "ok" },
      workspace: { id: "workspace-1", name: "Workspace" },
      provider: {
        providerPreference: "fixture-openai",
        providerName: "openai",
        modelPreference: "lime-fixture-chat",
        source: "localhost-fixture",
        providerConfig: {
          base_url: "http://127.0.0.1:34567",
        },
      },
      providerSessionId: "provider-session-1",
      job: { id: "job-1" },
      runResult: { success_count: 1 },
      latestRun: {
        id: "run-1",
        source: "automation",
        source_ref: "job-1",
        session_id: "session-1",
        status: "completed",
      },
      latestRunMetadata: {
        harness: {
          agent_envelope: {
            skill: "project:capability-automation-smoke",
          },
          workspace_skill_runtime_enable: {
            bindings: [
              {
                directory: "capability-automation-smoke",
                skill: "project:capability-automation-smoke",
              },
            ],
          },
          managed_objective: {
            owner_id: "job-1",
            completion_audit: "artifact_or_evidence_required",
            continuation_policy: {
              dispatch: "agent_runtime_submit_turn",
            },
          },
        },
      },
      runtimeSnapshot: {
        threadRead: {
          turnCount: 1,
          threadStatus: "completed",
        },
        fixtureChatRequestCount: 1,
      },
      evidencePack: {
        sessionId: "session-1",
        recentArtifactCount: 1,
        completionAuditSummary: {
          decision: "completed",
          ownerAuditStatuses: ["audit_input_ready"],
          workspaceSkillToolCallCount: 1,
          artifactCount: 1,
          requiredEvidence: {
            automationOwner: true,
            workspaceSkillToolCall: true,
            artifactOrTimeline: true,
          },
        },
      },
      fixtureRequests: [
        {
          path: "/v1/chat/completions",
          body: { model: "lime-fixture-chat" },
        },
      ],
    });

    expect(evidence.status).toBe("pass");
    expect(evidence.coverage.avoidsLiveProviderByDefault).toBe(true);
    expect(evidence.coverage.usesRegisteredWorkspaceSkill).toBe(true);
    expect(evidence.assertions.completionAuditCompleted).toBe(true);
    expect(evidence.provider.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(evidence.fixture.chatCompletionRequestCount).toBe(1);
    expect(fixtureChatRequestCount([{ path: "/v1/models" }])).toBe(0);
  });

  it("completion audit 未完成时应失败，避免把模型回复误判为目标完成", () => {
    const evidence = buildAutomationSmokeEvidence({
      generatedAt: "2026-05-26T00:00:00.000Z",
      options: {
        allowLiveProvider: false,
        timeoutMs: 180_000,
        intervalMs: 1_000,
      },
      health: { status: "ok" },
      workspace: { id: "workspace-1", name: "Workspace" },
      provider: {
        providerPreference: "fixture-openai",
        providerName: "openai",
        modelPreference: "lime-fixture-chat",
        source: "localhost-fixture",
        providerConfig: {
          base_url: "http://127.0.0.1:34567",
        },
      },
      providerSessionId: "provider-session-1",
      job: { id: "job-1" },
      runResult: { success_count: 1 },
      latestRun: {
        id: "run-1",
        source: "automation",
        source_ref: "job-1",
        session_id: "session-1",
        status: "completed",
      },
      latestRunMetadata: {
        harness: {
          agent_envelope: {
            skill: "project:capability-automation-smoke",
          },
          workspace_skill_runtime_enable: {
            bindings: [
              {
                directory: "capability-automation-smoke",
                skill: "project:capability-automation-smoke",
              },
            ],
          },
          managed_objective: {
            owner_id: "job-1",
            completion_audit: "artifact_or_evidence_required",
            continuation_policy: {
              dispatch: "agent_runtime_submit_turn",
            },
          },
        },
      },
      runtimeSnapshot: {
        threadRead: {
          turnCount: 1,
          threadStatus: "completed",
        },
        fixtureChatRequestCount: 1,
      },
      evidencePack: {
        sessionId: "session-1",
        completionAuditSummary: {
          decision: "verifying",
          ownerAuditStatuses: ["audit_input_ready"],
          workspaceSkillToolCallCount: 0,
          artifactCount: 0,
        },
      },
      fixtureRequests: [
        {
          path: "/v1/chat/completions",
          body: { model: "lime-fixture-chat" },
        },
      ],
    });

    expect(evidence.status).toBe("fail");
    expect(evidence.assertions.completionAuditCompleted).toBe(false);
    expect(evidence.assertions.workspaceSkillToolCallRecorded).toBe(false);
    expect(evidence.assertions.artifactRecorded).toBe(false);
  });
});
