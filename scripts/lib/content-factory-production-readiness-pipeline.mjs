import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildContentFactoryProductionEvidenceBundle,
  CONTENT_FACTORY_PRODUCTION_EVIDENCE_BUNDLE_FILE_NAME,
} from "./content-factory-production-evidence-bundle.mjs";
import {
  buildContentFactoryProductionReadinessReport,
  writeContentFactoryProductionReadinessReport,
} from "./content-factory-production-readiness-report.mjs";
import { buildContentFactoryProductionReadinessBlockerPlan } from "./content-factory-production-readiness-plan.mjs";
import { buildOperatorReadiness } from "./content-factory-production-operator-readiness.mjs";
import {
  buildContentFactoryProductionReleaseEvidencePlan,
  CONTENT_FACTORY_PRODUCTION_RELEASE_EVIDENCE_FILE_NAME,
  productionReleaseEvidenceMissingRequirementBlockers,
} from "./content-factory-production-release-evidence.mjs";
import {
  buildContentFactoryProductionSigningProofPlan,
  completeContentFactoryProductionSigningProofPlan,
} from "./content-factory-production-signing-proof.mjs";
import { CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME } from "./plugin-content-factory-signed-release-gate-constants.mjs";

export const CONTENT_FACTORY_PRODUCTION_READINESS_PIPELINE_FILE_NAME =
  "content-factory-production-readiness-pipeline.json";

export const CONTENT_FACTORY_PRODUCTION_PIPELINE_PREFLIGHT_FILE_NAME =
  "content-factory-production-preflight.json";

export const CONTENT_FACTORY_PRODUCTION_PIPELINE_STUDIO_DRY_RUN_FILE_NAME =
  "content-factory-production-studio-dry-run.json";

export const CONTENT_FACTORY_PRODUCTION_PIPELINE_SIGNING_PROOF_FILE_NAME =
  "content-factory-production-signing-proof.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

function defaultRunner(command, args, options) {
  return spawnSync(command, args, {
    ...options,
    encoding: "utf8",
  });
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function existingPath(filePath) {
  return filePath && fs.existsSync(filePath) ? filePath : "";
}

function normalizeCommandResult(result) {
  return {
    error: result?.error
      ? result.error instanceof Error
        ? result.error.message
        : String(result.error)
      : null,
    exitCode: typeof result?.status === "number" ? result.status : null,
    signal: result?.signal || null,
    stderrBytes: Buffer.byteLength(String(result?.stderr || ""), "utf8"),
    stdoutBytes: Buffer.byteLength(String(result?.stdout || ""), "utf8"),
  };
}

function sanitizeArgs(args) {
  const redactValueAfter = new Set([
    "--api-base",
    "--package-url",
    "--private-key-file",
    "--private-key-env",
    "--tenant-id",
    "--token",
  ]);
  return args.map((arg, index) => {
    if (typeof arg !== "string") return String(arg);
    if (redactValueAfter.has(args[index - 1])) return "<redacted>";
    if (/token|secret|private-key/i.test(arg)) return "<redacted>";
    return arg;
  });
}

function commandStep({ args, command, cwd, env, name, runner }) {
  const result = runner(command, args, {
    cwd,
    env,
  });
  const summary = normalizeCommandResult(result);
  return {
    ...summary,
    args: sanitizeArgs(args),
    command,
    cwd,
    name,
    ok: !summary.error && summary.exitCode === 0,
    stderr: String(result?.stderr || ""),
    stdout: String(result?.stdout || ""),
  };
}

function publicStep(step) {
  const { stderr: _stderr, stdout: _stdout, ...publicRecord } = step;
  return publicRecord;
}

function parseStudioDryRunJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  return JSON.parse(text);
}

function readGeneratedJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function markReleaseEvidenceSummaryPresent(record, summaryPath) {
  return {
    ...record,
    outputs: {
      ...(record.outputs || {}),
      summary: {
        path: summaryPath,
        present: Boolean(summaryPath && fs.existsSync(summaryPath)),
      },
    },
  };
}

function blocker(code, detail) {
  return { code, detail };
}

function mergeBlockerCodes(blockers) {
  const seen = new Set();
  const result = [];
  for (const item of blockers) {
    const code = item?.code;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push(item);
  }
  return result;
}

function resolveDefaultStudioDir() {
  return (
    process.env.LIME_AGENT_APP_STUDIO_DIR?.trim() ||
    path.resolve(repoRoot, "..", "..", "limecloud", "lime-agent-app-studio")
  );
}

function resolveDefaultStudioCli(studioDir) {
  return path.join(studioDir, "src", "cli.mjs");
}

function resolveDefaultContentFactoryDir() {
  return (
    process.env.CONTENT_FACTORY_APP_DIR?.trim() ||
    path.resolve(repoRoot, "..", "..", "limecloud", "content-factory-app")
  );
}

function optionalArg(args, flag, value) {
  if (value) args.push(flag, value);
}

function existingOptionalArg(args, flag, value) {
  const filePath = existingPath(value);
  if (filePath) args.push(flag, filePath);
}

function resolveOptionalInputPath(value, fallback) {
  if (value) return path.resolve(process.cwd(), value);
  return existingPath(fallback);
}

export function runContentFactoryProductionReadinessPipeline(input = {}) {
  const runner = input.runner || defaultRunner;
  const baseEnv = input.env || process.env;
  const env = { ...baseEnv };
  if (input.packageUrl) {
    env.CONTENT_FACTORY_PACKAGE_URL = String(input.packageUrl);
  }
  if (input.tenantId) {
    env.LIMECORE_TENANT_ID = String(input.tenantId);
  }
  if (input.apiBase) {
    env.LIME_AGENT_APP_STUDIO_API_BASE = String(input.apiBase);
  }
  if (input.studioTokenEnv) {
    const token = baseEnv[String(input.studioTokenEnv)] || "";
    if (token) env.LIME_AGENT_APP_STUDIO_TOKEN = token;
  }
  const outputDir = path.resolve(process.cwd(), input.outputDir || "");
  if (!input.outputDir) {
    throw new Error("outputDir is required");
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const appId = input.appId || "content-factory-app";
  const appServerBin = input.appServerBin
    ? path.resolve(process.cwd(), input.appServerBin)
    : "";
  const contentFactoryDir = path.resolve(
    process.cwd(),
    input.contentFactoryDir || resolveDefaultContentFactoryDir(),
  );
  const studioDir = path.resolve(
    process.cwd(),
    input.studioDir || resolveDefaultStudioDir(),
  );
  const studioCli = path.resolve(
    process.cwd(),
    input.studioCli || resolveDefaultStudioCli(studioDir),
  );
  const preflightScript = path.resolve(
    process.cwd(),
    input.preflightScript ||
      path.join(
        repoRoot,
        "scripts/plugin/content-factory-production-preflight.mjs",
      ),
  );
  const releaseEvidenceScript = path.resolve(
    process.cwd(),
    input.releaseEvidenceScript ||
      path.join(
        repoRoot,
        "scripts/plugin/content-factory-production-release-evidence.mjs",
      ),
  );
  const expectedVersion = input.expectedVersion || "";
  const channel = input.channel || "stable";
  const timeoutMs = input.timeoutMs || 30_000;
  let bootstrapPath = existingPath(input.bootstrapPath);
  let catalogPath = existingPath(input.catalogPath);
  const fetchCloudPath = existingPath(input.fetchCloudPath);
  let appSignaturePath = resolveOptionalInputPath(
    input.appSignaturePath,
    path.join(contentFactoryDir, "app.signature.yaml"),
  );
  let trustRootPath = resolveOptionalInputPath(
    input.trustRootPath,
    path.join(contentFactoryDir, "plugin-signature-trust-root.json"),
  );
  let fetchCloudFromCatalogExecuted = false;
  const guiEvidencePath = existingPath(input.guiEvidencePath);
  const bundleDir = path.join(outputDir, "evidence-bundle");
  const files = {
    bundle: path.join(
      bundleDir,
      CONTENT_FACTORY_PRODUCTION_EVIDENCE_BUNDLE_FILE_NAME,
    ),
    bundleDir,
    fetchCloud: path.join(
      outputDir,
      "content-factory-fetch-cloud-evidence.json",
    ),
    gateResult: path.join(
      bundleDir,
      CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
    ),
    pipeline: path.join(
      outputDir,
      CONTENT_FACTORY_PRODUCTION_READINESS_PIPELINE_FILE_NAME,
    ),
    productionBootstrap: path.join(
      outputDir,
      "content-factory-production-bootstrap.json",
    ),
    productionCatalog: path.join(
      outputDir,
      "content-factory-production-catalog.json",
    ),
    preflight: path.join(
      outputDir,
      CONTENT_FACTORY_PRODUCTION_PIPELINE_PREFLIGHT_FILE_NAME,
    ),
    readinessReport: path.join(
      outputDir,
      "content-factory-production-readiness-report.json",
    ),
    signingProof: path.join(
      outputDir,
      CONTENT_FACTORY_PRODUCTION_PIPELINE_SIGNING_PROOF_FILE_NAME,
    ),
    productionReleaseEvidence: path.join(
      outputDir,
      CONTENT_FACTORY_PRODUCTION_RELEASE_EVIDENCE_FILE_NAME,
    ),
    studioDryRun: path.join(
      outputDir,
      CONTENT_FACTORY_PRODUCTION_PIPELINE_STUDIO_DRY_RUN_FILE_NAME,
    ),
  };

  const buildPreflightArgs = () => {
    const args = [
      preflightScript,
      "--content-factory-dir",
      contentFactoryDir,
      "--output",
      files.preflight,
      "--timeout-ms",
      String(timeoutMs),
    ];
    optionalArg(args, "--expected-version", expectedVersion);
    optionalArg(args, "--app-server-bin", appServerBin);
    optionalArg(
      args,
      "--package-file",
      input.packageFile ? path.resolve(process.cwd(), input.packageFile) : "",
    );
    existingOptionalArg(args, "--catalog", catalogPath);
    existingOptionalArg(args, "--bootstrap", bootstrapPath);
    existingOptionalArg(args, "--fetch-cloud", fetchCloudPath);
    optionalArg(args, "--app-signature", appSignaturePath);
    optionalArg(args, "--trust-root", trustRootPath);
    if (fetchCloudFromCatalogExecuted) {
      args.push("--fetch-cloud-from-catalog");
      args.push("--fetch-cloud-output", files.fetchCloud);
    }
    if (input.skipAppServerInspect) args.push("--skip-app-server-inspect");
    return args;
  };

  const buildReleaseEvidenceArgs = () => {
    const args = [
      releaseEvidenceScript,
      "--app-id",
      appId,
      "--catalog-output",
      files.productionCatalog,
      "--bootstrap-output",
      files.productionBootstrap,
      "--output",
      files.productionReleaseEvidence,
      "--timeout-ms",
      String(timeoutMs),
    ];
    optionalArg(args, "--api-base", input.apiBase || "");
    optionalArg(args, "--tenant-id", input.tenantId || "");
    optionalArg(args, "--studio-token-env", input.studioTokenEnv || "");
    optionalArg(args, "--marketplace-name", input.marketplaceName || "");
    return args;
  };

  const buildStudioArgs = () => {
    const args = [
      studioCli,
      "publish",
      "--app-dir",
      contentFactoryDir,
      "--app-id",
      appId,
      "--channel",
      channel,
      "--dry-run",
    ];
    optionalArg(args, "--app-server-bin", appServerBin);
    optionalArg(args, "--app-signature", appSignaturePath);
    optionalArg(
      args,
      "--out-dir",
      input.studioOutDir ? path.resolve(process.cwd(), input.studioOutDir) : "",
    );
    return args;
  };

  let studioStep = commandStep({
    args: buildStudioArgs(),
    command: process.execPath,
    cwd: studioDir,
    env,
    name: "studioDryRun",
    runner,
  });
  let studioDryRun = null;
  let studioParseError = null;
  try {
    studioDryRun = parseStudioDryRunJson(studioStep.stdout);
    if (studioDryRun) {
      writeJsonFile(files.studioDryRun, studioDryRun);
    }
  } catch (error) {
    studioParseError = error instanceof Error ? error.message : String(error);
  }

  let signingProof = buildContentFactoryProductionSigningProofPlan({
    ...input,
    appId,
    channel,
    contentFactoryDir,
    env: baseEnv,
    expectedVersion,
    packageUrl: input.packageUrl || baseEnv.CONTENT_FACTORY_PACKAGE_URL || "",
    studioDryRun,
  });
  let signingProofStep = null;
  if (signingProof.executable) {
    signingProofStep = commandStep({
      args: signingProof.args,
      command: process.execPath,
      cwd: contentFactoryDir,
      env,
      name: "signingProof",
      runner,
    });
    signingProof = completeContentFactoryProductionSigningProofPlan(
      signingProof,
      signingProofStep,
    );
    if (signingProof.status === "ready") {
      appSignaturePath = signingProof.outputs.appSignature.path;
      trustRootPath = signingProof.outputs.trustRoot.path;
      studioStep = commandStep({
        args: buildStudioArgs(),
        command: process.execPath,
        cwd: studioDir,
        env,
        name: "studioDryRunAfterSigning",
        runner,
      });
      try {
        studioDryRun = parseStudioDryRunJson(studioStep.stdout);
        studioParseError = null;
        if (studioDryRun) {
          writeJsonFile(files.studioDryRun, studioDryRun);
        }
      } catch (error) {
        studioParseError =
          error instanceof Error ? error.message : String(error);
      }
    }
  }
  writeJsonFile(files.signingProof, {
    ...signingProof,
    args: signingProof.args ? sanitizeArgs(signingProof.args) : undefined,
    step: signingProofStep ? publicStep(signingProofStep) : null,
  });

  let releaseEvidence = buildContentFactoryProductionReleaseEvidencePlan({
    appId,
    bootstrapOutputPath: files.productionBootstrap,
    catalogOutputPath: files.productionCatalog,
    env: baseEnv,
    input,
    marketplaceName: input.marketplaceName || "limecloud",
    outputPath: files.productionReleaseEvidence,
  });
  let releaseEvidenceStep = null;
  if (releaseEvidence.executable) {
    releaseEvidenceStep = commandStep({
      args: buildReleaseEvidenceArgs(),
      command: process.execPath,
      cwd: repoRoot,
      env,
      name: "productionReleaseEvidence",
      runner,
    });
    releaseEvidence =
      readGeneratedJson(files.productionReleaseEvidence) || releaseEvidence;
    catalogPath ||= existingPath(files.productionCatalog);
    bootstrapPath ||= existingPath(files.productionBootstrap);
  } else {
    releaseEvidence = {
      ...releaseEvidence,
      generatedAt: new Date().toISOString(),
    };
    writeJsonFile(files.productionReleaseEvidence, releaseEvidence);
    releaseEvidence = markReleaseEvidenceSummaryPresent(
      releaseEvidence,
      files.productionReleaseEvidence,
    );
    writeJsonFile(files.productionReleaseEvidence, releaseEvidence);
  }
  fetchCloudFromCatalogExecuted = Boolean(
    input.fetchCloudFromCatalog && catalogPath,
  );

  const preflightStep = commandStep({
    args: buildPreflightArgs(),
    command: process.execPath,
    cwd: repoRoot,
    env,
    name: "preflight",
    runner,
  });
  const preflightEvidence = readGeneratedJson(files.preflight);

  const bundleInput = {
    appId,
    bootstrapPath,
    catalogPath,
    expectedVersion,
    fetchCloudPath: fetchCloudPath || existingPath(files.fetchCloud),
    guiEvidencePath,
    outputDir: bundleDir,
    preflightPath: existingPath(files.preflight),
  };
  let evidenceBundle = null;
  let evidenceBundleError = null;
  try {
    evidenceBundle = buildContentFactoryProductionEvidenceBundle(bundleInput);
  } catch (error) {
    evidenceBundleError =
      error instanceof Error ? error.message : String(error);
  }

  let readinessReport = null;
  let readinessReportError = null;
  try {
    readinessReport = buildContentFactoryProductionReadinessReport({
      appId,
      contentFactoryDir,
      evidenceDir: bundleDir,
      expectedVersion,
      studioDryRunPath: existingPath(files.studioDryRun),
    });
    writeContentFactoryProductionReadinessReport(
      files.readinessReport,
      readinessReport,
    );
  } catch (error) {
    readinessReportError =
      error instanceof Error ? error.message : String(error);
  }

  const pipelineBlockers = [];
  if (!preflightStep.ok && !fs.existsSync(files.preflight)) {
    pipelineBlockers.push(
      blocker(
        "production_preflight_missing",
        "production preflight command failed before writing evidence.",
      ),
    );
  }
  if (!studioStep.ok || !fs.existsSync(files.studioDryRun)) {
    pipelineBlockers.push(
      blocker(
        "production_studio_dry_run_missing",
        "Studio publish --dry-run did not produce release readiness evidence.",
      ),
    );
  }
  if (studioParseError) {
    pipelineBlockers.push(
      blocker(
        "production_studio_dry_run_parse_failed",
        "Studio dry-run stdout was not valid JSON.",
      ),
    );
  }
  if (signingProof.requested && signingProof.status !== "ready") {
    const code =
      signingProof.skippedReason === "missing_inputs"
        ? "production_signature_generation_inputs_missing"
        : signingProof.commandOk === false
          ? "production_signature_generation_failed"
          : "production_signature_generation_outputs_missing";
    pipelineBlockers.push(
      blocker(
        code,
        "Explicit signature proof generation was requested but did not produce both app.signature.yaml and plugin-signature-trust-root.json.",
      ),
    );
  }
  if (releaseEvidence.requested && releaseEvidence.status !== "ready") {
    const releaseEvidenceBlockers =
      productionReleaseEvidenceMissingRequirementBlockers(releaseEvidence);
    if (releaseEvidenceBlockers.length > 0) {
      pipelineBlockers.push(...releaseEvidenceBlockers);
    } else {
      const code =
        releaseEvidence.skippedReason === "missing_inputs"
          ? "production_release_evidence_inputs_missing"
          : releaseEvidenceStep && releaseEvidenceStep.ok === false
            ? "production_release_evidence_fetch_failed"
            : "production_release_evidence_not_ready";
      pipelineBlockers.push(
        blocker(
          code,
          "Explicit production release evidence fetch was requested but did not produce ready catalog/bootstrap evidence.",
        ),
      );
    }
  }
  if (evidenceBundleError) {
    pipelineBlockers.push(
      blocker(
        "production_evidence_bundle_failed",
        "production evidence bundle could not be generated.",
      ),
    );
  }
  if (readinessReportError) {
    pipelineBlockers.push(
      blocker(
        "production_readiness_report_failed",
        "production readiness report could not be generated.",
      ),
    );
  }

  const reportBlockers = readinessReport?.blockers || [];
  const blockers = mergeBlockerCodes([...pipelineBlockers, ...reportBlockers]);
  const blockerPlan =
    buildContentFactoryProductionReadinessBlockerPlan(blockers);
  const ready =
    readinessReport?.ready === true &&
    preflightStep.ok &&
    studioStep.ok &&
    fs.existsSync(files.studioDryRun) &&
    !evidenceBundleError &&
    !readinessReportError &&
    pipelineBlockers.length === 0;
  const pipeline = {
    schemaVersion: "content-factory-production-readiness-pipeline.v1",
    appId,
    channel,
    contentFactoryDir,
    generatedAt: new Date().toISOString(),
    outputDir,
    ready,
    status: ready ? "ready" : "blocked",
    expectedVersion: expectedVersion || null,
    files,
    fetchCloudFromCatalog: {
      executed: fetchCloudFromCatalogExecuted,
      output: fetchCloudFromCatalogExecuted ? files.fetchCloud : null,
      requested: input.fetchCloudFromCatalog === true,
      skippedReason:
        input.fetchCloudFromCatalog && !catalogPath ? "catalog_missing" : null,
    },
    steps: {
      evidenceBundle: {
        error: evidenceBundleError,
        ok: Boolean(evidenceBundle) && !evidenceBundleError,
        ready: evidenceBundle?.gate?.ready === true,
        status: evidenceBundle?.gate?.status || "blocked",
      },
      preflight: {
        ...publicStep(preflightStep),
        output: files.preflight,
        present: fs.existsSync(files.preflight),
      },
      readinessReport: {
        error: readinessReportError,
        ok: Boolean(readinessReport) && !readinessReportError,
        output: files.readinessReport,
        ready: readinessReport?.ready === true,
        status: readinessReport?.status || "blocked",
      },
      signingProof: {
        ...signingProof,
        args: signingProof.args ? sanitizeArgs(signingProof.args) : undefined,
        step: signingProofStep ? publicStep(signingProofStep) : null,
      },
      productionReleaseEvidence: {
        ...releaseEvidence,
        step: releaseEvidenceStep ? publicStep(releaseEvidenceStep) : null,
      },
      studioDryRun: {
        ...publicStep(studioStep),
        output: files.studioDryRun,
        parseError: studioParseError,
        present: fs.existsSync(files.studioDryRun),
        ready: studioDryRun?.releaseReadiness?.ready === true,
      },
    },
    blockers,
    blockerPlan,
    operatorReadiness: buildOperatorReadiness({
      appSignaturePath,
      baseEnv,
      bootstrapPath,
      catalogPath,
      channel,
      contentFactoryDir,
      expectedVersion,
      fetchCloudPath: fetchCloudPath || existingPath(files.fetchCloud),
      guiEvidencePath,
      input,
      preflight: preflightEvidence,
      trustRootPath,
    }),
    note: "Production readiness pipeline. By default it is read-only: preflight, Studio publish --dry-run, local evidence bundling, and readiness report. --fetch-production-release-evidence only reads LimeCore current client endpoints and writes local catalog/bootstrap evidence. Only --generate-signature-proof may write app.signature.yaml and plugin-signature-trust-root.json with an explicit private key input; the pipeline still never uploads, installs, calls a Provider, calls production publish APIs, or writes secret values to evidence.",
  };
  writeJsonFile(files.pipeline, pipeline);
  return {
    bundle: evidenceBundle,
    files,
    pipeline,
    readinessReport,
    steps: {
      preflight: preflightStep,
      studioDryRun: studioStep,
    },
  };
}
