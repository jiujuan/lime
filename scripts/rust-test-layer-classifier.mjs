#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const RUST_TEST_LAYER_NAMES = ["unit", "integration", "e2e"];

const TEST_ATTRIBUTE_RE = /#\s*\[\s*(?:tokio::)?test(?:\s*\([^)]*\))?\s*\]/g;
const IGNORE_ATTRIBUTE_RE = /#\s*\[\s*ignore(?:\s*\]|\s*=|\s*\()/g;
const LIVE_GATE_RE =
  /LIME_REAL_API_TEST|PROXYCAST_REAL_API_TEST|真实联网|real_api_test_enabled|should_run_real_test|downloads?\s+the\s+live|live\s+(?:GitHub|limeai\.run|provider|smoke)|requires\s+real\s+API\s+credentials/i;

function toPosix(value) {
  return String(value || "").replaceAll(path.sep, "/");
}

function walkFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "target") {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolute, files);
    } else if (entry.isFile() && entry.name.endsWith(".rs")) {
      files.push(absolute);
    }
  }
  return files;
}

function parseWorkspaceMemberRoots(repoRoot) {
  const cargoTomlPath = path.join(repoRoot, "src-tauri", "Cargo.toml");
  const content = fs.readFileSync(cargoTomlPath, "utf8");
  const excludeBlock = content.match(/exclude\s*=\s*\[([\s\S]*?)\]/)?.[1] || "";
  const excludes = new Set(
    Array.from(excludeBlock.matchAll(/"([^"]+)"/g), (match) =>
      toPosix(match[1]),
    ),
  );

  const roots = new Map();
  roots.set("src-tauri", { packageName: "lime", workspaceMember: true });

  const cratesDir = path.join(repoRoot, "src-tauri", "crates");
  if (!fs.existsSync(cratesDir)) {
    return roots;
  }

  for (const entry of fs.readdirSync(cratesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const relRoot = `src-tauri/crates/${entry.name}`;
    const manifestPath = path.join(repoRoot, relRoot, "Cargo.toml");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    if (excludes.has(`crates/${entry.name}`)) {
      roots.set(relRoot, {
        packageName: entry.name,
        workspaceMember: false,
      });
      continue;
    }
    roots.set(relRoot, {
      packageName: readPackageName(manifestPath) || entry.name,
      workspaceMember: true,
    });
  }

  return roots;
}

function readPackageName(manifestPath) {
  const content = fs.readFileSync(manifestPath, "utf8");
  return content.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] || null;
}

function findPackageRoot(relFile, memberRoots) {
  const candidates = Array.from(memberRoots.keys()).sort(
    (a, b) => b.length - a.length,
  );
  for (const root of candidates) {
    if (relFile === root || relFile.startsWith(`${root}/`)) {
      return { root, ...memberRoots.get(root) };
    }
  }
  return {
    root: "src-tauri",
    packageName: "lime",
    workspaceMember: true,
  };
}

function isIntegrationTarget(relFile, packageRoot) {
  const tail = relFile.slice(packageRoot.length).replace(/^\/+/, "");
  return /^tests\/[^/]+\.rs$/.test(tail);
}

function classifyLayer(relFile, packageRoot, liveGated) {
  const basename = path.posix.basename(relFile).toLowerCase();
  if (liveGated || basename.includes("e2e")) {
    if (isIntegrationTarget(relFile, packageRoot) || basename.includes("e2e")) {
      return "e2e";
    }
  }
  if (basename.includes("e2e")) {
    return "e2e";
  }
  if (isIntegrationTarget(relFile, packageRoot)) {
    return "integration";
  }
  return "unit";
}

export function collectRustTestFiles(repoRoot = process.cwd()) {
  const root = path.join(repoRoot, "src-tauri");
  if (!fs.existsSync(root)) {
    return [];
  }
  return walkFiles(root)
    .map((file) => toPosix(path.relative(repoRoot, file)))
    .sort();
}

export function classifyRustTestFiles(repoRoot = process.cwd(), files = null) {
  const memberRoots = parseWorkspaceMemberRoots(repoRoot);
  const rustFiles = files || collectRustTestFiles(repoRoot);

  return rustFiles.flatMap((file) => {
    const absolute = path.resolve(repoRoot, file);
    const content = fs.readFileSync(absolute, "utf8");
    const testCount = (content.match(TEST_ATTRIBUTE_RE) || []).length;
    if (testCount === 0) {
      return [];
    }

    const packageInfo = findPackageRoot(toPosix(file), memberRoots);
    const ignoredCount = (content.match(IGNORE_ATTRIBUTE_RE) || []).length;
    const liveGated = ignoredCount > 0 && LIVE_GATE_RE.test(content);
    const layer = classifyLayer(toPosix(file), packageInfo.root, liveGated);
    const cargoScope = packageInfo.workspaceMember
      ? "workspace"
      : "excluded-subcrate";
    const hasDefaultRunnableTests = testCount > ignoredCount && layer !== "e2e";

    return [
      {
        file: toPosix(file),
        packageName: packageInfo.packageName,
        packageRoot: packageInfo.root,
        layer,
        testCount,
        ignoredCount,
        liveGated,
        cargoScope,
        runnableByDefault:
          cargoScope === "workspace" && hasDefaultRunnableTests,
        reasons: buildReasons({
          relFile: toPosix(file),
          layer,
          liveGated,
          cargoScope,
          packageRoot: packageInfo.root,
        }),
      },
    ];
  });
}

function buildReasons({ relFile, layer, liveGated, cargoScope, packageRoot }) {
  const reasons = [];
  if (cargoScope === "excluded-subcrate") {
    reasons.push("excluded from src-tauri workspace manifest");
  }
  if (liveGated) {
    reasons.push("live-gated ignored test");
  }
  if (layer === "integration") {
    reasons.push("cargo integration test target");
  } else if (layer === "e2e") {
    reasons.push("e2e/live test signal");
  } else if (!isIntegrationTarget(relFile, packageRoot)) {
    reasons.push("inline lib/module test");
  }
  return reasons;
}

export function buildRustLayerReport(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const entries = classifyRustTestFiles(repoRoot);
  const byLayer = Object.fromEntries(
    RUST_TEST_LAYER_NAMES.map((layer) => [
      layer,
      {
        files: 0,
        tests: 0,
        ignored: 0,
        runnableByDefault: 0,
      },
    ]),
  );

  for (const entry of entries) {
    byLayer[entry.layer].files += 1;
    byLayer[entry.layer].tests += entry.testCount;
    byLayer[entry.layer].ignored += entry.ignoredCount;
    if (entry.runnableByDefault) {
      byLayer[entry.layer].runnableByDefault += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalFiles: entries.length,
    totalTests: entries.reduce((sum, entry) => sum + entry.testCount, 0),
    runnableByDefault: entries.filter((entry) => entry.runnableByDefault).length,
    liveGated: entries.filter((entry) => entry.liveGated).length,
    excludedSubcrateFiles: entries.filter(
      (entry) => entry.cargoScope === "excluded-subcrate",
    ).length,
    layers: byLayer,
    entries,
  };
}

export function renderRustLayerReportText(report) {
  const lines = [
    "Rust test layer report",
    `Total files: ${report.totalFiles}`,
    `Total test attributes: ${report.totalTests}`,
    `Runnable by default: ${report.runnableByDefault}`,
    `Live-gated: ${report.liveGated}`,
    `Excluded subcrate files: ${report.excludedSubcrateFiles}`,
    "",
    "Layers:",
  ];

  for (const layer of RUST_TEST_LAYER_NAMES) {
    const stats = report.layers[layer];
    lines.push(
      `  ${layer.padEnd(11)} files=${String(stats.files).padStart(3)} tests=${String(
        stats.tests,
      ).padStart(4)} ignored=${String(stats.ignored).padStart(
        3,
      )} runnable=${String(stats.runnableByDefault).padStart(3)}`,
    );
  }

  const liveEntries = report.entries.filter((entry) => entry.liveGated);
  if (liveEntries.length > 0) {
    lines.push("", "Live-gated Rust tests:");
    for (const entry of liveEntries) {
      lines.push(
        `  ${entry.file} # ${entry.packageName}, tests=${entry.testCount}, ignored=${entry.ignoredCount}`,
      );
    }
  }

  if (report.excludedSubcrateFiles > 0) {
    lines.push("", "Excluded subcrate test files are counted for governance only.");
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}
