#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_EVIDENCE_DIR = path.join(
  process.cwd(),
  ".lime",
  "qc",
  "gui-evidence",
  "agent-apps",
);

const DEFAULT_OUTPUT = path.join(
  DEFAULT_EVIDENCE_DIR,
  "content-factory-standalone-v2-evidence-pack.json",
);

const REQUIRED_CAPABILITY_CALLS = [
  "lime.agent.startTask",
  "lime.agent.getTask",
  "lime.models.getRouting",
  "lime.usage.getTokenUsage",
  "lime.usage.getCostSummary",
  "lime.skills.list",
  "lime.ui.openAgentRun",
  "lime.ui.updateAgentRun",
];

function parseArgs(argv) {
  const options = {
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    flowSummary: "",
    shellSummary: "",
    hostSummary: "",
    output: DEFAULT_OUTPUT,
    check: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--evidence-dir" && argv[index + 1]) {
      options.evidenceDir = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--flow-summary" && argv[index + 1]) {
      options.flowSummary = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--shell-summary" && argv[index + 1]) {
      options.shellSummary = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--host-summary" && argv[index + 1]) {
      options.hostSummary = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      options.output = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/agent-app/standalone-evidence-pack.mjs [options]

Options:
  --evidence-dir <dir>       Directory that contains Agent App GUI evidence summaries
  --flow-summary <path>      Standalone run-scenarios summary JSON
  --shell-summary <path>     Optional standalone shell smoke summary JSON
  --host-summary <path>      Optional standalone host actions-none summary JSON
  --output <path>            Evidence pack output JSON
  --check                    Exit non-zero when the pack verdict is not pass
`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileSha256(filePath) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex")}`;
}

function toRepoPath(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}

function latestFile(evidenceDir, predicate) {
  if (!fs.existsSync(evidenceDir)) return "";
  const candidates = fs
    .readdirSync(evidenceDir)
    .filter(predicate)
    .map((name) => path.join(evidenceDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return candidates[0] ?? "";
}

function resolveInputFiles(options) {
  const evidenceDir = path.resolve(options.evidenceDir);
  const flowSummary =
    options.flowSummary ||
    latestFile(
      evidenceDir,
      (name) =>
        name.includes("content-factory-standalone-scenarios") &&
        name.endsWith("-summary.json"),
    );
  const shellSummary =
    options.shellSummary ||
    latestFile(
      evidenceDir,
      (name) =>
        name === "content-factory-standalone-shell-summary.json" ||
        (name.includes("content-factory-standalone-shell") &&
          name.endsWith("-summary.json")),
    );
  const hostSummary =
    options.hostSummary ||
    latestFile(
      evidenceDir,
      (name) =>
        name.includes("content-factory-standalone-host-actions-none") &&
        name.endsWith("-summary.json"),
    );

  assert(flowSummary, "Missing standalone run-scenarios flow summary");
  assert(fs.existsSync(flowSummary), `Flow summary not found: ${flowSummary}`);
  if (shellSummary) {
    assert(fs.existsSync(shellSummary), `Shell summary not found: ${shellSummary}`);
  }
  if (hostSummary) {
    assert(fs.existsSync(hostSummary), `Host summary not found: ${hostSummary}`);
  }
  return { flowSummary, shellSummary, hostSummary };
}

function firstActionResult(flowSummary) {
  const results = Array.isArray(flowSummary.flowResults) ? flowSummary.flowResults : [];
  return (
    results.find((item) => item?.actionName === "run-scenarios") ??
    results[0] ??
    null
  );
}

function statusFor(condition) {
  return condition ? "pass" : "fail";
}

function check(id, requirement, condition, evidence, source) {
  return {
    id,
    requirement,
    status: statusFor(Boolean(condition)),
    evidence,
    source,
  };
}

function allTrue(values) {
  return values.every(Boolean);
}

function requiredSkillsReady(actionResult) {
  const expected = Array.isArray(actionResult?.expectedSkills)
    ? actionResult.expectedSkills
    : [];
  const invoked = Array.isArray(actionResult?.invokedSkillNames)
    ? actionResult.invokedSkillNames
    : [];
  return expected.every((skill) =>
    invoked.some((item) => item === skill || String(item).endsWith(`:${skill}`)),
  );
}

function capabilityTraceSummary(actionResult) {
  const calls = Array.isArray(actionResult?.capabilityCalls)
    ? actionResult.capabilityCalls
    : [];
  const missing = REQUIRED_CAPABILITY_CALLS.filter((required) => !calls.includes(required));
  return {
    required: REQUIRED_CAPABILITY_CALLS,
    observed: calls,
    missing,
    ready: missing.length === 0,
  };
}

function workspacePatchSummary(actionResult) {
  const patch = actionResult?.directRuntimeSnapshot?.workspacePatch ?? null;
  const sceneTable = isObjectRecord(patch?.sceneTable) ? patch.sceneTable : {};
  const imagePrompts = Array.isArray(patch?.imagePrompts) ? patch.imagePrompts : [];
  const rows = Array.isArray(sceneTable.rows) ? sceneTable.rows : [];
  const skillEvidence = Array.isArray(patch?.skillEvidence) ? patch.skillEvidence : [];
  return {
    kind: patch?.kind ?? "",
    artifactKind: patch?.artifactKind ?? "",
    source: patch?.source ?? "",
    projectId: patch?.projectId ?? patch?.project_id ?? "",
    requiresHumanReview: Boolean(patch?.requiresHumanReview),
    runtimeMaterialization: patch?.runtimeMaterialization ?? null,
    sceneTableActualCount: Number(sceneTable.actualCount ?? rows.length ?? 0),
    sceneRowsSampleCount: rows.length,
    imagePromptSampleCount: imagePrompts.length,
    dimensions: Array.isArray(sceneTable.dimensions) ? sceneTable.dimensions : [],
    decisionStages: Array.isArray(sceneTable.decisionStages)
      ? sceneTable.decisionStages
      : [],
    skillEvidence,
    ready:
      patch?.kind === "content_factory.workspace_patch" &&
      Number(sceneTable.actualCount ?? 0) >= 120 &&
      skillEvidence.length >= 2,
  };
}

function compactRuntimeTask(actionResult) {
  const direct = actionResult?.directRuntimeSnapshot ?? {};
  return {
    taskId: actionResult?.taskId ?? "",
    sessionId: actionResult?.sessionId ?? "",
    taskStatus: direct.taskStatus ?? "",
    runtimeSummaryTaskId: direct.runtimeSummaryTaskId ?? "",
    taskMismatch: Boolean(direct.taskMismatch),
    profileStatus: direct.profileStatus ?? "",
    status: direct.status ?? "",
    taskEventCount: Number(direct.taskEventCount ?? 0),
    artifactCount: Number(direct.artifactCount ?? 0),
    persistedArtifactCount: Number(direct.persistedArtifactCount ?? 0),
    taskEventArtifactCount: Number(direct.taskEventArtifactCount ?? 0),
    toolCallCount: Number(direct.toolCallCount ?? 0),
    selectedProvider: direct.selectedProvider ?? "",
    selectedModel: direct.selectedModel ?? "",
    costState: direct.costState ?? null,
    hasWorkspacePatch: Boolean(direct.hasWorkspacePatch),
    hasUsage: Boolean(direct.hasUsage),
    hasEstimatedUsage: Boolean(direct.hasEstimatedUsage),
    estimatedUsageTokens: Number(direct.estimatedUsageTokens ?? 0),
    hasCost: Boolean(direct.hasCost),
    evidenceReady: Boolean(direct.evidenceReady),
    terminalReady: Boolean(direct.terminalReady),
  };
}

function sourceRef(filePath) {
  if (!filePath) return null;
  return {
    path: toRepoPath(filePath),
    sha256: fileSha256(filePath),
  };
}

function buildEvidencePack({ flowSummaryPath, shellSummaryPath, hostSummaryPath }) {
  const flow = readJson(flowSummaryPath);
  const shell = shellSummaryPath ? readJson(shellSummaryPath) : null;
  const host = hostSummaryPath ? readJson(hostSummaryPath) : null;
  const action = firstActionResult(flow);
  assert(action, "Flow summary does not contain any action result");

  const standalone = flow.standaloneLaunch ?? {};
  const descriptor = standalone.descriptor ?? {};
  const runtimeTask = compactRuntimeTask(action);
  const workspacePatch = workspacePatchSummary(action);
  const capabilityTrace = capabilityTraceSummary(action);
  const pageMaterialization = action.pageMaterialization ?? {};
  const assertions = flow.assertions ?? {};
  const shellAssertions = shell?.assertions ?? {};
  const hostAssertions = host?.assertions ?? {};
  const sourceFlow = toRepoPath(flowSummaryPath);
  const sourceShell = shellSummaryPath ? toRepoPath(shellSummaryPath) : "";
  const sourceHost = hostSummaryPath ? toRepoPath(hostSummaryPath) : "";

  const checklist = [
    check(
      "AA-V2-P4-01",
      "standalone run-scenarios summary exists and uses standalone-shell launch mode",
      flow.launchMode === "standalone-shell" && flow.actions?.includes("run-scenarios"),
      {
        launchMode: flow.launchMode,
        actions: flow.actions ?? [],
        generatedAt: flow.generatedAt,
      },
      sourceFlow,
    ),
    check(
      "AA-V2-P4-02",
      "Content Factory is launched as an independent standalone Agent App identity",
      standalone.appId === "content-factory-app" &&
        standalone.installMode === "standalone" &&
        descriptor.installMode === "standalone" &&
        descriptor.shellKind === "app_shell",
      {
        appId: standalone.appId,
        installMode: standalone.installMode,
        descriptorInstallMode: descriptor.installMode,
        shellKind: descriptor.shellKind,
      },
      sourceFlow,
    ),
    check(
      "AA-V2-P4-03",
      "package and manifest identity hashes are recorded in the shell descriptor",
      Boolean(descriptor.packageHash && descriptor.manifestHash),
      {
        packageHash: descriptor.packageHash ?? "",
        manifestHash: descriptor.manifestHash ?? "",
      },
      sourceFlow,
    ),
    check(
      "AA-V2-P4-04",
      "Lime App Shell launch reuses current UI runtime and returns an independent shell window",
      standalone.result?.status === "launched" &&
        standalone.result?.devShell === true &&
        Boolean(standalone.result?.shellWindow?.label && standalone.result?.shellWindow?.url),
      {
        status: standalone.result?.status ?? "",
        devShell: standalone.result?.devShell ?? false,
        shellWindow: standalone.result?.shellWindow ?? null,
      },
      sourceFlow,
    ),
    check(
      "AA-V2-P4-05",
      "standalone runtime entry is reachable as an HTML shell",
      standalone.runtimeEntryProbe?.ok === true &&
        standalone.runtimeEntryProbe?.hasHtmlShell === true,
      standalone.runtimeEntryProbe ?? null,
      sourceFlow,
    ),
    check(
      "AA-V2-P4-06",
      "standalone isolation policy stays strict",
      descriptor.isolation?.packageMount === "read-only" &&
        descriptor.isolation?.secrets === "refs-only" &&
        descriptor.isolation?.sideEffects === "runtime-broker" &&
        descriptor.isolation?.evidence === "runtime-provenance" &&
        assertions.strictStandaloneIsolation === true,
      descriptor.isolation ?? null,
      sourceFlow,
    ),
    check(
      "AA-V2-P4-07",
      "browser-accessible business host is ready without host fallback",
      assertions.standaloneBusinessHostReady === true &&
        assertions.noHostFallback === true &&
        standalone.businessHost?.kind === "agent-app-runtime-page",
      {
        standaloneBusinessHostReady: assertions.standaloneBusinessHostReady,
        noHostFallback: assertions.noHostFallback,
        businessHost: standalone.businessHost ?? null,
      },
      sourceFlow,
    ),
    check(
      "AA-V2-P4-08",
      "AgentRuntime task is tied to the requested task id and reaches terminal readiness",
      runtimeTask.taskId &&
        runtimeTask.sessionId &&
        runtimeTask.taskMismatch === false &&
        runtimeTask.runtimeSummaryTaskId === runtimeTask.taskId &&
        runtimeTask.taskStatus === "completed" &&
        runtimeTask.terminalReady === true,
      runtimeTask,
      sourceFlow,
    ),
    check(
      "AA-V2-P4-09",
      "required skills are invoked through the Runtime skill/tool path",
      requiredSkillsReady(action),
      {
        expectedSkills: action.expectedSkills ?? [],
        invokedSkillNames: action.invokedSkillNames ?? [],
        skillEvidence: workspacePatch.skillEvidence,
      },
      sourceFlow,
    ),
    check(
      "AA-V2-P4-10",
      "model routing, usage evidence and cost evidence are available",
      action.completion?.modelReady === true &&
        action.completion?.usageReady === true &&
        action.completion?.costReady === true &&
        runtimeTask.selectedModel &&
        runtimeTask.selectedProvider &&
        runtimeTask.hasCost === true,
      {
        completion: action.completion ?? null,
        selectedProvider: runtimeTask.selectedProvider,
        selectedModel: runtimeTask.selectedModel,
        costState: runtimeTask.costState,
      },
      sourceFlow,
    ),
    check(
      "AA-V2-P4-11",
      "Capability SDK trace covers agent, model, usage, skills and UI runtime calls",
      capabilityTrace.ready,
      capabilityTrace,
      sourceFlow,
    ),
    check(
      "AA-V2-P4-12",
      "artifact/evidence/workspace patch facts are present in Runtime task snapshot",
      runtimeTask.artifactCount > 0 &&
        runtimeTask.taskEventArtifactCount > 0 &&
        runtimeTask.evidenceReady === true &&
        runtimeTask.hasWorkspacePatch === true,
      {
        artifactCount: runtimeTask.artifactCount,
        persistedArtifactCount: runtimeTask.persistedArtifactCount,
        taskEventArtifactCount: runtimeTask.taskEventArtifactCount,
        evidenceReady: runtimeTask.evidenceReady,
        hasWorkspacePatch: runtimeTask.hasWorkspacePatch,
      },
      sourceFlow,
    ),
    check(
      "AA-V2-P4-13",
      "Content Factory scenario table materializes at least 120 scenarios",
      workspacePatch.ready,
      workspacePatch,
      sourceFlow,
    ),
    check(
      "AA-V2-P4-14",
      "Content Factory page materializes the Runtime workspace patch",
      pageMaterialization.ready === true,
      {
        ready: pageMaterialization.ready ?? false,
        source: pageMaterialization.source ?? "",
        waitedMs: pageMaterialization.waitedMs ?? null,
        frameTextSources: Array.isArray(pageMaterialization.frameTextSources)
          ? pageMaterialization.frameTextSources.map((item) => ({
              url: item.url,
              name: item.name,
              textPreview: item.textPreview,
            }))
          : [],
      },
      sourceFlow,
    ),
    check(
      "AA-V2-P4-15",
      "final standalone flow has no console errors",
      assertions.noConsoleErrors === true && Number(assertions.consoleErrorCount ?? 0) === 0,
      {
        noConsoleErrors: assertions.noConsoleErrors,
        consoleErrorCount: assertions.consoleErrorCount ?? 0,
        consoleErrors: flow.consoleErrors ?? [],
      },
      sourceFlow,
    ),
  ];

  const failed = checklist.filter((item) => item.status !== "pass");
  const status = failed.length === 0 ? "pass" : "fail";

  return {
    schemaVersion: "lime.agent-app.standalone-evidence-pack/v1",
    generatedAt: new Date().toISOString(),
    subject: {
      roadmap: "internal/roadmap/agentapp/v2",
      scope: "V2-P4 Content Factory standalone dogfood",
      appId: standalone.appId ?? "content-factory-app",
      launchMode: flow.launchMode ?? "",
      installMode: descriptor.installMode ?? standalone.installMode ?? "",
      shellKind: descriptor.shellKind ?? standalone.result?.shellKind ?? "",
      contentFactoryDir:
        standalone.result?.packageMount?.path ??
        shell?.contentFactoryDir ??
        "",
      packageHash: descriptor.packageHash ?? standalone.result?.packageMount?.packageHash ?? "",
      manifestHash: descriptor.manifestHash ?? standalone.result?.packageMount?.manifestHash ?? "",
    },
    sources: {
      flowSummary: sourceRef(flowSummaryPath),
      shellSummary: sourceRef(shellSummaryPath),
      hostSummary: sourceRef(hostSummaryPath),
      screenshot: flow.screenshot
        ? {
            path: path.isAbsolute(String(flow.screenshot))
              ? toRepoPath(String(flow.screenshot))
              : String(flow.screenshot),
          }
        : null,
      sourceNotes: {
        finalFlowIsAuthoritativeForConsoleErrors: true,
        standaloneShellSmokeNoConsoleErrors: shellAssertions.noConsoleErrors ?? null,
        hostActionsNoneNoConsoleErrors: hostAssertions.noConsoleErrors ?? null,
      },
    },
    verdict: {
      status,
      passed: checklist.length - failed.length,
      total: checklist.length,
      blockers: failed.map((item) => ({
        id: item.id,
        requirement: item.requirement,
      })),
      releaseReadiness: "not_release_ready",
      releaseReadinessReason:
        "This pack proves the V2-P4 standalone dogfood path. Productized shell, signing, installer and updater remain V2-P5.",
    },
    standalone: {
      runtimeProfileSummary: standalone.runtimeProfileSummary ?? null,
      descriptor,
      launchResult: standalone.result ?? null,
      runtimeEntryProbe: standalone.runtimeEntryProbe ?? null,
      businessHost: standalone.businessHost ?? null,
    },
    runtimeTask,
    capabilityTrace,
    artifactsAndEvidence: {
      artifactCount: runtimeTask.artifactCount,
      persistedArtifactCount: runtimeTask.persistedArtifactCount,
      taskEventArtifactCount: runtimeTask.taskEventArtifactCount,
      evidenceReady: runtimeTask.evidenceReady,
      workspacePatch,
    },
    pageMaterialization: {
      ready: pageMaterialization.ready ?? false,
      source: pageMaterialization.source ?? "",
      waitedMs: pageMaterialization.waitedMs ?? null,
      frameTextSources: Array.isArray(pageMaterialization.frameTextSources)
        ? pageMaterialization.frameTextSources
        : [],
    },
    checklist,
    knownGaps: [
      {
        id: "productized_shell_not_covered",
        scope: "V2-P5",
        status: "open",
        detail:
          "Brand menu, deep link, tray/close policy and production App Shell polish are not covered by this V2-P4 pack.",
      },
      {
        id: "installer_signing_not_covered",
        scope: "V2-P5",
        status: "open",
        detail:
          "macOS/Windows installer, signing, notarization and updater are still release hardening work.",
      },
      {
        id: "uninstall_delete_data_not_enabled",
        scope: "V2-P5",
        status: "open",
        detail:
          "Current uninstall path remains rehearsal/keep-data first; destructive delete-data is intentionally not enabled.",
      },
    ],
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputFiles = resolveInputFiles(options);
  const pack = buildEvidencePack({
    flowSummaryPath: inputFiles.flowSummary,
    shellSummaryPath: inputFiles.shellSummary,
    hostSummaryPath: inputFiles.hostSummary,
  });

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(pack, null, 2)}\n`);
  console.log(`[agent-apps-standalone-evidence-pack] output=${options.output}`);
  console.log(
    `[agent-apps-standalone-evidence-pack] verdict=${pack.verdict.status} passed=${pack.verdict.passed}/${pack.verdict.total}`,
  );

  if (options.check && pack.verdict.status !== "pass") {
    process.exit(1);
  }
}

main();
