#!/usr/bin/env node
import {
  buildStandaloneReleaseSecretPreflight,
  writeJsonFile,
} from "../lib/plugin-standalone-release-secret-preflight-core.mjs";

function parseArgs(argv) {
  const options = {
    channel: "stable",
    check: false,
    output: "",
    packageFormat: "app",
    platform: "macos",
    remoteUpload: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--platform" && next) {
      options.platform = next;
      index += 1;
    } else if (arg === "--package-format" && next) {
      options.packageFormat = next;
      index += 1;
    } else if (arg === "--channel" && next) {
      options.channel = next;
      index += 1;
    } else if (arg === "--output" && next) {
      options.output = next;
      index += 1;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "--remote-upload") {
      options.remoteUpload = true;
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
  node scripts/plugin/standalone-release-secret-preflight.mjs [options]

Options:
  --platform <macos|windows|all>      Target platform, default macos
  --package-format <app|dmg>          macOS package format, default app
  --channel <stable|beta|dev>         Release channel, default stable
  --remote-upload                     Require remote upload token
  --output <path>                     Write non-sensitive preflight JSON
  --check                             Exit non-zero unless all required secret names are present
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const result = buildStandaloneReleaseSecretPreflight({
    channel: options.channel,
    env: process.env,
    packageFormat: options.packageFormat,
    platform: options.platform,
    remoteUpload: options.remoteUpload,
  });

  if (options.output) {
    writeJsonFile(options.output, result);
  }

  console.log(
    `[plugin-release-secret-preflight] status=${result.status} checked=${result.checkedSecretCount} missing=${result.missingSecrets.length}`,
  );
  if (result.missingSecrets.length > 0) {
    console.log(
      `[plugin-release-secret-preflight] missing=${result.missingSecrets
        .map((item) => item.key)
        .join(",")}`,
    );
  }
  if (options.output) {
    console.log(
      `[plugin-release-secret-preflight] output=${options.output}`,
    );
  }

  if (options.check && result.status !== "ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[plugin-release-secret-preflight] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
