#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createAgentQcGuiFlowReport } from "./lib/agent-qc-gui-flow-core.mjs";
import { buildQCLoopJobPayload, validateQCLoopJobPayload } from "./lib/agent-qc-qcloop-job-core.mjs";
import { createAgentQcReport } from "./lib/agent-qc-report-core.mjs";
import {
  buildAgentQcCompletionAudit,
  renderAgentQcCompletionAuditMarkdown,
} from "./lib/agent-qc-completion-audit-core.mjs";

function parseArgs(argv) {
  const result = {
    check: false,
    format: "markdown",
    help: false,
    outputPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format" && argv[index + 1]) {
      result.format = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      result.outputPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--check") {
      result.check = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }
  return result;
}

function printHelp() {
  console.log(`
Lime Agent QC Completion Audit

用法:
  npm run agent-qc:audit
  npm run agent-qc:audit -- --format json
  node scripts/agent-qc-completion-audit.mjs --check

选项:
  --format FMT   markdown | json
  --output PATH  写入文件；默认 stdout
  --check        整体目标未完成时非 0 退出
  -h, --help     显示帮助
`);
}

function exists(filePath) {
  return fs.existsSync(path.resolve(process.cwd(), filePath));
}

function readText(filePath) {
  return fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readOptionalEvidencePack(filePath) {
  if (!exists(filePath)) {
    return { exists: false, status: "", scenarioCount: 0, scenarioIds: [] };
  }
  try {
    const pack = readJson(filePath);
    return summarizeEvidencePack(pack, { exists: true });
  } catch {
    return { exists: true, status: "invalid-json", scenarioCount: 0, scenarioIds: [] };
  }
}

function readOptionalJson(filePath, fallback) {
  if (!exists(filePath)) {
    return fallback;
  }
  try {
    return readJson(filePath);
  } catch {
    return { ...fallback, status: "invalid-json" };
  }
}

function summarizeEvidencePack(pack, overrides = {}) {
  return {
    ...overrides,
    status: pack?.verdict?.status || "",
    scenarioCount: Array.isArray(pack?.scenarioResults)
      ? pack.scenarioResults.length
      : 0,
    scenarioIds: Array.isArray(pack?.scenarioResults)
      ? pack.scenarioResults
          .map((result) => String(result?.scenarioId || "").trim())
          .filter(Boolean)
      : [],
  };
}

function readEvidenceSidecars(dirPath) {
  const resolvedDirPath = path.resolve(process.cwd(), dirPath);
  if (!fs.existsSync(resolvedDirPath)) {
    return [];
  }
  return fs
    .readdirSync(resolvedDirPath)
    .filter((fileName) => /^agent-qc-evidence\..+\.json$/.test(fileName))
    .sort()
    .map((fileName) => {
      const relativePath = path.posix.join(dirPath, fileName);
      try {
        const pack = readJson(relativePath);
        return summarizeEvidencePack(pack, { path: relativePath });
      } catch {
        return { path: relativePath, status: "invalid-json", scenarioCount: 0, scenarioIds: [] };
      }
    });
}

function readQcloopStatusSidecars(dirPath) {
  const resolvedDirPath = path.resolve(process.cwd(), dirPath);
  if (!fs.existsSync(resolvedDirPath)) {
    return [];
  }
  return fs
    .readdirSync(resolvedDirPath)
    .filter((fileName) => /^qcloop-status\..+\.json$/.test(fileName))
    .sort()
    .map((fileName) => {
      const relativePath = path.posix.join(dirPath, fileName);
      try {
        const status = readJson(relativePath);
        return {
          path: relativePath,
          verdictStatus: status?.verdict?.status || "",
          verdictSummary: status?.verdict?.summary || "",
          counts: status?.counts || null,
        };
      } catch {
        return { path: relativePath, verdictStatus: "invalid-json", verdictSummary: "", counts: null };
      }
    });
}

function loadFacts() {
  const scenarioManifest = readJson("docs/test/agent-qc-scenarios.manifest.json");
  const guiFlowManifest = readJson("docs/test/agent-qc-gui-flows.manifest.json");
  const evidenceSchema = readJson("docs/test/agent-qc-evidence.schema.json");
  const packageJson = readJson("package.json");
  const scenarioReport = createAgentQcReport({ manifest: scenarioManifest, packageJson, evidenceSchema });
  scenarioReport.p0ScenarioIds = Array.isArray(scenarioManifest?.scenarios)
    ? scenarioManifest.scenarios
        .filter((scenario) => String(scenario?.risk || "").toUpperCase() === "P0")
        .map((scenario) => String(scenario?.id || "").trim())
        .filter(Boolean)
    : [];
  const guiFlowReport = createAgentQcGuiFlowReport({ flowManifest: guiFlowManifest, scenarioManifest });
  const qcloopPayload = buildQCLoopJobPayload(scenarioManifest, { risks: ["P0"], generatedAt: "2026-05-10T00:00:00.000Z" });
  const qcloopPayloadValidation = validateQCLoopJobPayload(qcloopPayload);
  const evidenceCore = exists("scripts/lib/agent-qc-evidence-core.mjs")
    ? readText("scripts/lib/agent-qc-evidence-core.mjs")
    : "";
  const releaseSummaryCore = exists("scripts/lib/agent-qc-release-summary-core.mjs")
    ? readText("scripts/lib/agent-qc-release-summary-core.mjs")
    : "";
  const guiOwnerCore = exists("scripts/lib/agent-qc-gui-owner-core.mjs")
    ? readText("scripts/lib/agent-qc-gui-owner-core.mjs")
    : "";
  const staleOwnerInterventionDoc = exists("docs/tests/lime-agent-qc-stale-owner-intervention.md")
    ? readText("docs/tests/lime-agent-qc-stale-owner-intervention.md")
    : "";
  const nightly = exists(".github/workflows/harness-nightly.yml") ? readText(".github/workflows/harness-nightly.yml") : "";
  const release = exists(".github/workflows/release.yml") ? readText(".github/workflows/release.yml") : "";

  return {
    files: {
      agentOpsQc: exists("docs/tests/agent-ops-qc.md"),
      p0Scenarios: exists("docs/tests/agent-qc-p0-scenarios.md"),
      limeRolloutPlan: exists("docs/tests/lime-agent-qc-rollout-plan.md"),
      testsReadme: exists("docs/tests/README.md"),
      evidenceSchema: exists("docs/test/agent-qc-evidence.schema.json"),
      qcloopJobScript: exists("scripts/agent-qc-qcloop-job.mjs"),
      guiOwnerCheckScript: exists("scripts/agent-qc-gui-owner-check.mjs"),
      qcloopStatusScript: exists("scripts/agent-qc-qcloop-status.mjs"),
      qcloopPreflightScript: exists("scripts/agent-qc-qcloop-preflight.mjs"),
      qcloopOperationsDoc: exists("docs/tests/lime-agent-qc-qcloop-operations.md"),
      evidenceContractDoc: exists("docs/tests/lime-agent-qc-evidence-contract.md"),
      staleOwnerInterventionDoc: exists("docs/tests/lime-agent-qc-stale-owner-intervention.md"),
      exportEvidenceScript: exists("scripts/agent-qc-export-evidence.mjs"),
      releaseSummaryScript: exists("scripts/agent-qc-release-summary.mjs"),
      realGuiEvidence: exists(".lime/qc/gui-evidence"),
    },
    realEvidencePack: readOptionalEvidencePack(".lime/qc/agent-qc-evidence.json"),
    localVerify: readOptionalJson(".lime/qc/verify-local-current.json", {
      exists: false,
      status: "",
      failedStage: "",
      error: "",
    }),
    guiSmoke: readOptionalJson(".lime/qc/verify-gui-smoke-current.json", {
      exists: false,
      status: "",
      failedStage: "",
      error: "",
    }),
    realEvidenceSidecars: readEvidenceSidecars(".lime/qc"),
    qcloopStatusSidecars: readQcloopStatusSidecars(".lime/qc"),
    scenarioReport,
    guiFlowReport,
    qcloopPayload: {
      valid: qcloopPayloadValidation.valid,
      itemCount: qcloopPayload.items.length,
      verifierHasWorkerOutput:
        qcloopPayload.verifier_prompt_template.includes("{{stdout}}") ||
        qcloopPayload.verifier_prompt_template.includes("{{output}}"),
      verifierHasAttemptStatus: qcloopPayload.verifier_prompt_template.includes(
        "{{attempt_status}}",
      ),
      verifierHasExitCode: qcloopPayload.verifier_prompt_template.includes("{{exit_code}}"),
      workerPromptHasPreflight:
        qcloopPayload.prompt_template.includes("agent-qc:qcloop-preflight") &&
        qcloopPayload.prompt_template.includes("--require-devbridge"),
      workerPromptHasStructuredEvidence:
        qcloopPayload.prompt_template.includes("QCLOOP_WORKER_RESULT=PASS|FAIL|BLOCKED") &&
        qcloopPayload.prompt_template.includes("QCLOOP_EVIDENCE_SUMMARY_JSON=<json>"),
      verifierRequiresStructuredEvidence:
        qcloopPayload.verifier_prompt_template.includes("QCLOOP_EVIDENCE_SUMMARY_JSON"),
      verifierRequiresStrictJson:
        qcloopPayload.verifier_prompt_template.includes('{"pass": true|false') &&
        qcloopPayload.verifier_prompt_template.includes("不要 Markdown"),
    },
    structuredEvidence: {
      exporterParsesSummary:
        evidenceCore.includes("collectQCLoopEvidenceSummaries") &&
        evidenceCore.includes("qcloop:evidence_summary_missing") &&
        evidenceCore.includes("qcloop:evidence_summary_invalid_json"),
      releaseSummaryRejectsWeakRefs:
        releaseSummaryCore.includes("weakEvidenceScenarioIds") &&
        releaseSummaryCore.includes("hasStructuredEvidenceRef") &&
        releaseSummaryCore.includes("缺少结构化 evidenceRefs"),
    },
    staleOwnerIntervention: {
      guiOwnerReportHasDecisionPacket:
        guiOwnerCore.includes("ownerIntervention") &&
        guiOwnerCore.includes("requiredConfirmationText") &&
        guiOwnerCore.includes("prohibitedUntilConfirmed"),
      guiOwnerReportHasWatchHistory:
        guiOwnerCore.includes("createAgentQcGuiOwnerWatchEntry") &&
        exists("scripts/agent-qc-gui-owner-check.mjs") &&
        readText("scripts/agent-qc-gui-owner-check.mjs").includes("--watch-history-output"),
      docMentionsDecisionPacket:
        staleOwnerInterventionDoc.includes("ownerIntervention") &&
        staleOwnerInterventionDoc.includes("stale-owner-intervention-request.json"),
      docMentionsWatchHistory:
        staleOwnerInterventionDoc.includes("watch-history-output") ||
        staleOwnerInterventionDoc.includes("stale-owner-watch-history.jsonl"),
    },
    nightly: {
      hasAgentQcReport: nightly.includes("agent-qc-report"),
      hasGuiFlowReport: nightly.includes("agent-qc-gui-flow-report"),
      hasReleasePreview: nightly.includes("release-agent-qc-preview"),
    },
    release: {
      hasHardGate:
        release.includes("agent-qc-release-summary") &&
        release.includes("--check") &&
        !release.includes("--allow-missing-evidence"),
      requiresP0ScenarioCoverage:
        release.includes("--require-scenario-manifest") &&
        release.includes("docs/test/agent-qc-scenarios.manifest.json") &&
        release.includes("--require-risk") &&
        release.includes("P0"),
    },
  };
}

function writeOutput(outputPath, content) {
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, content, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const audit = buildAgentQcCompletionAudit(loadFacts());
  const content =
    options.format === "json"
      ? `${JSON.stringify(audit, null, 2)}\n`
      : renderAgentQcCompletionAuditMarkdown(audit);
  writeOutput(options.outputPath, content);
  if (options.check && audit.status !== "complete") {
    process.exit(1);
  }
}

main();
