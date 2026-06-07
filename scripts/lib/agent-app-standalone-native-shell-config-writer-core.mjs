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

function deprecatedStandaloneArtifactAdapterBlocker() {
  return {
    code: "DEPRECATED_STANDALONE_ARTIFACT_ADAPTER",
    message:
      "Standalone native shell config writer is deprecated; production artifacts must use the Electron/App Server release pipeline.",
  };
}

function validateWriterInput({ plan, outputRoot }) {
  const blockers = [deprecatedStandaloneArtifactAdapterBlocker()];
  const normalizedRoot = normalizeBoundaryPath(outputRoot);

  if (!plan || plan.status !== "ready") {
    blockers.push({
      code: "WRITE_PLAN_NOT_READY",
      message:
        "Standalone native shell config writer requires a ready write plan.",
      details: plan?.blockers ?? null,
    });
  }
  if (!normalizedRoot) {
    blockers.push({
      code: "OUTPUT_ROOT_MISSING",
      message:
        "Standalone native shell config writer requires a non-empty output root.",
    });
  }
  if (normalizedRoot && hasTraversal(normalizedRoot)) {
    blockers.push({
      code: "PATH_TRAVERSAL_DETECTED",
      message:
        "Standalone native shell config output root must not contain parent traversal.",
      details: { path: normalizedRoot },
    });
  }

  const files = Array.isArray(plan?.files) ? plan.files : [];
  if (plan?.status === "ready") {
    for (const file of files) {
      if (file?.encoding !== "utf8") {
        blockers.push({
          code: "UNSUPPORTED_ENCODING",
          message:
            "Standalone native shell config writer only supports utf8 files.",
          details: { path: file?.path, encoding: file?.encoding },
        });
      }
      if (hasTraversal(file?.path)) {
        blockers.push({
          code: "PATH_TRAVERSAL_DETECTED",
          message:
            "Standalone native shell config file path must not contain parent traversal.",
          details: { path: file?.path },
        });
      }
      if (normalizedRoot && !isInsideOutputRoot(file?.path, normalizedRoot)) {
        blockers.push({
          code: "FILE_OUTSIDE_OUTPUT_ROOT",
          message:
            "Standalone native shell config writer refuses to write outside output root.",
          details: { path: file?.path, outputRoot: normalizedRoot },
        });
      }
    }
  }

  return { outputRoot: normalizedRoot || undefined, blockers };
}

export function writeStandaloneNativeShellConfigFiles({ outputRoot, plan }) {
  const validation = validateWriterInput({ plan, outputRoot });
  return {
    schemaVersion: 1,
    status: "blocked",
    outputRoot: validation.outputRoot,
    filesWritten: [],
    blockers: validation.blockers,
  };
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
