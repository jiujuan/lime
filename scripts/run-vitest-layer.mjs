#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  VITEST_LAYER_NAMES,
  classifyVitestTestFiles,
  collectVitestTestFiles,
} from "./lib/vitest-layer-classifier.mjs";
import {
  isLiveProviderTestPath,
  liveProviderSmokeAllowed,
} from "./lib/live-provider-smoke-gate.mjs";
import { isVitestRunnableTestFile } from "./lib/vitest-test-file-filter.mjs";

const repoRoot = process.cwd();
const includeLiveProviderTests = liveProviderSmokeAllowed();

function resolveVitestEntrypoint() {
  return fileURLToPath(
    new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
  );
}

function printUsage() {
  console.log(`Usage:
  node scripts/run-vitest-layer.mjs <layer> [options] [file...]

Layers:
  ${VITEST_LAYER_NAMES.join(", ")}

Options:
  --list       只列出当前层测试文件，不执行
  --json       以 JSON 输出列表或执行摘要
  --explain    列表输出包含分类原因
  --help       显示帮助

Examples:
  npm run test:unit -- --list
  npm run test:component -- src/components/agent/chat/components/MessageList.test.tsx
  npm run test:integration -- -- --testTimeout=30000
`);
}

export function parseArgs(argv) {
  const [layer, ...rest] = argv;
  const separatorIndex = rest.indexOf("--");
  const runnerArgs =
    separatorIndex >= 0 ? rest.slice(0, separatorIndex) : rest.slice();
  const vitestArgs =
    separatorIndex >= 0 ? rest.slice(separatorIndex + 1) : [];

  const options = {
    explain: false,
    json: false,
    list: false,
  };
  const filters = [];
  const normalizedVitestArgs = [...vitestArgs];

  for (const arg of runnerArgs) {
    if (arg === "--explain") {
      options.explain = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--run") {
      // 分层运行器默认固定以 run 模式启动 Vitest；重复透传会让 Vitest 报错。
      continue;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("-")) {
      normalizedVitestArgs.push(arg);
    } else {
      filters.push(arg);
    }
  }

  return { layer, options, filters, vitestArgs: normalizedVitestArgs };
}

function normalizeFilter(value) {
  return String(value || "").replaceAll("\\", "/");
}

function matchesFilters(file, filters) {
  if (filters.length === 0) {
    return true;
  }
  const normalizedFile = normalizeFilter(file);
  return filters.some((filter) => {
    const normalizedFilter = normalizeFilter(filter);
    if (!normalizedFilter) {
      return false;
    }
    return (
      normalizedFile.includes(normalizedFilter) ||
      path.resolve(repoRoot, normalizedFile) ===
        path.resolve(repoRoot, normalizedFilter)
    );
  });
}

function displayPath(file) {
  return file.replaceAll("\\", "/");
}

export function selectLayerEntries(allEntries, layer, filters) {
  const candidateEntries = allEntries.filter((entry) =>
    matchesFilters(entry.file, filters),
  );
  const entries = candidateEntries.filter((entry) => entry.layer === layer);
  const filterMisses = filters.flatMap((filter) => {
    const matchingEntries = allEntries.filter((entry) =>
      matchesFilters(entry.file, [filter]),
    );
    if (matchingEntries.length === 0) {
      return [
        {
          filter,
          reason: "no-runnable-test-file",
          layers: [],
        },
      ];
    }
    if (!matchingEntries.some((entry) => entry.layer === layer)) {
      return [
        {
          filter,
          reason: "wrong-layer",
          layers: Array.from(
            new Set(matchingEntries.map((entry) => entry.layer)),
          ).sort(),
        },
      ];
    }
    return [];
  });

  return { entries, filterMisses };
}

function collectLayerEntries(layer, filters) {
  const files = collectVitestTestFiles(repoRoot)
    .filter(isVitestRunnableTestFile)
    .filter((file) => {
      if (includeLiveProviderTests) {
        return true;
      }
      return !isLiveProviderTestPath(file);
    });
  const allEntries = classifyVitestTestFiles(repoRoot, files).filter((entry) => {
    if (!includeLiveProviderTests && isLiveProviderTestPath(entry.file)) {
      return false;
    }
    return true;
  });

  return selectLayerEntries(allEntries, layer, filters);
}

function printList(entries, options) {
  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  for (const entry of entries) {
    if (options.explain) {
      console.log(`${displayPath(entry.file)} # ${entry.reasons.join(", ")}`);
    } else {
      console.log(displayPath(entry.file));
    }
  }
}

function runVitest(layer, files, vitestArgs) {
  const result = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=8192",
      resolveVitestEntrypoint(),
      "--run",
      "--silent=passed-only",
      "--disableConsoleIntercept",
      "--poolOptions.forks.singleFork",
      ...vitestArgs,
      ...files,
    ],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  if (result.error) {
    throw result.error;
  }

  return typeof result.status === "number" ? result.status : 1;
}

function main() {
  const { layer, options, filters, vitestArgs } = parseArgs(
    process.argv.slice(2),
  );

  if (options.help || !layer) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  if (!VITEST_LAYER_NAMES.includes(layer)) {
    console.error(
      `[vitest-layer] unknown layer "${layer}". Expected one of: ${VITEST_LAYER_NAMES.join(", ")}`,
    );
    process.exit(1);
  }

  const { entries, filterMisses } = collectLayerEntries(layer, filters);
  if (filterMisses.length > 0) {
    console.error(
      `[vitest-layer] ${layer} layer did not include all requested filters:`,
    );
    for (const miss of filterMisses) {
      const layerSummary =
        miss.layers.length > 0 ? ` matched layers=${miss.layers.join(",")}` : "";
      console.error(`- ${miss.filter} (${miss.reason}${layerSummary})`);
    }
    process.exit(1);
  }

  if (options.list) {
    printList(entries, options);
    return;
  }

  if (entries.length === 0) {
    const summary = filters.length > 0 ? ` filters=${filters.join(",")}` : "";
    console.log(`[vitest-layer] no ${layer} test files matched.${summary}`);
    return;
  }

  console.log(
    `[vitest-layer] running layer=${layer} files=${entries.length}${filters.length > 0 ? ` filters=${filters.join(",")}` : ""}`,
  );
  const exitCode = runVitest(
    layer,
    entries.map((entry) => entry.file),
    vitestArgs,
  );
  process.exit(exitCode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
