import fs from "node:fs";
import path from "node:path";

export function createNodeTauriConfigFileSystem() {
  return {
    ensureDirectory(directoryPath) {
      fs.mkdirSync(directoryPath, { recursive: true });
    },
    writeTextFile(filePath, content) {
      fs.writeFileSync(filePath, content, "utf8");
    },
  };
}

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

function parentDirectory(filePath) {
  const normalizedPath = normalizeBoundaryPath(filePath);
  const index = normalizedPath.lastIndexOf("/");
  return index > 0 ? normalizedPath.slice(0, index) : ".";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function validateWriterInput({ plan, outputRoot }) {
  const blockers = [];
  const normalizedRoot = normalizeBoundaryPath(outputRoot);

  if (!plan || plan.status !== "ready") {
    blockers.push({
      code: "WRITE_PLAN_NOT_READY",
      message: "Standalone Tauri config writer requires a ready write plan.",
      details: plan?.blockers ?? null,
    });
  }
  if (!normalizedRoot) {
    blockers.push({
      code: "OUTPUT_ROOT_MISSING",
      message:
        "Standalone Tauri config writer requires a non-empty output root.",
    });
  }
  if (normalizedRoot && hasTraversal(normalizedRoot)) {
    blockers.push({
      code: "PATH_TRAVERSAL_DETECTED",
      message:
        "Standalone Tauri config output root must not contain parent traversal.",
      details: { path: normalizedRoot },
    });
  }

  const files = Array.isArray(plan?.files) ? plan.files : [];
  if (plan?.status === "ready") {
    for (const file of files) {
      if (file?.encoding !== "utf8") {
        blockers.push({
          code: "UNSUPPORTED_ENCODING",
          message: "Standalone Tauri config writer only supports utf8 files.",
          details: { path: file?.path, encoding: file?.encoding },
        });
      }
      if (hasTraversal(file?.path)) {
        blockers.push({
          code: "PATH_TRAVERSAL_DETECTED",
          message:
            "Standalone Tauri config file path must not contain parent traversal.",
          details: { path: file?.path },
        });
      }
      if (normalizedRoot && !isInsideOutputRoot(file?.path, normalizedRoot)) {
        blockers.push({
          code: "FILE_OUTSIDE_OUTPUT_ROOT",
          message:
            "Standalone Tauri config writer refuses to write outside output root.",
          details: { path: file?.path, outputRoot: normalizedRoot },
        });
      }
    }
  }

  return { outputRoot: normalizedRoot || undefined, blockers };
}

export function writeStandaloneTauriConfigFiles({
  fileSystem = createNodeTauriConfigFileSystem(),
  outputRoot,
  plan,
}) {
  const validation = validateWriterInput({ plan, outputRoot });
  if (validation.blockers.length > 0 || plan?.status !== "ready") {
    return {
      schemaVersion: 1,
      status: "blocked",
      outputRoot: validation.outputRoot,
      filesWritten: [],
      blockers: validation.blockers,
    };
  }

  const filesWritten = [];
  for (const file of plan.files) {
    const directoryPath = parentDirectory(file.path);
    try {
      fileSystem.ensureDirectory(directoryPath);
    } catch (error) {
      return {
        schemaVersion: 1,
        status: "failed",
        outputRoot: validation.outputRoot,
        planHash: plan.planHash,
        filesWritten,
        blockers: [],
        failure: {
          code: "DIRECTORY_CREATE_FAILED",
          message:
            "Standalone Tauri config writer failed to create output directory.",
          details: { path: directoryPath, error: errorMessage(error) },
        },
      };
    }

    try {
      fileSystem.writeTextFile(file.path, file.content);
      filesWritten.push({
        kind: file.kind,
        path: normalizeBoundaryPath(file.path),
        contentHash: file.contentHash,
      });
    } catch (error) {
      return {
        schemaVersion: 1,
        status: "failed",
        outputRoot: validation.outputRoot,
        planHash: plan.planHash,
        filesWritten,
        blockers: [],
        failure: {
          code: "FILE_WRITE_FAILED",
          message:
            "Standalone Tauri config writer failed to write output file.",
          details: { path: file.path, error: errorMessage(error) },
        },
      };
    }
  }

  return {
    schemaVersion: 1,
    status: "written",
    outputRoot: validation.outputRoot,
    planHash: plan.planHash,
    filesWritten,
    blockers: [],
  };
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
