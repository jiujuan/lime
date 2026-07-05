#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import { localAppServerBinaryPath } from "../lib/electron-dev-sidecar.mjs";
import { runContentFactoryProductionReadinessPipeline } from "../lib/content-factory-production-readiness-pipeline.mjs";

function defaultOutputDir(prefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "agent-apps",
    `${prefix}-${stamp}`,
  );
}

function defaultContentFactoryDir() {
  return (
    process.env.CONTENT_FACTORY_APP_DIR?.trim() ||
    path.resolve(process.cwd(), "..", "..", "limecloud", "content-factory-app")
  );
}

function defaultStudioDir() {
  return (
    process.env.LIME_AGENT_APP_STUDIO_DIR?.trim() ||
    path.resolve(
      process.cwd(),
      "..",
      "..",
      "limecloud",
      "lime-agent-app-studio",
    )
  );
}

function parseArgs(argv) {
  const options = {
    appId: "content-factory-app",
    appServerBin:
      process.env.APP_SERVER_BIN?.trim() ||
      localAppServerBinaryPath({ repoRoot: process.cwd() }),
    appSignaturePath: "",
    apiBase: "",
    bootstrapPath: "",
    catalogPath: "",
    channel: "stable",
    check: false,
    contentFactoryDir: defaultContentFactoryDir(),
    expectedVersion: "",
    fetchCloudFromCatalog: false,
    fetchCloudPath: "",
    fetchProductionReleaseEvidence: false,
    generateSignatureProof: false,
    guiEvidencePath: "",
    marketplaceName: "limecloud",
    outputDir: "",
    packageFile: "",
    packageUrl: "",
    prefix: "content-factory-production-readiness-pipeline",
    preflightScript: "",
    releaseEvidenceScript: "",
    publicKeyId: "",
    releaseId: "",
    signatureAlgorithm: "",
    signedAt: "",
    signingPrivateKeyEnv: "",
    signingPrivateKeyFile: "",
    skipAppServerInspect: false,
    studioCli: "",
    studioDir: defaultStudioDir(),
    studioOutDir: "",
    studioTokenEnv: "",
    tenantId: "",
    timeoutMs: 30_000,
    trustRootPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--app-id" && next) {
      options.appId = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--content-factory-dir" && next) {
      options.contentFactoryDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--studio-dir" && next) {
      options.studioDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--studio-cli" && next) {
      options.studioCli = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--preflight-script" && next) {
      options.preflightScript = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--release-evidence-script" && next) {
      options.releaseEvidenceScript = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--studio-out-dir" && next) {
      options.studioOutDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--tenant-id" && next) {
      options.tenantId = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--api-base" && next) {
      options.apiBase = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--studio-token-env" && next) {
      options.studioTokenEnv = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--app-server-bin" && next) {
      options.appServerBin = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--package-file" && next) {
      options.packageFile = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--package-url" && next) {
      options.packageUrl = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--release-id" && next) {
      options.releaseId = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--public-key-id" && next) {
      options.publicKeyId = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--generate-signature-proof") {
      options.generateSignatureProof = true;
      continue;
    }
    if (arg === "--signing-private-key-env" && next) {
      options.signingPrivateKeyEnv = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--signing-private-key-file" && next) {
      options.signingPrivateKeyFile = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--signature-algorithm" && next) {
      options.signatureAlgorithm = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--signed-at" && next) {
      options.signedAt = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--catalog" && next) {
      options.catalogPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--bootstrap" && next) {
      options.bootstrapPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--fetch-cloud" && next) {
      options.fetchCloudPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--fetch-cloud-from-catalog") {
      options.fetchCloudFromCatalog = true;
      continue;
    }
    if (arg === "--fetch-production-release-evidence") {
      options.fetchProductionReleaseEvidence = true;
      continue;
    }
    if (arg === "--marketplace-name" && next) {
      options.marketplaceName = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--gui-evidence" && next) {
      options.guiEvidencePath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--app-signature" && next) {
      options.appSignaturePath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--trust-root" && next) {
      options.trustRootPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--expected-version" && next) {
      options.expectedVersion = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--channel" && next) {
      options.channel = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--output-dir" && next) {
      options.outputDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--prefix" && next) {
      options.prefix = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--skip-app-server-inspect") {
      options.skipAppServerInspect = true;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5_000) {
    throw new Error("--timeout-ms must be >= 5000");
  }
  options.outputDir ||= defaultOutputDir(options.prefix);
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/plugin/content-factory-production-readiness-pipeline.mjs [options]

Options:
  --content-factory-dir <dir>  content-factory-app directory.
  --studio-dir <dir>           lime-agent-app-studio directory.
  --studio-cli <path>          Studio CLI path, defaults to <studio-dir>/src/cli.mjs.
  --release-evidence-script <path>
                              Production release evidence fetch script path.
  --tenant-id <id>             Tenant id, passed to child commands via env.
  --api-base <url>             Studio/LimeCore API base, passed to child commands via env.
  --studio-token-env <name>    Env var name containing developer token; value is not written to evidence.
  --app-server-bin <path>      app-server binary for current pluginLocalPackage/inspect.
  --catalog <path>             Production catalog/client plugins JSON.
  --bootstrap <path>           Production bootstrap JSON with trust roots.
  --fetch-cloud <path>         pluginPackage/fetchCloud verification evidence JSON.
  --fetch-cloud-from-catalog   Let preflight call current App Server pluginPackage/fetchCloud.
  --fetch-production-release-evidence
                              Fetch catalog/bootstrap from LimeCore current client endpoints.
  --marketplace-name <name>    Marketplace name for release evidence metadata, default limecloud.
  --gui-evidence <path>        Real Lime Desktop GUI evidence JSON.
  --app-signature <path>       app.signature.yaml, defaults to package dir when present.
  --trust-root <path>          plugin-signature-trust-root.json, defaults to package dir when present.
  --package-file <path>        Existing .lapp package file.
  --package-url <https-url>    Remote HTTPS package URL, passed to child commands via env.
  --release-id <id>            Non-secret release id for the signing command hint.
  --public-key-id <id>         Non-secret trust root public key id for the signing command hint.
  --generate-signature-proof   Explicitly generate app.signature.yaml and trust root after Studio dry-run hashes are available.
  --signing-private-key-env <name>
                              Env var containing the signing private key.
  --signing-private-key-file <path>
                              Local signing private key file. Path is not written to public command args.
  --signature-algorithm <name> Optional signing algorithm passed to sign-release.mjs.
  --signed-at <iso>            Optional fixed signedAt timestamp for reproducible release proof.
  --expected-version <value>   Expected content-factory-app version.
  --channel <value>            Studio dry-run channel, defaults to stable.
  --output-dir <dir>           Output directory for all generated evidence.
  --timeout-ms <ms>            App Server inspect timeout.
  --skip-app-server-inspect    Produce blocked preflight without current manifest hash.
  --check                      Exit non-zero unless the whole production pipeline is ready.
  -h, --help                   Show help.

The pipeline is read-only unless --generate-signature-proof is provided. The
optional signing step only writes app.signature.yaml and
plugin-signature-trust-root.json from explicit operator inputs. With
--fetch-production-release-evidence, the pipeline only reads LimeCore current
client endpoints and writes local catalog/bootstrap evidence under the output
directory. It never uploads, installs, calls a Provider, calls production publish
APIs, or writes secret values to evidence.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = runContentFactoryProductionReadinessPipeline(options);
  console.log(
    `[content-factory-production-readiness-pipeline] status=${result.pipeline.status} outputDir=${result.pipeline.outputDir} missing=${result.pipeline.blockers.length}`,
  );
  if (result.pipeline.blockers.length > 0) {
    console.log(
      `[content-factory-production-readiness-pipeline] missingCodes=${result.pipeline.blockers
        .map((item) => item.code)
        .join(",")}`,
    );
  }
  if (result.pipeline.blockerPlan?.nextPhase) {
    console.log(
      `[content-factory-production-readiness-pipeline] nextPhase=${result.pipeline.blockerPlan.nextPhase.id} owner=${result.pipeline.blockerPlan.nextPhase.owner}`,
    );
  }
  if (result.pipeline.operatorReadiness?.commandHint) {
    console.log(
      `[content-factory-production-readiness-pipeline] operatorReadiness=${
        result.pipeline.operatorReadiness.ready ? "ready" : "missing"
      } missingKeys=${result.pipeline.operatorReadiness.missingKeys.join(",")}`,
    );
    console.log(
      `[content-factory-production-readiness-pipeline] operatorCommand=${result.pipeline.operatorReadiness.commandHint}`,
    );
    if (result.pipeline.operatorReadiness.signingCommandHint?.command) {
      console.log(
        `[content-factory-production-readiness-pipeline] signingCommand=${result.pipeline.operatorReadiness.signingCommandHint.command}`,
      );
    }
  }
  if (result.pipeline.steps.signingProof?.requested) {
    console.log(
      `[content-factory-production-readiness-pipeline] signingProof=${result.pipeline.steps.signingProof.status} missingKeys=${result.pipeline.steps.signingProof.missingKeys.join(",")}`,
    );
  }
  console.log(
    `[content-factory-production-readiness-pipeline] report=${result.files.readinessReport}`,
  );
  console.log(
    `[content-factory-production-readiness-pipeline] pipeline=${result.files.pipeline}`,
  );
  if (options.check && !result.pipeline.ready) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[content-factory-production-readiness-pipeline] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
