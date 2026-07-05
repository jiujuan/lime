#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  buildContentFactoryProductionReadinessReport,
  writeContentFactoryProductionReadinessReport,
} from "../lib/content-factory-production-readiness-report.mjs";

function defaultOutputPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "agent-apps",
    `content-factory-production-readiness-report-${stamp}.json`,
  );
}

function parseArgs(argv) {
  const options = {
    appId: "content-factory-app",
    bootstrapPath: "",
    bundlePath: "",
    catalogPath: "",
    check: false,
    contentFactoryDir:
      process.env.CONTENT_FACTORY_APP_DIR?.trim() ||
      path.resolve(
        process.cwd(),
        "..",
        "..",
        "limecloud",
        "content-factory-app",
      ),
    evidenceDir: "",
    expectedVersion: "",
    fetchCloudPath: "",
    gateResultPath: "",
    guiEvidencePath: "",
    output: "",
    preflightPath: "",
    studioDryRunPath: "",
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
    if (arg === "--evidence-dir" && next) {
      options.evidenceDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--preflight" && next) {
      options.preflightPath = path.resolve(next.trim());
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
    if (arg === "--bundle" && next) {
      options.bundlePath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--fetch-cloud" && next) {
      options.fetchCloudPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--gui-evidence" && next) {
      options.guiEvidencePath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--gate-result" && next) {
      options.gateResultPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--studio-dry-run" && next) {
      options.studioDryRunPath = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--expected-version" && next) {
      options.expectedVersion = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--output" && next) {
      options.output = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  options.output ||= defaultOutputPath();
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/plugin/content-factory-production-readiness-report.mjs [options]

Options:
  --content-factory-dir <dir>  content-factory-app directory for package.json presence check.
  --evidence-dir <dir>         Signed release gate evidence-dir with the five standard JSON files.
  --preflight <path>           Production preflight JSON.
  --catalog <path>             Production catalog/client plugins JSON.
  --bootstrap <path>           Production bootstrap JSON with trust roots.
  --bundle <path>              Optional production evidence bundle manifest JSON.
  --fetch-cloud <path>         pluginPackage/fetchCloud verification evidence JSON.
  --gui-evidence <path>        Real Lime Desktop GUI evidence JSON.
  --gate-result <path>         Existing signed release gate result JSON.
  --studio-dry-run <path>      Optional lime-agent-app-studio publish --dry-run JSON.
  --expected-version <value>   Expected content-factory-app version.
  --output <path>              Write readiness report JSON.
  --check                      Exit non-zero unless readiness is ready.
  -h, --help                   Show help.

The report is read-only. It does not sign, upload, install, call a Provider, call
production APIs, or copy secret values/package URLs.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const report = buildContentFactoryProductionReadinessReport(options);
  writeContentFactoryProductionReadinessReport(options.output, report);
  console.log(
    `[content-factory-production-readiness-report] status=${report.status} output=${options.output} missing=${report.signedGate.missingCount}`,
  );
  if (report.signedGate.missingCount > 0) {
    console.log(
      `[content-factory-production-readiness-report] missingCodes=${report.signedGate.missingCodes.join(
        ",",
      )}`,
    );
  }
  if (report.blockerPlan?.nextPhase) {
    console.log(
      `[content-factory-production-readiness-report] nextPhase=${report.blockerPlan.nextPhase.id} owner=${report.blockerPlan.nextPhase.owner}`,
    );
  }
  if (options.check && !report.ready) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[content-factory-production-readiness-report] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
