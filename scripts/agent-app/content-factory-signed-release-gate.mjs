#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  buildContentFactorySignedReleaseGate,
  readOptionalJsonFile,
  writeJsonFile,
} from "../lib/agent-app-content-factory-signed-release-gate-core.mjs";

function parseArgs(argv) {
  const options = {
    appId: "content-factory-app",
    bootstrap: "",
    catalog: "",
    check: false,
    contentFactoryDir: process.env.CONTENT_FACTORY_APP_DIR || "",
    expectedVersion: "",
    fetchCloud: "",
    guiEvidence: "",
    output: "",
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
    } else if (arg === "--gui-evidence" && next) {
      options.guiEvidence = next;
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
  node scripts/agent-app/content-factory-signed-release-gate.mjs [options]

Options:
  --catalog <path>              Production client/agent-apps or catalog JSON.
  --bootstrap <path>            Production bootstrap JSON with signature trust roots.
  --fetch-cloud <path>          agentAppPackage/fetchCloud/package verification evidence JSON.
  --gui-evidence <path>         Real Lime Desktop GUI install/run evidence JSON.
  --expected-version <version>  Expected content-factory-app version.
  --content-factory-dir <dir>   Optional package dir used only to read package.json version.
  --output <path>               Write gate JSON.
  --check                       Exit non-zero unless production evidence is ready.

Ready requires signed cloud_release catalog metadata, matching bootstrap trust root,
verified fetchCloud hashes/signature, GUI Article Workspace evidence, workflow-events.jsonl,
and live Provider hostManagedGeneration. Fixture cloud releases, localhost provider
fixtures, signature_missing/not_configured, and host_generation_unavailable stay blocked.`);
}

function readPackageVersion(packageDir) {
  const candidates = [
    packageDir ? path.join(packageDir, "package.json") : "",
    path.join(
      process.cwd(),
      "src/features/agent-app/testing/fixtures/package-root/package.json",
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

  const result = buildContentFactorySignedReleaseGate({
    appId: options.appId,
    bootstrap: readOptionalJsonFile(options.bootstrap),
    catalog: readOptionalJsonFile(options.catalog),
    expectedVersion:
      options.expectedVersion || readPackageVersion(options.contentFactoryDir),
    fetchCloud: readOptionalJsonFile(options.fetchCloud),
    guiEvidence: readOptionalJsonFile(options.guiEvidence),
  });
  if (options.output) {
    writeJsonFile(options.output, result);
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
  if (options.output) {
    console.log(`[content-factory-signed-release-gate] output=${options.output}`);
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
