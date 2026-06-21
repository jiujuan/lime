#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  isLiveProviderTestPath,
  liveProviderSmokeAllowed,
} from "./lib/live-provider-smoke-gate.mjs";
import { isVitestRunnableTestFile } from "./lib/vitest-test-file-filter.mjs";

const vitestEntrypoint = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);
const cliArgs = process.argv.slice(2).filter((arg) => arg !== "--run");
const defaultBatchSize = Number.parseInt(
  process.env.LIME_VITEST_BATCH_SIZE || "16",
  10,
);
const batchSize =
  Number.isFinite(defaultBatchSize) && defaultBatchSize > 0
    ? defaultBatchSize
    : 16;
const serialTestFileOrder = [
  "scripts/lib/harness-eval-history-window.test.ts",
  "scripts/lib/harness-eval-history-record.test.ts",
  "src/components/agent/chat/index.test.tsx",
  "src/components/agent/chat/index.projectRestore.test.tsx",
  "src/components/agent/chat/hooks/useAsterAgentChat.test.tsx",
  "src/components/workspace/WorkbenchPage.test.tsx",
  "src/components/agent/chat/components/HarnessStatusPanel.test.tsx",
  "src/components/agent/chat/components/ThemeWorkbenchSidebar.test.tsx",
  "src/components/settings-v2/system/automation/index.test.tsx",
];
const serialTestFiles = new Set(serialTestFileOrder);
const ignoredTestPathSegments = [
  "/node_modules/",
  "/tmp/lime-pnpm-frozen-node_modules/",
];
const includeLiveProviderTests = liveProviderSmokeAllowed();

function normalizeTestPath(file) {
  return path.resolve(file).replaceAll("\\", "/");
}

function shouldIgnoreCollectedTestFile(file) {
  const normalized = normalizeTestPath(file);
  if (ignoredTestPathSegments.some((segment) => normalized.includes(segment))) {
    return true;
  }
  return !includeLiveProviderTests && isLiveProviderTestPath(normalized);
}

function runVitest(args, label) {
  if (!includeLiveProviderTests) {
    const liveTestArgs = args.filter((arg) => isLiveProviderTestPath(arg));
    if (liveTestArgs.length > 0) {
      throw new Error(
        `[vitest-smart] ${liveTestArgs.join(", ")} 会调用真实模型或多模态 Provider。为避免消耗额度，默认禁止执行；如确需运行，请设置 LIME_ALLOW_LIVE_PROVIDER_SMOKE=1 或 LIME_REAL_API_TEST=1。`,
      );
    }
  }

  if (label) {
    console.log(`[vitest-smart] ${label}`);
  }

  const result = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=8192",
      vitestEntrypoint,
      "--run",
      "--silent=passed-only",
      "--disableConsoleIntercept",
      "--poolOptions.forks.singleFork",
      ...args,
    ],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function collectTestFiles() {
  const result = spawnSync(
    process.execPath,
    [vitestEntrypoint, "list", "--filesOnly", "--json"],
    {
      stdio: ["inherit", "pipe", "inherit"],
      env: process.env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  const parsed = JSON.parse(result.stdout || "[]");
  let skippedLiveTestCount = 0;
  const files = parsed
    .map((entry) => (typeof entry === "string" ? entry : entry?.file))
    .filter((entry) => typeof entry === "string" && entry.length > 0)
    .filter(isVitestRunnableTestFile)
    .filter((entry) => {
      if (!includeLiveProviderTests && isLiveProviderTestPath(entry)) {
        skippedLiveTestCount += 1;
      }
      return !shouldIgnoreCollectedTestFile(entry);
    });

  return { files, skippedLiveTestCount };
}

function chunkFiles(files, size) {
  const chunks = [];
  for (let index = 0; index < files.length; index += size) {
    chunks.push(files.slice(index, index + size));
  }
  return chunks;
}

function buildBatches(files) {
  const repoRoot = process.cwd();
  const serialBatches = [];
  const regularFiles = [];
  const fileByRelativePath = new Map();

  for (const file of files) {
    const relativePath = path.relative(repoRoot, file).replaceAll("\\", "/");
    fileByRelativePath.set(relativePath, file);
  }

  for (const relativePath of serialTestFileOrder) {
    const file = fileByRelativePath.get(relativePath);
    if (file) {
      serialBatches.push([file]);
    }
  }

  for (const file of files) {
    const relativePath = path.relative(repoRoot, file).replaceAll("\\", "/");
    if (serialTestFiles.has(relativePath)) {
      continue;
    }
    regularFiles.push(file);
  }

  return [...serialBatches, ...chunkFiles(regularFiles, batchSize)];
}

function main() {
  if (cliArgs.length > 0) {
    runVitest(cliArgs);
    return;
  }

  const { files, skippedLiveTestCount } = collectTestFiles();
  if (!includeLiveProviderTests && skippedLiveTestCount > 0) {
    console.log(
      `[vitest-smart] 默认跳过 ${skippedLiveTestCount} 个 live Provider 测试；如确需运行，请设置 LIME_ALLOW_LIVE_PROVIDER_SMOKE=1 或 LIME_REAL_API_TEST=1。`,
    );
  }
  const batches = buildBatches(files);

  for (let index = 0; index < batches.length; index += 1) {
    runVitest(
      [
        "--maxWorkers",
        "1",
        "--minWorkers",
        "1",
        "--no-file-parallelism",
        ...batches[index],
      ],
      `运行批次 ${index + 1}/${batches.length}`,
    );
  }
}

main();
