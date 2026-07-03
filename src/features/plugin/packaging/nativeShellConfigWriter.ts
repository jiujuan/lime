import type {
  PluginStandaloneNativeShellConfigWriteFile,
  PluginStandaloneNativeShellConfigWritePlan,
} from "./nativeShellConfigWritePlan";

export interface PluginStandaloneNativeShellConfigFileSystemPort {
  ensureDirectory(directoryPath: string): Promise<void>;
  writeTextFile(filePath: string, content: string): Promise<void>;
}

export type PluginStandaloneNativeShellConfigWriterBlockerCode =
  | "FILE_OUTSIDE_OUTPUT_ROOT"
  | "OUTPUT_ROOT_MISSING"
  | "PATH_TRAVERSAL_DETECTED"
  | "UNSUPPORTED_ENCODING"
  | "WRITE_PLAN_NOT_READY";

export interface PluginStandaloneNativeShellConfigWriterBlocker {
  code: PluginStandaloneNativeShellConfigWriterBlockerCode;
  message: string;
  details?: unknown;
}

export type PluginStandaloneNativeShellConfigWriterFailureCode =
  | "DIRECTORY_CREATE_FAILED"
  | "FILE_WRITE_FAILED";

export interface PluginStandaloneNativeShellConfigWriterFailure {
  code: PluginStandaloneNativeShellConfigWriterFailureCode;
  message: string;
  details?: unknown;
}

export interface PluginStandaloneNativeShellConfigWriteExecutionInput {
  outputRoot: string;
  plan: PluginStandaloneNativeShellConfigWritePlan;
  fileSystem: PluginStandaloneNativeShellConfigFileSystemPort;
}

export interface PluginStandaloneNativeShellConfigWrittenFileRef {
  kind: PluginStandaloneNativeShellConfigWriteFile["kind"];
  path: string;
  contentHash: string;
}

export type PluginStandaloneNativeShellConfigWriteExecutionResult =
  | {
      schemaVersion: 1;
      status: "written";
      outputRoot: string;
      planHash: string;
      filesWritten: PluginStandaloneNativeShellConfigWrittenFileRef[];
      blockers: [];
      failure?: never;
    }
  | {
      schemaVersion: 1;
      status: "blocked";
      outputRoot?: string;
      filesWritten: [];
      blockers: PluginStandaloneNativeShellConfigWriterBlocker[];
      failure?: never;
    }
  | {
      schemaVersion: 1;
      status: "failed";
      outputRoot: string;
      planHash: string;
      filesWritten: PluginStandaloneNativeShellConfigWrittenFileRef[];
      blockers: [];
      failure: PluginStandaloneNativeShellConfigWriterFailure;
    };

function normalizeBoundaryPath(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function hasTraversal(path: string): boolean {
  return normalizeBoundaryPath(path).split("/").includes("..");
}

function isInsideOutputRoot(path: string, outputRoot: string): boolean {
  const normalizedPath = normalizeBoundaryPath(path);
  const normalizedRoot = normalizeBoundaryPath(outputRoot);
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

function parentDirectory(filePath: string): string {
  const normalizedPath = normalizeBoundaryPath(filePath);
  const index = normalizedPath.lastIndexOf("/");
  return index > 0 ? normalizedPath.slice(0, index) : ".";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateExecutionInput(
  input: PluginStandaloneNativeShellConfigWriteExecutionInput,
): {
  outputRoot?: string;
  blockers: PluginStandaloneNativeShellConfigWriterBlocker[];
} {
  const blockers: PluginStandaloneNativeShellConfigWriterBlocker[] = [];
  const outputRoot = normalizeBoundaryPath(input.outputRoot);

  if (input.plan.status !== "ready") {
    blockers.push({
      code: "WRITE_PLAN_NOT_READY",
      message: "Standalone native shell config writer requires a ready write plan.",
      details: input.plan.blockers,
    });
  }
  if (!outputRoot) {
    blockers.push({
      code: "OUTPUT_ROOT_MISSING",
      message:
        "Standalone native shell config writer requires a non-empty output root.",
    });
  }
  if (outputRoot && hasTraversal(outputRoot)) {
    blockers.push({
      code: "PATH_TRAVERSAL_DETECTED",
      message:
        "Standalone native shell config output root must not contain parent traversal.",
      details: { path: outputRoot },
    });
  }
  if (input.plan.status === "ready") {
    for (const file of input.plan.files) {
      if (file.encoding !== "utf8") {
        blockers.push({
          code: "UNSUPPORTED_ENCODING",
          message: "Standalone native shell config writer only supports utf8 files.",
          details: { path: file.path, encoding: file.encoding },
        });
      }
      if (hasTraversal(file.path)) {
        blockers.push({
          code: "PATH_TRAVERSAL_DETECTED",
          message:
            "Standalone native shell config file path must not contain parent traversal.",
          details: { path: file.path },
        });
      }
      if (outputRoot && !isInsideOutputRoot(file.path, outputRoot)) {
        blockers.push({
          code: "FILE_OUTSIDE_OUTPUT_ROOT",
          message:
            "Standalone native shell config writer refuses to write outside output root.",
          details: { path: file.path, outputRoot },
        });
      }
    }
  }

  return { outputRoot: outputRoot || undefined, blockers };
}

export async function executeStandaloneNativeShellConfigWritePlan(
  input: PluginStandaloneNativeShellConfigWriteExecutionInput,
): Promise<PluginStandaloneNativeShellConfigWriteExecutionResult> {
  const validation = validateExecutionInput(input);
  if (validation.blockers.length > 0 || input.plan.status !== "ready") {
    return {
      schemaVersion: 1,
      status: "blocked",
      outputRoot: validation.outputRoot,
      filesWritten: [],
      blockers: validation.blockers,
    };
  }

  const outputRoot = validation.outputRoot;
  if (!outputRoot) {
    return {
      schemaVersion: 1,
      status: "blocked",
      filesWritten: [],
      blockers: [
        {
          code: "OUTPUT_ROOT_MISSING",
          message:
            "Standalone native shell config writer requires a non-empty output root.",
        },
      ],
    };
  }

  const filesWritten: PluginStandaloneNativeShellConfigWrittenFileRef[] = [];
  for (const file of input.plan.files) {
    const directoryPath = parentDirectory(file.path);
    try {
      await input.fileSystem.ensureDirectory(directoryPath);
    } catch (error) {
      return {
        schemaVersion: 1,
        status: "failed",
        outputRoot,
        planHash: input.plan.planHash,
        filesWritten,
        blockers: [],
        failure: {
          code: "DIRECTORY_CREATE_FAILED",
          message:
            "Standalone native shell config writer failed to create output directory.",
          details: { path: directoryPath, error: errorMessage(error) },
        },
      };
    }

    try {
      await input.fileSystem.writeTextFile(file.path, file.content);
      filesWritten.push({
        kind: file.kind,
        path: normalizeBoundaryPath(file.path),
        contentHash: file.contentHash,
      });
    } catch (error) {
      return {
        schemaVersion: 1,
        status: "failed",
        outputRoot,
        planHash: input.plan.planHash,
        filesWritten,
        blockers: [],
        failure: {
          code: "FILE_WRITE_FAILED",
          message:
            "Standalone native shell config writer failed to write output file.",
          details: { path: file.path, error: errorMessage(error) },
        },
      };
    }
  }

  return {
    schemaVersion: 1,
    status: "written",
    outputRoot,
    planHash: input.plan.planHash,
    filesWritten,
    blockers: [],
  };
}
