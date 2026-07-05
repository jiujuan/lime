#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  buildContentFactorySignedReleaseGate,
  readOptionalJsonFile,
  writeContentFactorySignedReleaseEvidenceTemplateDir,
  writeJsonFile,
} from "../lib/plugin-content-factory-signed-release-gate-core.mjs";
import { readContentFactorySignedReleaseEvidenceDir } from "../lib/plugin-content-factory-signed-release-gate-evidence-dir.mjs";

function parseArgs(argv) {
  const options = {
    appId: "content-factory-app",
    bootstrap: "",
    catalog: "",
    check: false,
    contentFactoryDir: process.env.CONTENT_FACTORY_APP_DIR || "",
    evidenceDir: "",
    expectedVersion: "",
    fetchCloud: "",
    guiEvidence: "",
    output: "",
    preflight: "",
    writeTemplateDir: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--app-id" && next) {
      options.appId = next.trim();
      index += 1;
    } else if (arg === "--catalog" && next) {
      options.catalog = next;
      index += 1;
    } else if (arg === "--bootstrap" && next) {
      options.bootstrap = next;
      index += 1;
    } else if (arg === "--fetch-cloud" && next) {
      options.fetchCloud = next;
      index += 1;
    } else if (arg === "--preflight" && next) {
      options.preflight = next;
      index += 1;
    } else if (arg === "--gui-evidence" && next) {
      options.guiEvidence = next;
      index += 1;
    } else if (arg === "--evidence-dir" && next) {
      options.evidenceDir = next;
      index += 1;
    } else if (arg === "--expected-version" && next) {
      options.expectedVersion = next.trim();
      index += 1;
    } else if (arg === "--content-factory-dir" && next) {
      options.contentFactoryDir = next;
      index += 1;
    } else if (arg === "--output" && next) {
      options.output = next;
      index += 1;
    } else if (arg === "--write-template-dir" && next) {
      options.writeTemplateDir = next;
      index += 1;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/plugin/content-factory-signed-release-gate.mjs [options]

Options:
  --catalog <path>              Production client/plugins or catalog JSON.
  --bootstrap <path>            Production bootstrap JSON with signature trust roots.
  --preflight <path>            Production preflight JSON from real .lapp + App Server inspect.
  --fetch-cloud <path>          pluginPackage/fetchCloud/package verification evidence JSON.
  --gui-evidence <path>         Real Lime Desktop GUI install/run evidence JSON.
  --evidence-dir <dir>          Read the five production evidence template JSON files from one directory.
  --expected-version <version>  Expected content-factory-app version.
  --content-factory-dir <dir>   Optional package dir used only to read package.json version.
  --output <path>               Write gate JSON. Defaults to <evidence-dir>/content-factory-signed-release-gate.result.json when --evidence-dir is used.
  --write-template-dir <dir>    Write production evidence JSON templates and exit.
  --check                       Exit non-zero unless production evidence is ready.

Ready requires production preflight from the real .lapp package, signed cloud_release
catalog metadata, matching bootstrap trust root, verified fetchCloud hashes/signature,
GUI Article Workspace evidence, workflow-events.jsonl, live Provider hostManagedGeneration,
and real workflow resume lifecycle metadata/audit events. Fixture cloud releases,
localhost provider fixtures, signature_missing/not_configured, host_generation_unavailable,
and missing workflowResume lifecycle evidence stay blocked.`);
}

function readPackageVersion(packageDir) {
  const candidates = [
    packageDir ? path.join(packageDir, "package.json") : "",
    path.join(
      process.cwd(),
      "src/features/plugin/testing/fixtures/package-root/package.json",
    ),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const pkg = JSON.parse(fs.readFileSync(candidate, "utf8"));
    if (typeof pkg.version === "string" && pkg.version.trim()) {
      return pkg.version.trim();
    }
  }
  return "";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const expectedVersion =
    options.expectedVersion || readPackageVersion(options.contentFactoryDir);
  if (options.writeTemplateDir) {
    const result = writeContentFactorySignedReleaseEvidenceTemplateDir(
      options.writeTemplateDir,
      {
        appId: options.appId,
        expectedVersion,
      },
    );
    console.log(
      `[content-factory-signed-release-gate] templateDir=${result.dir} files=${result.files.length}`,
    );
    return;
  }

  const evidenceDir = options.evidenceDir
    ? readContentFactorySignedReleaseEvidenceDir(options.evidenceDir)
    : null;
  const outputPath = options.output || evidenceDir?.files.result || "";
  const result = buildContentFactorySignedReleaseGate({
    appId: options.appId,
    bootstrap:
      readOptionalJsonFile(options.bootstrap) ??
      evidenceDir?.evidence.bootstrap,
    catalog:
      readOptionalJsonFile(options.catalog) ?? evidenceDir?.evidence.catalog,
    expectedVersion,
    fetchCloud:
      readOptionalJsonFile(options.fetchCloud) ??
      evidenceDir?.evidence.fetchCloud,
    guiEvidence:
      readOptionalJsonFile(options.guiEvidence) ??
      evidenceDir?.evidence.guiEvidence,
    preflight:
      readOptionalJsonFile(options.preflight) ??
      evidenceDir?.evidence.preflight,
  });
  if (outputPath) {
    writeJsonFile(outputPath, result);
  }
  console.log(
    `[content-factory-signed-release-gate] status=${result.status} appId=${result.appId} expectedVersion=${result.expectedVersion || "unknown"} missing=${result.missingRequirements.length}`,
  );
  if (result.missingRequirements.length > 0) {
    console.log(
      `[content-factory-signed-release-gate] missingCodes=${result.missingRequirements
        .map((item) => item.code)
        .join(",")}`,
    );
  }
  console.log(
    `[content-factory-signed-release-gate] preflight=${result.preflight.status} publishReadiness=${
      result.preflight.publishReadinessConfigured ? "configured" : "missing"
    }`,
  );
  if (evidenceDir) {
    console.log(
      `[content-factory-signed-release-gate] evidenceDir=${evidenceDir.dir}`,
    );
  }
  if (outputPath) {
    console.log(`[content-factory-signed-release-gate] output=${outputPath}`);
  }
  if (options.check && result.status !== "ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[content-factory-signed-release-gate] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
