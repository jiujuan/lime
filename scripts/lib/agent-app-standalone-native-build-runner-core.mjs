import fs from "node:fs";
import path from "node:path";

function normalizeBoundaryPath(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function hasTraversal(filePath) {
  return normalizeBoundaryPath(filePath).split("/").includes("..");
}

function isInsideOutputRoot(filePath, outputRoot) {
  const normalizedPath = normalizeBoundaryPath(filePath);
  const normalizedRoot = normalizeBoundaryPath(outputRoot);
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

function findWrittenFile(writerResult, kind) {
  return Array.isArray(writerResult?.filesWritten)
    ? writerResult.filesWritten.find((file) => file?.kind === kind)
    : undefined;
}

export function buildStandaloneNativeBuildPlan({
  outputRoot,
  repoRoot = "",
  writerResult,
}) {
  const blockers = [];
  const normalizedOutputRoot = normalizeBoundaryPath(outputRoot);
  const normalizedRepoRoot = normalizeBoundaryPath(repoRoot);

  blockers.push({
    code: "DEPRECATED_STANDALONE_ARTIFACT_ADAPTER",
    message:
      "Standalone native build runner is deprecated; production artifacts must use the Electron/App Server release pipeline.",
  });

  if (!normalizedOutputRoot) {
    blockers.push({
      code: "OUTPUT_ROOT_MISSING",
      message:
        "Standalone native build runner requires a non-empty output root.",
    });
  }
  if (normalizedOutputRoot && hasTraversal(normalizedOutputRoot)) {
    blockers.push({
      code: "PATH_TRAVERSAL_DETECTED",
      message:
        "Standalone native build output root must not contain parent traversal.",
      details: { path: normalizedOutputRoot },
    });
  }
  if (writerResult?.status !== "written") {
    blockers.push({
      code: "WRITER_RESULT_NOT_WRITTEN",
      message:
        "Standalone native build runner requires successful config writer evidence.",
      details: writerResult?.status ?? "missing",
    });
  }

  const configRef = findWrittenFile(writerResult, "native_shell_config");
  const envRef = findWrittenFile(writerResult, "runtime_env");
  if (!configRef) {
    blockers.push({
      code: "NATIVE_SHELL_CONFIG_REF_MISSING",
      message:
        "Standalone native build runner requires a written native_shell_config ref.",
    });
  }
  if (!envRef) {
    blockers.push({
      code: "RUNTIME_ENV_REF_MISSING",
      message:
        "Standalone native build runner requires a written runtime_env ref.",
    });
  }

  for (const ref of [configRef, envRef].filter(Boolean)) {
    if (hasTraversal(ref.path)) {
      blockers.push({
        code: "PATH_TRAVERSAL_DETECTED",
        message:
          "Standalone native build input paths must not contain parent traversal.",
        details: { path: ref.path },
      });
    }
    if (
      normalizedOutputRoot &&
      !isInsideOutputRoot(ref.path, normalizedOutputRoot)
    ) {
      blockers.push({
        code: "BUILD_INPUT_OUTSIDE_OUTPUT_ROOT",
        message:
          "Standalone native build runner refuses inputs outside output root.",
        details: { path: ref.path, outputRoot: normalizedOutputRoot },
      });
    }
  }

  return {
    schemaVersion: 1,
    status: "blocked",
    readyToRun: false,
    releaseReadiness: "deprecated_not_release_ready",
    outputRoot: normalizedOutputRoot || undefined,
    repoRoot: normalizedRepoRoot || undefined,
    writerPlanHash: writerResult?.planHash,
    blockers,
  };
}

export function runStandaloneNativeBuildPlan({ plan }) {
  return {
    schemaVersion: 1,
    status: "blocked",
    exitCode: undefined,
    blockers: plan?.blockers ?? [
      {
        code: "DEPRECATED_STANDALONE_ARTIFACT_ADAPTER",
        message:
          "Standalone native build runner is deprecated; production artifacts must use the Electron/App Server release pipeline.",
      },
    ],
  };
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
