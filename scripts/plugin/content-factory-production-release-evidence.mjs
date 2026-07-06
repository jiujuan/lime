#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { fetchContentFactoryProductionReleaseEvidence } from "../lib/content-factory-production-release-evidence.mjs";

function parseArgs(argv) {
  const options = {
    apiBase: "",
    appId: "content-factory-app",
    bootstrapOutput: "",
    catalogOutput: "",
    check: false,
    fetchProductionReleaseEvidence: true,
    marketplaceName: "limecloud",
    output: "",
    studioTokenEnv: "",
    tenantId: "",
    timeoutMs: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--api-base" && next) {
      options.apiBase = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--tenant-id" && next) {
      options.tenantId = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--studio-token-env" && next) {
      options.studioTokenEnv = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--app-id" && next) {
      options.appId = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--marketplace-name" && next) {
      options.marketplaceName = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--catalog-output" && next) {
      options.catalogOutput = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--bootstrap-output" && next) {
      options.bootstrapOutput = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--output" && next) {
      options.output = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
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
  if (options.help) {
    return options;
  }
  if (!options.output) {
    throw new Error("--output is required");
  }
  if (!options.catalogOutput) {
    throw new Error("--catalog-output is required");
  }
  if (!options.bootstrapOutput) {
    throw new Error("--bootstrap-output is required");
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/plugin/content-factory-production-release-evidence.mjs [options]

Options:
  --api-base <url>            LimeCore API base. Can also use LIME_AGENT_APP_STUDIO_API_BASE / LIMECORE_API_BASE_URL / LIMECORE_API_BASE.
  --tenant-id <id>            Tenant id. Can also use LIMECORE_TENANT_ID / LIME_CLOUD_TENANT_ID.
  --studio-token-env <name>   Env var name containing the client/developer token; never pass the token value as an argument. Defaults to LIME_AGENT_APP_STUDIO_TOKEN.
  --app-id <id>               App id to locate in marketplace, defaults to content-factory-app.
  --marketplace-name <name>   Marketplace name for evidence metadata, defaults to limecloud.
  --catalog-output <path>     Write normalized production catalog evidence JSON.
  --bootstrap-output <path>   Write bootstrap trust-root evidence JSON.
  --output <path>             Write non-sensitive release evidence summary JSON.
  --timeout-ms <ms>           HTTP timeout, default 30000.
  --check                     Exit non-zero unless catalog/bootstrap evidence is ready.

This command only reads LimeCore current client endpoints. It never uploads,
publishes, installs, calls a Provider, or writes token values to evidence.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await fetchContentFactoryProductionReleaseEvidence({
    appId: options.appId,
    bootstrapOutputPath: options.bootstrapOutput,
    catalogOutputPath: options.catalogOutput,
    input: options,
    marketplaceName: options.marketplaceName,
    outputPath: options.output,
    timeoutMs: options.timeoutMs,
  });
  console.log(
    `[content-factory-production-release-evidence] status=${result.status} catalogAppFound=${result.catalog?.appFound === true} trustRoots=${result.bootstrap?.trustRootCount || 0}`,
  );
  if (Array.isArray(result.missingKeys) && result.missingKeys.length > 0) {
    console.log(
      `[content-factory-production-release-evidence] missingKeys=${result.missingKeys.join(",")}`,
    );
  }
  if (
    Array.isArray(result.missingRequirements) &&
    result.missingRequirements.length > 0
  ) {
    console.log(
      `[content-factory-production-release-evidence] missingRequirements=${result.missingRequirements.join(",")}`,
    );
  }
  console.log(
    `[content-factory-production-release-evidence] output=${options.output}`,
  );
  if (options.check && result.status !== "ready") {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(
      `[content-factory-production-release-evidence] failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
