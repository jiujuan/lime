#!/usr/bin/env node
import {
  buildConnectorProductionPreflight,
  writeJsonFile,
} from "./lib/agent-app-connector-production-preflight-core.mjs";

function parseArgs(argv) {
  const options = {
    check: false,
    connector: "all",
    output: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--connector" && next) {
      options.connector = next;
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
  node scripts/agent-app-connector-production-preflight.mjs [options]

Options:
  --connector <all|notion|slack|feishu|webhook>
                                   Connector family to check, default all.
  --output <path>                  Write non-sensitive preflight JSON.
  --check                          Exit non-zero unless required secret names are present.

This preflight checks secret presence by name only. It never prints secret values.
Remote webhook delivery can use LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL or
LIME_AGENT_APP_CONNECTOR_WEBHOOK_URL_FILE; file content must be a non-local https URL.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const result = buildConnectorProductionPreflight({
    connector: options.connector,
    env: process.env,
  });
  if (options.output) {
    writeJsonFile(options.output, result);
  }

  console.log(
    `[agent-app-connector-production-preflight] status=${result.status} connector=${result.connector} checked=${result.checkedSecretCount} missing=${result.missingSecrets.length}`,
  );
  if (result.missingSecrets.length > 0) {
    console.log(
      `[agent-app-connector-production-preflight] missing=${result.missingSecrets
        .map((item) => {
          const aliases = item.aliases?.length
            ? ` aliases:${item.aliases.join("|")}`
            : "";
          return `${item.connector}:${item.key}${aliases}`;
        })
        .join(",")}`,
    );
  }
  if (options.output) {
    console.log(`[agent-app-connector-production-preflight] output=${options.output}`);
  }
  if (options.check && result.status !== "ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[agent-app-connector-production-preflight] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
