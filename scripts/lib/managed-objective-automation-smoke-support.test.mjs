import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildAutomationFixtureMarkdown,
  buildAutomationFixtureScriptedResponses,
  buildAutomationJobRequest,
  buildAutomationSmokeEvidence,
  buildCapabilityDraftRequest,
  fixtureChatRequestCount,
  metadataFromRun,
  registerAutomationSmokeWorkspaceSkill,
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
      tool_call_strategy: "native",
      model_capabilities: {
        capabilities: {
          tools: true,
          streaming: true,
          functionCalling: true,
        },
        taskFamilies: ["chat"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        runtimeFeatures: ["streaming", "tool_calling"],
      },
    },
  };
  const threadLineage = {
    session_id: "session-smoke-1",
    thread_id: "thread-smoke-1",
  };

  it("应构造默认离线 automation job，不携带真实 Provider 偏好", () => {
    const request = buildAutomationJobRequest(
      "workspace-1",
      skillBinding,
      fixtureProvider,
      threadLineage,
    );
    const serialized = JSON.stringify(request);
    const metadata = request.payload.request_metadata;

    expect(request.workspace_id).toBe("workspace-1");
    expect(request.payload.kind).toBe("agent_turn");
    expect(request.payload.session_id).toBe("session-smoke-1");
    expect(request.payload.thread_id).toBe("thread-smoke-1");
    expect(request.payload.sandbox_policy).toBe("workspace-write");
    expect(request.payload.provider_config).toMatchObject({
      provider_id: "fixture-openai",
      provider_name: "openai",
      model_name: "lime-fixture-chat",
      api_key: "fixture-key",
      base_url: "http://127.0.0.1:34567",
      tool_call_strategy: "native",
      model_capabilities: {
        capabilities: {
          tools: true,
          streaming: true,
          functionCalling: true,
        },
        runtimeFeatures: ["streaming", "tool_calling"],
      },
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
      plugin_runtime_skill_contract: {
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
          dispatch: "agentSession/turn/start",
        },
      },
    });
    expect(serialized).not.toMatch(/deepseek|api\.deepseek|OPENAI_API_KEY/);
    expect(serialized).not.toMatch(/provider_preference|model_preference/);
  });

  it("默认 automation job 缺少 thread lineage 时应失败", () => {
    expect(() =>
      buildAutomationJobRequest(
        "workspace-1",
        skillBinding,
        fixtureProvider,
      ),
    ).toThrow(/session_id \/ thread_id lineage/);
  });

  it("默认 automation job 应拒绝非 localhost provider_config", () => {
    expect(() =>
      buildAutomationJobRequest(
        "workspace-1",
        skillBinding,
        {
          ...fixtureProvider,
          providerConfig: {
            ...fixtureProvider.providerConfig,
            base_url: "https://api.deepseek.com",
          },
        },
        threadLineage,
      ),
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

  it("注册 automation smoke workspace skill 时不再调用退役 Capability Draft authoring 命令", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "lime-managed-objective-smoke-"),
    );
    const invokedCommands = [];
    const invoke = async (_options, command, payload) => {
      invokedCommands.push(command);
      if (command !== "app_server_handle_json_lines") {
        throw new Error(`unexpected command: ${command}`);
      }
      const requestLine = payload?.request?.lines?.[0];
      const request = JSON.parse(requestLine);
      expect(request.method).toBe("workspaceSkillBindings/list");
      return {
        result: {
          lines: [
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result: {
                bindings: [
                  {
                    directory: "managed-objective-automation-smoke-report",
                    skillName:
                      "project:managed-objective-automation-smoke-report",
                    registeredSkillDirectory: path.join(
                      workspaceRoot,
                      ".agents",
                      "skills",
                      "managed-objective-automation-smoke-report",
                    ),
                    bindingStatus: "ready_for_manual_enable",
                  },
                ],
              },
            }),
          ],
        },
      };
    };

    const registration = await registerAutomationSmokeWorkspaceSkill(
      {},
      workspaceRoot,
      invoke,
    );

    expect(registration).toMatchObject({
      workspaceRoot,
      skillDirectory: "managed-objective-automation-smoke-report",
      skillName: "project:managed-objective-automation-smoke-report",
      bindingStatus: "ready_for_manual_enable",
    });
    await expect(
      fs.readFile(
        path.join(
          workspaceRoot,
          ".agents",
          "skills",
          "managed-objective-automation-smoke-report",
          "SKILL.md",
        ),
        "utf8",
      ),
    ).resolves.toContain("# Managed Objective Automation Smoke Report");
    expect(invokedCommands).toEqual(["app_server_handle_json_lines"]);
  });

  it("fixture 应返回 Markdown 报告而不是模型自报标记", () => {
    const markdown = buildAutomationFixtureMarkdown();

    expect(markdown).toContain("# Managed Objective Automation Smoke Report");
    expect(markdown).toContain("status: completed");
    expect(markdown).not.toContain("MO_AUTOMATION_OK");
  });

  it("fixture scripted responses 应先调用 SkillTool，再写入报告 artifact", async () => {
    const responses = buildAutomationFixtureScriptedResponses(skillBinding);

    expect(responses[0]).toMatchObject({
      type: "tool_call",
      name: "Skill",
      arguments: {
        skill: "project:capability-automation-smoke",
      },
    });
    const writeResponse = await responses[1]({
      body: {
        tools: [
          { type: "function", function: { name: "Write" } },
          { type: "function", function: { name: "StructuredOutput" } },
        ],
      },
    });
    expect(writeResponse).toMatchObject({
      type: "tool_call",
      name: "Write",
      arguments: {
        path: "reports/managed-objective-automation-smoke.md",
      },
    });
    expect(writeResponse.arguments.content).toContain(
      "# Managed Objective Automation Smoke Report",
    );
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
      job: {
        id: "job-1",
        payload: {
          kind: "agent_turn",
          session_id: "session-1",
          thread_id: "thread-1",
        },
      },
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
              dispatch: "agentSession/turn/start",
            },
          },
        },
      },
      runtimeSnapshot: {
        threadRead: {
          turnCount: 1,
          threadStatus: "completed",
          latestTurnStatus: "completed",
        },
        fixtureChatRequestCount: 1,
      },
      evidencePack: {
        sessionId: "session-1",
        threadId: "thread-1",
        latestTurnStatus: "completed",
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
    expect(evidence.projectThreadStatus).toBe("pass");
    expect(evidence.completionAuditStatus).toBe("pass");
    expect(evidence.coverage.avoidsLiveProviderByDefault).toBe(true);
    expect(evidence.coverage.usesRegisteredWorkspaceSkill).toBe(true);
    expect(evidence.coverage.usesExplicitThreadLineage).toBe(true);
    expect(evidence.assertions.jobPayloadHasExplicitLineage).toBe(true);
    expect(evidence.assertions.runSessionMatchesJobPayload).toBe(true);
    expect(evidence.projectThreadAssertions).toMatchObject({
      evidencePackSessionScopeMatchesRun: true,
      evidencePackThreadScopeMatchesJobPayload: true,
      runtimeTurnCompleted: true,
      evidencePackTurnCompleted: true,
    });
    expect(evidence.assertions.completionAuditCompleted).toBe(true);
    expect(evidence.provider.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(evidence.fixture.chatCompletionRequestCount).toBe(1);
    expect(fixtureChatRequestCount([{ path: "/v1/models" }])).toBe(0);
  });

  it("completion audit 未完成时保留全量失败，但 ProjectThread lineage 可单独通过", () => {
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
      job: {
        id: "job-1",
        payload: {
          kind: "agent_turn",
          session_id: "session-1",
          thread_id: "thread-1",
        },
      },
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
              dispatch: "agentSession/turn/start",
            },
          },
        },
      },
      runtimeSnapshot: {
        threadRead: {
          turnCount: 1,
          threadStatus: "completed",
          latestTurnStatus: "completed",
        },
        fixtureChatRequestCount: 1,
      },
      evidencePack: {
        latestTurnStatus: "completed",
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
    expect(evidence.projectThreadStatus).toBe("pass");
    expect(evidence.completionAuditStatus).toBe("fail");
    expect(evidence.projectThreadAssertions).toMatchObject({
      jobPayloadHasExplicitLineage: true,
      runSessionMatchesJobPayload: true,
      evidencePackSessionScopeMatchesRun: true,
      evidencePackThreadScopeMatchesJobPayload: true,
      runtimeTurnCompleted: true,
      evidencePackTurnCompleted: true,
    });
    expect(evidence.assertions.completionAuditCompleted).toBe(false);
    expect(evidence.completionAuditAssertions).toMatchObject({
      workspaceSkillToolCallRecorded: false,
      artifactRecorded: false,
      completionAuditCompleted: false,
    });
  });
});
