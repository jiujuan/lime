import {
  VITEST_LAYER_NAMES,
  classifyVitestTestFiles,
  collectVitestTestFiles,
} from "./vitest-layer-classifier.mjs";
import {
  isLiveProviderTestPath,
  liveProviderSmokeAllowed,
} from "./live-provider-smoke-gate.mjs";

function emptyLayerBucket() {
  return {
    total: 0,
    runnableByDefault: 0,
    liveGated: 0,
    explicit: 0,
    reasons: {},
    files: [],
  };
}

function emptyComponentUnitMigrationCandidates() {
  return {
    total: 0,
    byHint: {},
    files: [],
  };
}

function increment(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

export function buildVitestLayerReport({
  entries,
  includeLiveProviderTests = liveProviderSmokeAllowed(),
} = {}) {
  const classifiedEntries =
    entries ??
    classifyVitestTestFiles(process.cwd(), collectVitestTestFiles(process.cwd()));
  const layers = Object.fromEntries(
    VITEST_LAYER_NAMES.map((layer) => [layer, emptyLayerBucket()]),
  );
  const componentUnitMigrationCandidates =
    emptyComponentUnitMigrationCandidates();

  for (const entry of classifiedEntries) {
    const bucket = layers[entry.layer] ?? emptyLayerBucket();
    layers[entry.layer] = bucket;

    const liveGated = entry.live || isLiveProviderTestPath(entry.file);
    const runnableByDefault = includeLiveProviderTests || !liveGated;

    bucket.total += 1;
    if (runnableByDefault) {
      bucket.runnableByDefault += 1;
    }
    if (liveGated) {
      bucket.liveGated += 1;
    }
    if (entry.explicitLayer) {
      bucket.explicit += 1;
    }
    for (const reason of entry.reasons) {
      increment(bucket.reasons, reason);
    }
    bucket.files.push(entry.file);

    const unitMigrationHints = entry.unitMigrationHints ?? [];
    if (entry.layer === "component" && unitMigrationHints.length > 0) {
      componentUnitMigrationCandidates.total += 1;
      componentUnitMigrationCandidates.files.push({
        file: entry.file,
        hints: unitMigrationHints,
      });
      for (const hint of unitMigrationHints) {
        increment(componentUnitMigrationCandidates.byHint, hint);
      }
    }
  }

  const totals = {
    total: classifiedEntries.length,
    runnableByDefault: Object.values(layers).reduce(
      (sum, layer) => sum + layer.runnableByDefault,
      0,
    ),
    liveGated: Object.values(layers).reduce(
      (sum, layer) => sum + layer.liveGated,
      0,
    ),
  };

  return {
    generatedAt: new Date().toISOString(),
    includeLiveProviderTests,
    totals,
    layers,
    componentUnitMigrationCandidates,
  };
}

function formatReasons(reasons) {
  const entries = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return "-";
  }
  return entries.map(([reason, count]) => `${reason}:${count}`).join(", ");
}

export function renderVitestLayerReportText(report) {
  const lines = [
    "Vitest layer report",
    `Total files: ${report.totals.total}`,
    `Runnable by default: ${report.totals.runnableByDefault}`,
    `Live-gated: ${report.totals.liveGated}`,
    `Include live provider tests: ${report.includeLiveProviderTests ? "yes" : "no"}`,
    "",
    "| Layer | Total | Runnable | Live-gated | Explicit | Top reasons |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const layer of VITEST_LAYER_NAMES) {
    const bucket = report.layers[layer] ?? emptyLayerBucket();
    lines.push(
      `| ${layer} | ${bucket.total} | ${bucket.runnableByDefault} | ${bucket.liveGated} | ${bucket.explicit} | ${formatReasons(bucket.reasons)} |`,
    );
  }

  const candidates =
    report.componentUnitMigrationCandidates ??
    emptyComponentUnitMigrationCandidates();
  lines.push(
    "",
    `Component unit-migration candidates: ${candidates.total}`,
    `Top hints: ${formatReasons(candidates.byHint)}`,
  );

  if (candidates.files.length > 0) {
    lines.push("Candidate files:");
    for (const candidate of candidates.files.slice(0, 10)) {
      lines.push(`- ${candidate.file} (${candidate.hints.join(", ")})`);
    }
    if (candidates.files.length > 10) {
      lines.push(`- ... ${candidates.files.length - 10} more`);
    }
  }

  return `${lines.join("\n")}\n`;
}
