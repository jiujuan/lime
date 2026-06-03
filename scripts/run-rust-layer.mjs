#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

import {
  RUST_TEST_LAYER_NAMES,
  classifyRustTestFiles,
} from "./rust-test-layer-classifier.mjs";

const MANIFEST_PATH = "src-tauri/Cargo.toml";

function liveProviderSmokeAllowed() {
  return (
    process.env.LIME_REAL_API_TEST === "1" ||
    process.env.PROXYCAST_REAL_API_TEST === "1"
  );
}

function printUsage() {
  console.log(`Usage:
  node scripts/run-rust-layer.mjs <layer> [options] [cargo filter/package args...] [-- test args...]

Layers:
  ${RUST_TEST_LAYER_NAMES.join(", ")}

Options:
  --list       只列出当前层 Rust 测试文件，不执行
  --json       以 JSON 输出列表
  --explain    列表输出包含分类原因
  --help       显示帮助

说明:
  --list 会遵循相同的 Cargo package scope；默认只列 lime，传 --workspace 列全 workspace，传 -p <crate> 列目标 crate。

Examples:
  npm run test:rust:unit
  npm run test:rust:unit -- -p lime-agent request_tool_policy
  npm run test:rust:unit -- --workspace
  npm run test:rust:integration -- -- --nocapture
  LIME_REAL_API_TEST=1 npm run test:rust:e2e -- -- --ignored --nocapture
`);
}

export function parseArgs(argv) {
  const [layer, ...rest] = argv;
  const separatorIndex = rest.indexOf("--");
  const runnerArgs =
    separatorIndex >= 0 ? rest.slice(0, separatorIndex) : rest.slice();
  const testArgs = separatorIndex >= 0 ? rest.slice(separatorIndex + 1) : [];

  const options = {
    explain: false,
    json: false,
    list: false,
  };
  const cargoArgs = [];

  for (const arg of runnerArgs) {
    if (arg === "--explain") {
      options.explain = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      cargoArgs.push(arg);
    }
  }

  return { layer, options, cargoArgs, testArgs };
}

function layerCargoArgs(layer) {
  if (layer === "unit") {
    return ["test", "--manifest-path", MANIFEST_PATH, "--lib"];
  }
  if (layer === "integration") {
    return ["test", "--manifest-path", MANIFEST_PATH, "--tests"];
  }
  if (layer === "e2e") {
    return ["test", "--manifest-path", MANIFEST_PATH];
  }
  throw new Error(`Unknown Rust test layer: ${layer}`);
}

function shouldUseDefaultIgnoredTestArg(layer, testArgs) {
  return layer === "e2e" && !testArgs.some((arg) => arg.includes("ignored"));
}

export function filterEntriesForCargoArgs(entries, cargoArgs) {
  const packages = new Set();
  let allWorkspace = false;

  for (let index = 0; index < cargoArgs.length; index += 1) {
    const arg = cargoArgs[index];
    if (arg === "--workspace" || arg === "--all") {
      allWorkspace = true;
    } else if (arg === "-p" || arg === "--package") {
      if (cargoArgs[index + 1]) {
        packages.add(cargoArgs[index + 1]);
        index += 1;
      }
    } else if (arg.startsWith("--package=")) {
      packages.add(arg.slice("--package=".length));
    }
  }

  if (allWorkspace) {
    return entries;
  }
  if (packages.size > 0) {
    return entries.filter((entry) => packages.has(entry.packageName));
  }
  return entries.filter((entry) => entry.packageName === "lime");
}

function listLayerEntries(layer, options, cargoArgs) {
  const scopedEntries = filterEntriesForCargoArgs(
    classifyRustTestFiles(process.cwd()).filter(
      (entry) => entry.cargoScope === "workspace",
    ),
    cargoArgs,
  );
  const entries = scopedEntries.filter((entry) => {
    if (layer === "e2e") {
      return entry.layer === "e2e" || entry.liveGated;
    }
    return entry.layer === layer;
  });

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  for (const entry of entries) {
    const suffix = options.explain ? ` # ${entry.reasons.join(", ")}` : "";
    console.log(`${entry.file}${suffix}`);
  }
}

function runCargo(layer, cargoArgs, testArgs) {
  const finalTestArgs = [...testArgs];
  if (shouldUseDefaultIgnoredTestArg(layer, finalTestArgs)) {
    finalTestArgs.push("--ignored");
  }

  const args = [...layerCargoArgs(layer), ...cargoArgs];
  if (finalTestArgs.length > 0) {
    args.push("--", ...finalTestArgs);
  }

  console.log(`[rust-layer] running cargo ${args.join(" ")}`);
  const result = spawnSync("cargo", args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  return typeof result.status === "number" ? result.status : 1;
}

function main() {
  const { layer, options, cargoArgs, testArgs } = parseArgs(
    process.argv.slice(2),
  );

  if (options.help || !layer) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  if (!RUST_TEST_LAYER_NAMES.includes(layer)) {
    console.error(
      `[rust-layer] unknown layer "${layer}". Expected one of: ${RUST_TEST_LAYER_NAMES.join(", ")}`,
    );
    process.exit(1);
  }

  if (options.list) {
    listLayerEntries(layer, options, cargoArgs);
    return;
  }

  if (layer === "e2e" && !liveProviderSmokeAllowed()) {
    console.log(
      "[rust-layer] e2e/live Rust tests are gated. Set LIME_REAL_API_TEST=1 to run ignored live tests.",
    );
    return;
  }

  process.exit(runCargo(layer, cargoArgs, testArgs));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
