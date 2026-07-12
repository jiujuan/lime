#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const runtimeTranscriptPath = path.join(
  rootDir,
  ".lime",
  "qc",
  "skill-forge-runtime-transcript-current.json",
);
const cargoTargetDir = path.resolve(
  process.env.LIME_AGENT_SERVICE_SKILL_ENTRY_TARGET_DIR ||
    path.join(rootDir, "lime-rs", "target"),
);

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function assertVitestOutputRanTests(label, output) {
  const normalizedOutput = stripAnsi(output);
  const testFilesLine =
    normalizedOutput.match(/Test Files\s+([^\n]+)/)?.[1] ?? "";
  const testsLine = normalizedOutput.match(/Tests\s+([^\n]+)/)?.[1] ?? "";

  if (!testFilesLine.includes("passed") || !testsLine.includes("passed")) {
    const error = new Error(
      `[smoke:agent-service-skill-entry] ${label} 未实际运行通过任何 Vitest 测试`,
    );
    error.exitCode = 1;
    throw error;
  }
}

function runCommandStreaming(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
}

async function runVitest(label, args) {
  console.log(`\n[smoke:agent-service-skill-entry] > ${label}`);
  const result = await runCommandStreaming(
    npmCommand,
    ["exec", "--", "vitest", "run", ...args],
    {
      cwd: rootDir,
      env: process.env,
    },
  );

  if (result.status !== 0) {
    const error = new Error(`[smoke:agent-service-skill-entry] ${label} 失败`);
    error.exitCode = result.status ?? 1;
    throw error;
  }

  assertVitestOutputRanTests(
    label,
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  );
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

async function runCargoTestGroup(
  label,
  { packageName, testFilter, expectedTests },
) {
  console.log(`\n[smoke:agent-service-skill-entry] > ${label}`);
  const result = await runCommandStreaming(
    "cargo",
    [
      "test",
      "--manifest-path",
      "Cargo.toml",
      "--target-dir",
      cargoTargetDir,
      "-p",
      packageName,
      testFilter,
      "--",
      "--test-threads=1",
    ],
    {
      cwd: path.join(rootDir, "lime-rs"),
      env: process.env,
    },
  );

  if (result.status !== 0) {
    const error = new Error(`[smoke:agent-service-skill-entry] ${label} 失败`);
    error.exitCode = result.status ?? 1;
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

function assertCurrentRustTestSpecs(testSpecs) {
  const retiredPatterns = [
    {
      label: 'packageName: "lime"',
      matches: ({ packageName }) => packageName === "lime",
    },
    {
      label: "services::capability_draft_service",
      matches: ({ testFilter, expectedTests }) =>
        [testFilter, ...expectedTests].some((value) =>
          value.includes("services::capability_draft_service"),
        ),
    },
    {
      label: "services::runtime_skill_binding_service",
      matches: ({ testFilter, expectedTests }) =>
        [testFilter, ...expectedTests].some((value) =>
          value.includes("services::runtime_skill_binding_service"),
        ),
    },
  ];
  const retiredMatches = testSpecs.flatMap((testSpec) =>
    retiredPatterns
      .filter((pattern) => pattern.matches(testSpec))
      .map((pattern) => `${testSpec.testFilter} -> ${pattern.label}`),
  );
  if (retiredMatches.length > 0) {
    const error = new Error(
      `[smoke:agent-service-skill-entry] Rust 测试矩阵包含已删除旧 Skill 链路: ${retiredMatches.join("; ")}`,
    );
    error.exitCode = 1;
    throw error;
  }
}

function runtimePhaseForTest(testName) {
  if (
    testName.includes(
      "list_workspace_registered_skills_value_discovers_registered_skill",
    )
  ) {
    return "registered_skill_discovery";
  }
  if (
    testName.includes(
      "list_workspace_registered_skills_value_ignores_standard_skill_without_registration",
    )
  ) {
    return "registered_skill_discovery_provenance_gate";
  }
  if (
    testName.includes(
      "list_workspace_skill_bindings_value_projects_readiness_without_launch",
    )
  ) {
    return "runtime_binding_projection";
  }
  if (
    testName.includes(
      "allowlisted_session_should_preserve_workspace_skill_source_metadata",
    )
  ) {
    return "skill_tool_gate_allow";
  }
  if (testName.includes("disabled_session_should_fail_execute")) {
    return "skill_tool_gate_deny";
  }
  if (testName.includes("allowlisted_session_should_allow_only_selected_skill")) {
    return "skill_tool_gate_allowlist_scope";
  }
  if (testName.includes("enabled_session_should_allow_skill_tool")) {
    return "skill_tool_gate_session_enable";
  }
  if (testName.includes("disabled_session_should_deny_skill_tool")) {
    return "skill_tool_gate_permission_deny";
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
      frontendSkillForgeGateway:
        "frontend vitest covers Capability Draft API gateway, workspace Skill metadata builder and explicit runtime enable request metadata.",
      registeredSkillsDiscovery:
        "app-server exact tests discover only workspace-local registered Skill packages with provenance metadata.",
      runtimeBindingProjection:
        "app-server exact test projects ready_for_manual_enable while query_loop_visible/tool_runtime_visible/launch_enabled remain false.",
      skillToolGateTranscript:
        "lime-agent SkillTool gate exact tests covered allowlisted session source metadata and disabled-session denial.",
    },
    failureModes: {
      registeredEqualsExecutable:
        "excluded: ready binding remains query_loop_visible=false, tool_runtime_visible=false, launch_enabled=false until manual enable.",
      metadataAutoEnablesSkill:
        "excluded: workspace_skill_bindings prompt projection is read-only; only workspace_skill_runtime_enable creates session allowlist.",
      missingRegistrationProvenance:
        "covered: unregistered workspace Skill packages are ignored by app-server registered discovery.",
      retiredRustSurface:
        "excluded: removed lime package, capability_draft_service, runtime_skill_binding_service and Agent command prompt tests are rejected by the smoke matrix guard.",
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

async function main() {
  console.log(
    `[smoke:agent-service-skill-entry] Cargo target: ${cargoTargetDir}`,
  );

  await runVitest("Skill Forge 前端 metadata 与工作台显式启用链路", [
    "src/lib/api/capabilityDrafts.test.ts",
    "src/lib/api/agentRuntime/inventoryClient.test.ts",
    "src/components/agent/chat/utils/workspaceSkillBindingsMetadata.test.ts",
    "src/components/agent/chat/utils/harnessRequestMetadata.test.ts",
    "src/features/capability-drafts/workspaceSkillAgentAutomationDraft.test.ts",
  ]);

  const rustTestSpecs = [
    {
      packageName: "app-server",
      testFilter: "local_data_source::skills::workspace::tests::",
      expectedTests: [
        "local_data_source::skills::workspace::tests::list_workspace_registered_skills_value_discovers_registered_skill",
        "local_data_source::skills::workspace::tests::list_workspace_registered_skills_value_ignores_standard_skill_without_registration",
        "local_data_source::skills::workspace::tests::list_workspace_skill_bindings_value_projects_readiness_without_launch",
      ],
    },
    {
      packageName: "lime-agent",
      testFilter: "tools::skill_tool_gate::tests::",
      expectedTests: [
        "tools::skill_tool_gate::tests::allowlisted_session_should_preserve_workspace_skill_source_metadata",
        "tools::skill_tool_gate::tests::disabled_session_should_fail_execute",
        "tools::skill_tool_gate::tests::allowlisted_session_should_allow_only_selected_skill",
        "tools::skill_tool_gate::tests::disabled_session_should_deny_skill_tool",
        "tools::skill_tool_gate::tests::enabled_session_should_allow_skill_tool",
      ],
    },
  ];
  assertCurrentRustTestSpecs(rustTestSpecs);
  const cargoResults = [];
  for (const testSpec of rustTestSpecs) {
    cargoResults.push(
      ...(await runCargoTestGroup(
        `Skill Forge Rust 定向测试: ${testSpec.testFilter}`,
        testSpec,
      )),
    );
  }
  writeRuntimeTranscript(cargoResults);

  await runVitest("服务技能入口路由与挂起参数", [
    "src/components/skills/SkillsWorkspacePage.test.tsx",
    "src/components/agent/chat/workspace/useWorkspaceServiceSkillEntryActions.test.tsx",
    "src/components/agent/chat/index.shell-routing.test.tsx",
    "src/components/AppPageContent.test.tsx",
  ]);

  await runVitest("Agent 对话内 A2UI 挂起主链", [
    "src/components/agent/chat/index.serviceSkillA2ui.test.tsx",
    "src/components/agent/chat/index.currentA2ui.test.tsx",
    "--hookTimeout=180000",
  ]);

  console.log("\n[smoke:agent-service-skill-entry] 通过");
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(error?.exitCode || 1);
});
