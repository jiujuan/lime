import { summarizeEvidencePack } from "./managed-objective-continuation-smoke-core.mjs";
import {
  findWorkspaceSkillBinding,
  workspaceSkillDirectoryFromName,
  writeWorkspaceSkillFixture,
} from "./workspace-skill-fixture.mjs";

const CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
const COMPLETION_AUDIT_POLICY = "artifact_or_evidence_required";
const CURRENT_AGENT_TURN_DISPATCH = "agentSession/turn/start";
const AUTOMATION_SMOKE_SKILL_TITLE =
  "Managed Objective Automation Smoke Report";
const AUTOMATION_SMOKE_ARTIFACT_PATH =
  "reports/managed-objective-automation-smoke.md";
const AUTOMATION_SMOKE_SKILL_BOUNDARY = {
  registrationSurface: "direct-workspace-skill-fixture",
  classification: "current-smoke-fixture",
  retiredCommandSurface: "capability-draft-authoring-commands",
  currentReadMethods: ["workspaceSkillBindings/list"],
  exitCondition:
    "keep this smoke independent from P11 Capability Draft authoring commands; use App Server capabilityDraft/* only after P11 current methods exist",
};

function pickString(target, ...keys) {
  for (const key of keys) {
    const value = target?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function pickArray(target, ...keys) {
  for (const key of keys) {
    const value = target?.[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function numberField(target, ...keys) {
  for (const key of keys) {
    const value = target?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function requestToolNames(body) {
  if (!Array.isArray(body?.tools)) {
    return [];
  }

  return body.tools
    .map((tool) =>
      String(
        tool?.function?.name ||
          tool?.name ||
          tool?.tool?.function?.name ||
          "",
      ).trim(),
    )
    .filter(Boolean);
}

function completionAuditSummaryFromPack(evidencePack) {
  return (
    evidencePack?.completion_audit_summary ||
    evidencePack?.completionAuditSummary ||
    null
  );
}

export function workspaceIdFromDefaultProject(workspace) {
  return String(
    workspace?.id || workspace?.workspace_id || workspace?.workspaceId || "",
  ).trim();
}

export function workspaceRootFromDefaultProject(workspace) {
  return String(
    workspace?.root_path || workspace?.rootPath || workspace?.path || "",
  ).trim();
}

export function metadataFromRun(run) {
  if (!run?.metadata) {
    return null;
  }
  if (typeof run.metadata === "object") {
    return run.metadata;
  }
  try {
    return JSON.parse(String(run.metadata));
  } catch {
    return null;
  }
}

export function sessionIdFromRun(run) {
  return String(run?.session_id || run?.sessionId || "").trim();
}

export function fixtureChatRequests(fixtureRequests) {
  return fixtureRequests.filter(
    (request) => request.path === CHAT_COMPLETIONS_PATH,
  );
}

export function fixtureChatRequestCount(fixtureRequests) {
  return fixtureChatRequests(fixtureRequests).length;
}

export function buildCapabilityDraftRequest(workspaceRoot) {
  return {
    workspaceRoot,
    name: AUTOMATION_SMOKE_SKILL_TITLE,
    description:
      "把 Managed Objective automation smoke 的离线 fixture 结果整理成 Markdown 证据报告。",
    userGoal:
      "自动化任务执行后，生成一份 Markdown 报告，用于证明 workspace skill 预执行、automation owner run 与 completion audit 均已记录。",
    sourceKind: "fixture",
    sourceRefs: ["scripts/managed-objective-automation-smoke.mjs"],
    permissionSummary: ["Level 0 只读发现", "Level 1 draft-scoped write"],
    generatedFiles: [
      {
        relativePath: "SKILL.md",
        content: [
          "---",
          `name: ${AUTOMATION_SMOKE_SKILL_TITLE}`,
          "description: 把 Managed Objective automation smoke 的离线 fixture 结果整理成 Markdown 证据报告。",
          "---",
          "",
          `# ${AUTOMATION_SMOKE_SKILL_TITLE}`,
          "",
          "## 何时使用",
          "当自动化任务需要把离线 fixture 结果整理成可审计 Markdown 报告时使用。",
          "",
          "## 输入",
          "- objective: Managed Objective 摘要。",
          "- fixture_status: 本地 fixture 执行状态。",
          "",
          "## 执行步骤",
          "1. 读取自动化任务上下文和 fixture 状态。",
          "2. 确认 workspace skill 预执行已经进入 runtime timeline。",
          "3. 输出 Markdown 报告，包含状态、证据和下一步。",
          "",
          "## 输出",
          "- markdown_report: Markdown 证据报告。",
        ].join("\n"),
      },
      {
        relativePath: "contract/input.schema.json",
        content: JSON.stringify(
          {
            type: "object",
            required: ["objective"],
            properties: {
              objective: { type: "string" },
              fixture_status: { type: "string" },
            },
            additionalProperties: false,
          },
          null,
          2,
        ),
      },
      {
        relativePath: "contract/output.schema.json",
        content: JSON.stringify(
          {
            type: "object",
            required: ["markdown_report"],
            properties: {
              markdown_report: { type: "string" },
              evidence_notes: { type: "array", items: { type: "string" } },
            },
            additionalProperties: false,
          },
          null,
          2,
        ),
      },
      {
        relativePath: "examples/input.sample.json",
        content: JSON.stringify(
          {
            objective: "Managed Objective automation smoke",
            fixture_status: "completed",
          },
          null,
          2,
        ),
      },
    ],
  };
}

function automationSmokeSkillDirectoryName() {
  return workspaceSkillDirectoryFromName(AUTOMATION_SMOKE_SKILL_TITLE);
}

function buildAutomationSmokeSkillFiles() {
  const request = buildCapabilityDraftRequest("");
  return request.generatedFiles;
}

function buildAutomationSmokeSkillRegistration() {
  const timestamp = new Date().toISOString();
  return {
    registrationId: `smoke-capreg-${Date.now()}`,
    registeredAt: timestamp,
    sourceDraftId: "smoke-capdraft-managed-objective-automation",
    sourceVerificationReportId:
      "smoke-capver-managed-objective-automation-fixture",
    generatedFileCount: buildAutomationSmokeSkillFiles().length,
    permissionSummary: ["Level 0 只读发现", "Level 1 fixture-scoped write"],
    source: "managed_objective_automation_smoke_fixture",
  };
}

async function writeAutomationSmokeWorkspaceSkill(workspaceRoot) {
  const skillDirectory = automationSmokeSkillDirectoryName();
  return await writeWorkspaceSkillFixture({
    workspaceRoot,
    directory: skillDirectory,
    generatedFiles: buildAutomationSmokeSkillFiles(),
    registration: buildAutomationSmokeSkillRegistration(),
  });
}

async function invokeAppServer(options, invoke, method, params = {}) {
  const response = await invoke(options, "app_server_handle_json_lines", {
    request: {
      lines: [
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
      ],
    },
  });
  const responseLines = response?.result?.lines ?? response?.lines;
  const lines = Array.isArray(responseLines) ? responseLines : [];
  for (const line of lines) {
    const text = typeof line === "string" ? line.trim() : "";
    if (!text) {
      continue;
    }
    const message = JSON.parse(text);
    if (message?.id !== 1) {
      continue;
    }
    if (message.error) {
      throw new Error(`${method} failed: ${JSON.stringify(message.error)}`);
    }
    return message.result;
  }
  throw new Error(`${method} did not return a JSON-RPC response`);
}

export async function registerAutomationSmokeWorkspaceSkill(
  options,
  workspaceRoot,
  invoke,
) {
  const {
    skillDirectory: writtenSkillDirectory,
    registeredSkillDirectory: writtenRegisteredSkillDirectory,
    registration,
  } = await writeAutomationSmokeWorkspaceSkill(workspaceRoot);
  const skillDirectory = pickString(
    registration,
    "skillDirectory",
    "skill_directory",
  ) || writtenSkillDirectory;
  const registeredSkillDirectory =
    pickString(
      registration,
      "registeredSkillDirectory",
      "registered_skill_directory",
    ) || writtenRegisteredSkillDirectory;
  const sourceDraftId =
    pickString(registration, "sourceDraftId", "source_draft_id") ||
    "smoke-capdraft-managed-objective-automation";
  const sourceVerificationReportId = pickString(
    registration,
    "sourceVerificationReportId",
    "source_verification_report_id",
  );
  if (!skillDirectory || !registeredSkillDirectory) {
    throw new Error("automation smoke workspace skill fixture 缺少注册目录");
  }
  if (!sourceVerificationReportId) {
    throw new Error(
      "automation smoke workspace skill fixture 缺少 verification provenance",
    );
  }

  const bindingSnapshot = await invokeAppServer(
    options,
    invoke,
    "workspaceSkillBindings/list",
    {
      workspaceRoot,
      caller: "assistant",
      workbench: true,
      browserAssist: false,
    },
  );
  const binding = findWorkspaceSkillBinding(
    bindingSnapshot,
    registeredSkillDirectory,
    skillDirectory,
  );
  if (!binding) {
    throw new Error("runtime binding readiness 未找到刚注册的 workspace skill");
  }
  const bindingStatus = pickString(binding, "bindingStatus", "binding_status");
  if (bindingStatus !== "ready_for_manual_enable") {
    throw new Error(`workspace skill binding 尚不可启用: ${bindingStatus}`);
  }

  return {
    workspaceRoot,
    skillDirectory,
    skillName: `project:${skillDirectory}`,
    registeredSkillDirectory,
    sourceDraftId,
    sourceVerificationReportId,
    verificationReportId: sourceVerificationReportId,
    registrationId: pickString(
      registration,
      "registrationId",
      "registration_id",
    ),
    bindingStatus,
    boundary: AUTOMATION_SMOKE_SKILL_BOUNDARY,
    permissionSummary: pickArray(
      registration,
      "permissionSummary",
      "permission_summary",
    ),
  };
}

function normalizeSkillBinding(skillBinding) {
  const skillDirectory = pickString(skillBinding, "skillDirectory");
  const skillName =
    pickString(skillBinding, "skillName") ||
    (skillDirectory ? `project:${skillDirectory}` : "");
  if (!skillDirectory || !skillName) {
    throw new Error(
      "buildAutomationJobRequest 需要已注册的 workspace skill binding",
    );
  }
  return {
    workspaceRoot: pickString(skillBinding, "workspaceRoot"),
    skillDirectory,
    skillName,
    registeredSkillDirectory: pickString(
      skillBinding,
      "registeredSkillDirectory",
    ),
    sourceDraftId: pickString(skillBinding, "sourceDraftId"),
    sourceVerificationReportId: pickString(
      skillBinding,
      "sourceVerificationReportId",
    ),
    permissionSummary: Array.isArray(skillBinding?.permissionSummary)
      ? skillBinding.permissionSummary
      : [],
  };
}

function normalizeThreadLineage(threadLineage) {
  const sessionId = pickString(threadLineage, "session_id", "sessionId");
  const threadId = pickString(threadLineage, "thread_id", "threadId");
  if (!sessionId || !threadId) {
    throw new Error(
      "buildAutomationJobRequest 需要显式 session_id / thread_id lineage",
    );
  }
  return { sessionId, threadId };
}

function buildManagedObjectiveHarness(skillBinding) {
  const binding = normalizeSkillBinding(skillBinding);
  return {
    agent_envelope: {
      source: "managed_objective_automation_smoke",
      skill: binding.skillName,
      skill_directory: binding.skillDirectory,
      source_draft_id: binding.sourceDraftId,
      source_verification_report_id: binding.sourceVerificationReportId,
      registered_skill_directory: binding.registeredSkillDirectory,
    },
    workspace_skill_runtime_enable: {
      source: "manual_session_enable",
      approval: "manual",
      authorization_scope: "session",
      workspace_root: binding.workspaceRoot,
      bindings: [
        {
          directory: binding.skillDirectory,
          skill: binding.skillName,
          registered_skill_directory: binding.registeredSkillDirectory,
          source_draft_id: binding.sourceDraftId,
          source_verification_report_id: binding.sourceVerificationReportId,
          permission_summary: binding.permissionSummary,
        },
      ],
    },
    plugin_runtime_skill_contract: {
      policy: "must_use_required_skills_before_final_artifact",
      required_skills: [{ skill: binding.skillName, required: true }],
    },
    managed_objective: {
      source: "managed_objective_due_job",
      owner_type: "automation_job",
      state: "planned",
      objective:
        "Managed Objective automation smoke：通过离线 fixture 执行一次自动化任务，并导出 owner evidence。",
      success_criteria: [
        "automation job 执行通过 agentSession/turn/start",
        "运行记录能按 runtime session 查询 automation owner",
        "evidence pack 能解释 automation owner 与 objective audit",
      ],
      continuation_policy: {
        mode: "automation_due_job",
        dispatch: CURRENT_AGENT_TURN_DISPATCH,
      },
      completion_audit: COMPLETION_AUDIT_POLICY,
      completion_evidence_policy: {
        kind: "artifact_or_evidence_required",
        required_successes: 1,
        failure_block_after: 2,
        evidence_pack_ref:
          ".lime/harness/managed-objective-automation-smoke/evidence-pack",
        artifact_refs: ["reports/managed-objective-automation-smoke.md"],
        blocked_user_prompt: "请检查自动化配置后重试。",
      },
    },
  };
}

function futureAtSchedule() {
  return {
    kind: "at",
    at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function normalizeLocalFixtureProviderConfig(provider) {
  const providerConfig = provider?.providerConfig;
  const baseUrl = String(
    providerConfig?.base_url || providerConfig?.baseUrl || "",
  ).trim();
  if (!providerConfig || !baseUrl) {
    throw new Error(
      "buildAutomationJobRequest 需要 localhost fixture provider_config",
    );
  }
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/.test(baseUrl)) {
    throw new Error(
      "默认 automation smoke 只允许 localhost fixture provider_config",
    );
  }

  return {
    ...providerConfig,
    base_url: baseUrl,
  };
}

export function buildAutomationJobRequest(
  workspaceId,
  skillBinding,
  provider,
  threadLineage,
) {
  const timestamp = new Date().toISOString();
  const lineage = normalizeThreadLineage(threadLineage);
  return {
    name: `Managed Objective automation smoke ${timestamp}`,
    description: "offline managed objective automation owner smoke",
    enabled: true,
    workspace_id: workspaceId,
    execution_mode: "skill",
    schedule: futureAtSchedule(),
    payload: {
      kind: "agent_turn",
      prompt: [
        "请生成一份 Markdown 证据报告，标题必须是 `# Managed Objective Automation Smoke Report`。",
        "报告需包含 status、evidence、next step 三个要点。",
        "不要调用外部网络；只使用当前离线 fixture 与已预执行的 workspace skill 证据。",
      ].join("\n"),
      session_id: lineage.sessionId,
      thread_id: lineage.threadId,
      web_search: false,
      approval_policy: "on-request",
      sandbox_policy: "workspace-write",
      provider_config: normalizeLocalFixtureProviderConfig(provider),
      request_metadata: {
        artifact_mode: "draft",
        artifact_stage: "stage2",
        artifact_kind: "report",
        artifact_request_id: `managed-objective-automation-smoke:${timestamp}`,
        title: "Managed Objective Automation Smoke Report",
        harness: buildManagedObjectiveHarness(skillBinding),
      },
    },
    delivery: { mode: "none", best_effort: true },
    timeout_secs: 120,
    max_retries: 1,
  };
}

export function buildAutomationFixtureMarkdown() {
  return [
    "# Managed Objective Automation Smoke Report",
    "",
    "- status: completed",
    "- evidence: workspace skill preexecution and automation owner run were recorded.",
    "- next step: export evidence pack and verify completion audit summary.",
  ].join("\n");
}

export function buildAutomationFixtureScriptedResponses(skillBinding) {
  const binding = normalizeSkillBinding(skillBinding);
  const reportMarkdown = buildAutomationFixtureMarkdown();

  return [
    {
      type: "tool_call",
      id: "call-managed-objective-automation-skill",
      name: "Skill",
      arguments: {
        skill: binding.skillName,
        args: {
          objective: "Managed Objective automation smoke",
          fixture_status: "completed",
        },
      },
    },
    ({ body }) => {
      const tools = requestToolNames(body);
      if (tools.includes("Write")) {
        return {
          type: "tool_call",
          id: "call-managed-objective-automation-write",
          name: "Write",
          arguments: {
            path: AUTOMATION_SMOKE_ARTIFACT_PATH,
            content: reportMarkdown,
            metadata: {
              source: "managed_objective_automation_smoke",
              artifact_kind: "report",
              skill: binding.skillName,
            },
          },
        };
      }
      if (tools.includes("StructuredOutput")) {
        return {
          type: "tool_call",
          id: "call-managed-objective-automation-structured-output",
          name: "StructuredOutput",
          arguments: {
            type: "artifact_document_draft",
            document: {
              schemaVersion: "artifact_document.v1",
              kind: "report",
              title: AUTOMATION_SMOKE_SKILL_TITLE,
              status: "ready",
              language: "zh-CN",
              summary:
                "Managed Objective automation smoke completed with workspace SkillTool evidence.",
              blocks: [
                {
                  id: "summary",
                  type: "rich_text",
                  text: reportMarkdown,
                },
              ],
              metadata: {
                source: "managed_objective_automation_smoke",
                skill: binding.skillName,
              },
            },
          },
        };
      }

      const toolSummary = tools.length > 0 ? tools.join(", ") : "<none>";
      throw new Error(
        `managed objective automation fixture expected Write or StructuredOutput tool after Skill, got ${toolSummary}`,
      );
    },
    {
      type: "text",
      content: reportMarkdown,
    },
  ];
}

export function buildAutomationSmokeEvidence({
  generatedAt,
  options,
  health,
  workspace,
  skillBinding,
  provider,
  providerSessionId,
  job,
  runResult,
  latestRun,
  latestRunMetadata,
  runtimeSnapshot,
  evidencePack,
  fixtureRequests,
}) {
  const runSessionId = sessionIdFromRun(latestRun);
  const jobPayload = job?.payload || null;
  const requestMetadata =
    jobPayload?.request_metadata || jobPayload?.requestMetadata || null;
  const harness =
    latestRunMetadata?.harness ||
    latestRunMetadata?.runtimeOptions?.metadata?.request_metadata?.harness ||
    latestRunMetadata?.runtimeOptions?.metadata?.requestMetadata?.harness ||
    requestMetadata?.harness ||
    null;
  const managedObjective =
    harness?.managed_objective || harness?.managedObjective || null;
  const workspaceSkillRuntimeEnable =
    harness?.workspace_skill_runtime_enable ||
    harness?.workspaceSkillRuntimeEnable ||
    null;
  const agentEnvelope =
    harness?.agent_envelope || harness?.agentEnvelope || null;
  const auditSummary = completionAuditSummaryFromPack(evidencePack);
  const chatRequests = fixtureChatRequests(fixtureRequests);
  const jobSessionId = pickString(jobPayload, "session_id", "sessionId");
  const jobThreadId = pickString(jobPayload, "thread_id", "threadId");
  const evidencePackSessionId = pickString(
    evidencePack,
    "session_id",
    "sessionId",
  );
  const evidencePackThreadId = pickString(
    evidencePack,
    "thread_id",
    "threadId",
  );
  const runtimeLatestTurnStatus = String(
    runtimeSnapshot?.threadRead?.latestTurnStatus ||
      runtimeSnapshot?.threadRead?.latest_turn_status ||
      runtimeSnapshot?.threadRead?.threadStatus ||
      "",
  ).toLowerCase();
  const evidencePackLatestTurnStatus = String(
    evidencePack?.latest_turn_status ||
      evidencePack?.latestTurnStatus ||
      evidencePack?.thread_status ||
      evidencePack?.threadStatus ||
      "",
  ).toLowerCase();
  const managedObjectiveOwnerKind = pickString(
    managedObjective,
    "owner_type",
    "ownerType",
    "owner_kind",
    "ownerKind",
  );
  const managedObjectiveOwnerId = pickString(
    managedObjective,
    "owner_id",
    "ownerId",
  );
  const assertions = {
    jobCreated: Boolean(job?.id),
    jobPayloadHasExplicitLineage: Boolean(jobSessionId && jobThreadId),
    runSessionMatchesJobPayload: Boolean(
      runSessionId && jobSessionId && runSessionId === jobSessionId,
    ),
    runSucceeded:
      Number(runResult?.success_count ?? runResult?.successCount ?? 0) >= 1 ||
      ["success", "completed"].includes(
        String(latestRun?.status || "").toLowerCase(),
      ),
    runHistoryHasSession: Boolean(runSessionId),
    ownerRunMatchesJob:
      String(latestRun?.source || "") === "automation" &&
      String(latestRun?.source_ref || latestRun?.sourceRef || "") ===
        String(job?.id || ""),
    managedObjectiveProjected:
      (managedObjectiveOwnerId === job?.id ||
        managedObjectiveOwnerKind === "automation_job") &&
      managedObjective?.continuation_policy?.dispatch ===
        CURRENT_AGENT_TURN_DISPATCH,
    ownerRunHasAuditInputs:
      Boolean(agentEnvelope) &&
      Boolean(workspaceSkillRuntimeEnable) &&
      managedObjective?.completion_audit === COMPLETION_AUDIT_POLICY,
    evidencePackExported: Boolean(evidencePack),
    evidencePackSessionScopeMatchesRun: Boolean(
      evidencePack &&
        runSessionId &&
        (!evidencePackSessionId || evidencePackSessionId === runSessionId),
    ),
    evidencePackThreadScopeMatchesJobPayload: Boolean(
      evidencePack &&
        jobThreadId &&
        (!evidencePackThreadId || evidencePackThreadId === jobThreadId),
    ),
    runtimeTurnCompleted: runtimeLatestTurnStatus === "completed",
    evidencePackTurnCompleted: evidencePackLatestTurnStatus === "completed",
    ownerAuditInputReady: Array.isArray(auditSummary?.ownerAuditStatuses)
      ? auditSummary.ownerAuditStatuses.includes("audit_input_ready")
      : false,
    workspaceSkillToolCallRecorded:
      numberField(
        auditSummary,
        "workspaceSkillToolCallCount",
        "workspace_skill_tool_call_count",
      ) > 0 || auditSummary?.requiredEvidence?.workspaceSkillToolCall === true,
    artifactRecorded:
      numberField(auditSummary, "artifactCount", "artifact_count") > 0 ||
      numberField(
        evidencePack,
        "recentArtifactCount",
        "recent_artifact_count",
      ) > 0,
    completionAuditCompleted: auditSummary?.decision === "completed",
    fixtureReceivedChatCompletion: chatRequests.length > 0,
  };
  const projectThreadAssertions = {
    jobCreated: assertions.jobCreated,
    jobPayloadHasExplicitLineage: assertions.jobPayloadHasExplicitLineage,
    runSessionMatchesJobPayload: assertions.runSessionMatchesJobPayload,
    runSucceeded: assertions.runSucceeded,
    runHistoryHasSession: assertions.runHistoryHasSession,
    ownerRunMatchesJob: assertions.ownerRunMatchesJob,
    managedObjectiveProjected: assertions.managedObjectiveProjected,
    ownerRunHasAuditInputs: assertions.ownerRunHasAuditInputs,
    evidencePackExported: assertions.evidencePackExported,
    evidencePackSessionScopeMatchesRun:
      assertions.evidencePackSessionScopeMatchesRun,
    evidencePackThreadScopeMatchesJobPayload:
      assertions.evidencePackThreadScopeMatchesJobPayload,
    runtimeTurnCompleted: assertions.runtimeTurnCompleted,
    evidencePackTurnCompleted: assertions.evidencePackTurnCompleted,
    fixtureReceivedChatCompletion: assertions.fixtureReceivedChatCompletion,
  };
  const completionAuditAssertions = {
    ownerAuditInputReady: assertions.ownerAuditInputReady,
    workspaceSkillToolCallRecorded: assertions.workspaceSkillToolCallRecorded,
    artifactRecorded: assertions.artifactRecorded,
    completionAuditCompleted: assertions.completionAuditCompleted,
  };

  return {
    schemaVersion: "v1",
    scenarioId: "managed-objective-automation-owner",
    status: Object.values(assertions).every(Boolean) ? "pass" : "fail",
    projectThreadStatus: Object.values(projectThreadAssertions).every(Boolean)
      ? "pass"
      : "fail",
    completionAuditStatus: Object.values(completionAuditAssertions).every(
      Boolean,
    )
      ? "pass"
      : "fail",
    generatedAt,
    command: "smoke:managed-objective-automation",
    coverage: {
      usesDevBridgeCurrentCommands: true,
      usesAutomationJobOwner: true,
      usesExplicitThreadLineage: Boolean(jobSessionId && jobThreadId),
      usesAppServerJsonRpcSubmitTurn: true,
      usesRegisteredWorkspaceSkill: Boolean(workspaceSkillRuntimeEnable),
      usesCapabilityDraftAuthoringCommands: false,
      usesLocalFixtureProvider: provider?.source === "localhost-fixture",
      avoidsLiveProviderByDefault: !options.allowLiveProvider,
      evidencePackExported: Boolean(evidencePack),
    },
    config: {
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
      providerMode: "fixture",
    },
    devBridge: {
      healthStatus: health?.status || null,
    },
    workspace: {
      id:
        workspace?.id ||
        workspace?.workspace_id ||
        workspace?.workspaceId ||
        null,
      name: workspace?.name || null,
    },
    provider: {
      providerPreference: provider?.providerPreference || null,
      providerName: provider?.providerName || null,
      modelPreference: provider?.modelPreference || null,
      source: provider?.source || null,
      baseUrl: provider?.providerConfig?.base_url || null,
      providerSessionId,
    },
    automation: {
      workspaceSkillRegistrationBoundary:
        skillBinding?.boundary || AUTOMATION_SMOKE_SKILL_BOUNDARY,
      jobId: job?.id || null,
      sessionId: jobSessionId || null,
      threadId: jobThreadId || null,
      runResult,
      latestRun: latestRun
        ? {
            id: latestRun.id || null,
            source: latestRun.source || null,
            sourceRef: latestRun.source_ref || latestRun.sourceRef || null,
            sessionId: runSessionId || null,
            status: latestRun.status || null,
            startedAt: latestRun.started_at || latestRun.startedAt || null,
            finishedAt: latestRun.finished_at || latestRun.finishedAt || null,
          }
        : null,
      runMetadata: {
        agentEnvelope,
        managedObjective,
        workspaceSkillRuntimeEnable,
      },
    },
    runtime: {
      sessionId: runSessionId || null,
      finalSnapshot: runtimeSnapshot,
    },
    evidencePack: summarizeEvidencePack(evidencePack),
    fixture: {
      requestCount: fixtureRequests.length,
      chatCompletionRequestCount: chatRequests.length,
      models: Array.from(
        new Set(
          chatRequests.map((request) => request.body?.model).filter(Boolean),
        ),
      ),
    },
    assertions,
    projectThreadAssertions,
    completionAuditAssertions,
  };
}
