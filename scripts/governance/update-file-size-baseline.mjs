#!/usr/bin/env node

import {
  DEFAULT_BASELINE,
  collectOversizedFiles,
  readBaseline,
  writeBaseline,
} from "./file-size-baseline-lib.mjs";

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mergeUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeSection(currentSection, defaultSection, thresholds) {
  const section = {
    ...defaultSection,
    ...currentSection,
    scanPaths: currentSection?.scanPaths ?? defaultSection.scanPaths,
    excludePatterns: mergeUnique([
      ...(defaultSection.excludePatterns ?? []),
      ...(currentSection?.excludePatterns ?? []),
    ]),
  };

  return {
    ...section,
    oversizedFrozen: collectOversizedFiles(section, thresholds),
  };
}

function main() {
  const current = readBaseline();
  const thresholds = current.thresholds ?? DEFAULT_BASELINE.thresholds;
  const next = {
    ...DEFAULT_BASELINE,
    ...current,
    generatedAt: todayIsoDate(),
    thresholds,
    frontend: normalizeSection(
      current.frontend,
      DEFAULT_BASELINE.frontend,
      thresholds,
    ),
    rust: normalizeSection(current.rust, DEFAULT_BASELINE.rust, thresholds),
  };

  writeBaseline(next);

  console.log(
    [
      "✅ 文件体量基线已刷新。",
      `frontend: ${next.frontend.oversizedFrozen.length}`,
      `rust: ${next.rust.oversizedFrozen.length}`,
      `path: governance/file-size-baseline.json`,
    ].join(" "),
  );
}

main();
