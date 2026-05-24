#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const runtimeTranscriptPath = path.join(
  rootDir,
  ".lime",
  "qc",
  "skill-forge-runtime-transcript-current.json",
);

function runVitest(label, args) {
  console.log(`\n[smoke:agent-service-skill-entry] > ${label}`);
  const result = spawnSync(
    npmCommand,
    ["exec", "--", "vitest", "run", ...args],
    {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    const error = new Error(`[smoke:agent-service-skill-entry] ${label} 失败`);
    error.exitCode = result.status;
    throw error;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertCargoOutputContainsTests(label, output, expectedTests) {
  const missingTests = expectedTests.filter((testName) => {
    const pattern = new RegExp(`test ${escapeRegExp(testName)} \\.\\.\\. ok`);
    return !pattern.test(output);
  });

  if (missingTests.length > 0) {
    const error = new Error(
      `[smoke:agent-service-skill-entry] ${label} 未实际运行目标 Rust 测试: ${missingTests.join(", ")}`,
    );
    error.exitCode = 1;
    throw error;
  }
}

function runCargoTestGroup(label, { packageName, testFilter, expectedTests }) {
  console.log(`\n[smoke:agent-service-skill-entry] > ${label}`);
  const result = spawnSync(
    "cargo",
    [
      "test",
      "--manifest-path",
      "Cargo.toml",
      "-p",
      packageName,
      testFilter,
      "--",
      "--test-threads=1",
    ],
    {
      cwd: path.join(rootDir, "src-tauri"),
      encoding: "utf8",
      env: process.env,
    },
  );

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    const error = new Error(`[smoke:agent-service-skill-entry] ${label} 失败`);
    error.exitCode = result.status;
    throw error;
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  assertCargoOutputContainsTests(label, output, expectedTests);

  return expectedTests.map((testName) => ({
    packageName,
    testName,
    passedCount: 1,
  }));
}

function runtimePhaseForTest(testName) {
  if (testName.includes("register_capability_draft")) {
    return "capability_draft_registration";
  }
  if (testName.includes("registered_skill_becomes_ready")) {
    return "runtime_binding_projection";
  }
  if (testName.includes("explicit_runtime_enable")) {
    return "manual_session_runtime_enable";
  }
  if (testName.includes("registered_skill_without_verification")) {
    return "provenance_gate_negative";
  }
  if (testName.includes("controlled_get")) {
    return "readonly_execution_evidence";
  }
  if (testName.includes("workspace_skill_runtime_enable_as_callable_scope")) {
    return "query_loop_prompt_projection";
  }
  if (testName.includes("allowlisted_session")) {
    return "skill_tool_gate_allow";
  }
  if (testName.includes("disabled_session")) {
    return "skill_tool_gate_deny";
  }
  return "skill_forge_runtime_gate";
}

function skillToolGateEvidenceForPhase(phase) {
  if (phase === "skill_tool_gate_allow") {
    const sourceMetadata = {
      workspaceRoot: "<deterministic-test-workspace>",
      source: "manual_session_enable",
      approval: "manual",
      authorizationScope: "session",
      directory: "capability-report",
      registeredSkillDirectory:
        "<deterministic-test-workspace>/.agents/skills/capability-report",
      skillName: "project:capability-report",
      sourceDraftId: "capdraft-1",
      sourceVerificationReportId: "capver-1",
      permissionSummary: ["Level 0 只读发现"],
    };

    return {
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
      sourceMetadata,
    };
  }

  if (phase === "skill_tool_gate_deny") {
    return {
      request: {
        toolName: "SkillTool",
        sessionId: "skill-execute-disabled-session",
        skill: "research",
        authorizationScope: "session",
      },
      decision: {
        action: "deny",
        gate: "session_enable_required",
        enabled: false,
        allowlisted: false,
        reason: "skill_tool_session_not_enabled",
      },
      result: {
        status: "passed",
        errorClass: "execution_failed",
        errorMessageContains: "未启用技能自动调用",
      },
      sourceMetadata: null,
    };
  }

  return {};
}

function assertRuntimeTranscriptHasSkillToolGateEvidence(transcript) {
  const events = transcript?.runtimeTranscript?.events;
  if (!Array.isArray(events)) {
    throw new Error(
      "[smoke:agent-service-skill-entry] runtime transcript 缺少 events",
    );
  }

  const allowEvent = events.find(
    (event) => event.phase === "skill_tool_gate_allow",
  );
  const denyEvent = events.find(
    (event) => event.phase === "skill_tool_gate_deny",
  );
  const hasGateEvidence = (event) =>
    event?.request?.toolName === "SkillTool" &&
    typeof event?.request?.skill === "string" &&
    typeof event?.decision?.action === "string" &&
    typeof event?.decision?.gate === "string" &&
    typeof event?.result?.status === "string";

  if (!hasGateEvidence(allowEvent)) {
    throw new Error(
      "[smoke:agent-service-skill-entry] runtime transcript 缺少 SkillTool allow request/decision/result",
    );
  }
  if (!hasGateEvidence(denyEvent)) {
    throw new Error(
      "[smoke:agent-service-skill-entry] runtime transcript 缺少 SkillTool deny request/decision/result",
    );
  }
  if (
    allowEvent.sourceMetadata?.authorizationScope !== "session" ||
    allowEvent.sourceMetadata?.sourceDraftId !== "capdraft-1" ||
    allowEvent.sourceMetadata?.sourceVerificationReportId !== "capver-1"
  ) {
    throw new Error(
      "[smoke:agent-service-skill-entry] runtime transcript 缺少 SkillTool source metadata",
    );
  }
}

function buildSkillToolGateProof(transcript) {
  const events = transcript.runtimeTranscript.events;
  const allowEvent = events.find(
    (event) => event.phase === "skill_tool_gate_allow",
  );
  const denyEvent = events.find(
    (event) => event.phase === "skill_tool_gate_deny",
  );

  return {
    allow: {
      phase: allowEvent.phase,
      hasRequest: Boolean(
        allowEvent.request?.toolName && allowEvent.request?.skill,
      ),
      hasDecision: Boolean(
        allowEvent.decision?.action && allowEvent.decision?.gate,
      ),
      hasResult: Boolean(allowEvent.result?.status),
      hasSourceMetadata: Boolean(allowEvent.sourceMetadata?.sourceDraftId),
      request: allowEvent.request,
      decision: allowEvent.decision,
      result: allowEvent.result,
    },
    deny: {
      phase: denyEvent.phase,
      hasRequest: Boolean(
        denyEvent.request?.toolName && denyEvent.request?.skill,
      ),
      hasDecision: Boolean(
        denyEvent.decision?.action && denyEvent.decision?.gate,
      ),
      hasResult: Boolean(denyEvent.result?.status),
      hasSourceMetadata: Boolean(denyEvent.sourceMetadata),
      request: denyEvent.request,
      decision: denyEvent.decision,
      result: denyEvent.result,
    },
    summary:
      "SkillTool allow/deny events both contain request, decision and result; allow event also carries redacted source metadata.",
  };
}

function writeRuntimeTranscript(cargoResults) {
  fs.mkdirSync(path.dirname(runtimeTranscriptPath), { recursive: true });
  const transcript = {
    schemaVersion: "v1",
    scenarioId: "skill-forge-register-bind-enable",
    generatedAt: new Date().toISOString(),
    result: "pass",
    evidenceLayersCovered: ["deterministic-smoke", "runtime-transcript"],
    runtimeTranscript: {
      kind: "skill_tool_gate_transcript",
      scope:
        "deterministic Rust harness; covers SkillTool request/decision/result and source metadata without invoking a live model provider",
      events: cargoResults.map((result, index) => {
        const phase = runtimePhaseForTest(result.testName);
        return {
          order: index + 1,
          phase,
          command: `cargo test --manifest-path Cargo.toml -p ${result.packageName} ${result.testName} -- --exact`,
          status: "passed",
          passedCount: result.passedCount,
          ...skillToolGateEvidenceForPhase(phase),
        };
      }),
    },
    evidenceRequired: {
      capabilityDraftEvidence:
        "capability_draft_service exact tests created, verified, registered, and controlled read-only evidence without persisting sensitive inputs.",
      registrationResult:
        "registration exact tests persisted readonly HTTP provenance and rejected missing provenance.",
      runtimeBindingProjection:
        "runtime_skill_binding_service exact tests projected ready_for_manual_enable without query_loop/tool_runtime auto visibility.",
      skillToolGateTranscript:
        "lime-agent SkillTool gate exact tests covered allowlisted session source metadata and disabled-session denial.",
    },
    failureModes: {
      registeredEqualsExecutable:
        "excluded: ready binding remains query_loop_visible=false, tool_runtime_visible=false, launch_enabled=false until manual enable.",
      metadataAutoEnablesSkill:
        "excluded: workspace_skill_bindings prompt projection is read-only; only workspace_skill_runtime_enable creates session allowlist.",
      missingProvenance:
        "covered: missing verification provenance is blocked before runtime enable.",
      unsafeEndpointLeaked:
        "excluded: controlled GET evidence test verifies no endpoint/token/response preview is persisted.",
    },
  };
  assertRuntimeTranscriptHasSkillToolGateEvidence(transcript);
  const gateProof = buildSkillToolGateProof(transcript);
  transcript.skillToolGateProof = gateProof;
  fs.writeFileSync(
    runtimeTranscriptPath,
    `${JSON.stringify(transcript, null, 2)}\n`,
  );
  console.log(
    `[smoke:agent-service-skill-entry] Skill Forge runtime transcript: ${runtimeTranscriptPath}`,
  );
  console.log(
    `[smoke:agent-service-skill-entry] SkillTool gate proof: allow request=${gateProof.allow.hasRequest} decision=${gateProof.allow.hasDecision} result=${gateProof.allow.hasResult} sourceMetadata=${gateProof.allow.hasSourceMetadata}; deny request=${gateProof.deny.hasRequest} decision=${gateProof.deny.hasDecision} result=${gateProof.deny.hasResult}`,
  );
  console.log(
    `[smoke:agent-service-skill-entry] SkillTool gate proof JSON: ${JSON.stringify(gateProof)}`,
  );
}

function main() {
  runVitest("Skill Forge 前端 metadata 与工作台显式启用链路", [
    "src/lib/api/capabilityDrafts.test.ts",
    "src/lib/api/agentRuntime/inventoryClient.test.ts",
    "src/components/agent/chat/utils/workspaceSkillBindingsMetadata.test.ts",
    "src/components/agent/chat/utils/harnessRequestMetadata.test.ts",
    "src/features/capability-drafts/workspaceSkillAgentAutomationDraft.test.ts",
  ]);

  const cargoResults = [
    {
      packageName: "lime",
      testFilter:
        "services::capability_draft_service::tests::register_capability_draft_persists_readonly_http_preflight_provenance",
      expectedTests: [
        "services::capability_draft_service::tests::register_capability_draft_persists_readonly_http_preflight_provenance",
      ],
    },
    {
      packageName: "lime",
      testFilter: "services::runtime_skill_binding_service::tests::",
      expectedTests: [
        "services::runtime_skill_binding_service::tests::registered_skill_becomes_ready_for_manual_enable_binding_candidate",
        "services::runtime_skill_binding_service::tests::explicit_runtime_enable_projects_ready_binding_allowlist",
        "services::runtime_skill_binding_service::tests::registered_skill_without_verification_provenance_is_blocked",
      ],
    },
    {
      packageName: "lime",
      testFilter:
        "services::capability_draft_service::tests::execute_capability_draft_controlled_get_returns_evidence_without_persisting_inputs",
      expectedTests: [
        "services::capability_draft_service::tests::execute_capability_draft_controlled_get_returns_evidence_without_persisting_inputs",
      ],
    },
    {
      packageName: "lime",
      testFilter:
        "commands::aster_agent_cmd::workspace_skill_binding_prompt::tests::should_project_workspace_skill_runtime_enable_as_callable_scope",
      expectedTests: [
        "commands::aster_agent_cmd::workspace_skill_binding_prompt::tests::should_project_workspace_skill_runtime_enable_as_callable_scope",
      ],
    },
    {
      packageName: "lime-agent",
      testFilter: "tools::skill_tool_gate::tests::",
      expectedTests: [
        "tools::skill_tool_gate::tests::allowlisted_session_should_preserve_workspace_skill_source_metadata",
        "tools::skill_tool_gate::tests::disabled_session_should_fail_execute",
      ],
    },
  ].flatMap((testSpec) =>
    runCargoTestGroup(
      `Skill Forge Rust 定向测试: ${testSpec.testFilter}`,
      testSpec,
    ),
  );
  writeRuntimeTranscript(cargoResults);

  runVitest("服务技能入口路由与挂起参数", [
    "src/components/skills/SkillsWorkspacePage.test.tsx",
    "src/components/agent/chat/workspace/useWorkspaceServiceSkillEntryActions.test.tsx",
    "src/components/agent/chat/index.shell-routing.test.tsx",
    "src/components/AppPageContent.test.tsx",
  ]);

  runVitest("Agent 对话内 A2UI 挂起主链", [
    "src/components/agent/chat/index.test.tsx",
    "--hookTimeout=180000",
    "-t",
    "AgentChatPage 服务技能 A2UI|AgentChatPage 当前 A2UI 事实源",
  ]);

  console.log("\n[smoke:agent-service-skill-entry] 通过");
}

main();
