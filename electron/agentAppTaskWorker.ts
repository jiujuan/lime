/* global Buffer, process */
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_WORKER_TIMEOUT_MS = 30_000;
const MAX_WORKER_OUTPUT_BYTES = 1024 * 1024;
const MAX_WORKER_EVIDENCE_SUMMARY_CHARS = 160;

type WorkerRuntimeEvent = {
  type: string;
  payload: unknown;
};

type AgentAppTaskWorkerOutput = {
  artifactKind?: string;
  appId?: string;
  taskKind?: string;
  patch?: unknown;
  productWorkspace?: unknown;
  workspacePatch?: unknown;
  contentFactoryWorkspacePatch?: unknown;
};

export type AgentAppTaskWorkerRunRequest = {
  appId: string;
  taskId: string;
  taskKind: string;
  sessionId: string;
  turnId: string;
  packageRootPath: string;
  workerEntrypoint: string;
  input?: unknown;
  prompt?: string;
  title?: string;
  metadata?: unknown;
  timeoutMs?: number;
};

export type AgentAppTaskWorkerRunResult = {
  status: "completed";
  runtimeEvents: WorkerRuntimeEvent[];
  artifactKind: string;
};

export type AgentAppTaskWorkerFailureResult = {
  status: "failed";
  runtimeEvents: WorkerRuntimeEvent[];
  errorCode: string;
  errorMessage: string;
};

export async function runAgentAppTaskWorker(
  request: AgentAppTaskWorkerRunRequest,
): Promise<AgentAppTaskWorkerRunResult> {
  const workerPath = await resolveWorkerPath(
    request.packageRootPath,
    request.workerEntrypoint,
  );
  const output = await runNodeWorker(workerPath, request);
  const artifactKind =
    normalizeString(output.artifactKind) ?? "agent_app.worker_output";
  const workspacePatch =
    output.patch ??
    output.productWorkspace ??
    output.workspacePatch ??
    output.contentFactoryWorkspacePatch;
  if (!workspacePatch || typeof workspacePatch !== "object") {
    throw new Error("Agent App worker did not return a workspace patch object");
  }
  return {
    status: "completed",
    artifactKind,
    runtimeEvents: [
      {
        type: "artifact.snapshot",
        payload: {
          artifactId: `agent-app-worker-${request.appId}-${request.taskId}`,
          kind: artifactKind,
          title: `${request.appId} ${request.taskKind}`,
          status: "ready",
          content: JSON.stringify(workspacePatch),
          metadata: {
            agentAppWorker: {
              appId: request.appId,
              taskId: request.taskId,
              taskKind: request.taskKind,
              turnId: request.turnId,
              workerEntrypoint: request.workerEntrypoint,
              status: "completed",
              inputSummary: summarizeWorkerInput(request),
              outputSummary: summarizeWorkerOutput(workspacePatch),
              outputArtifactKind: artifactKind,
              outputObjectCount: countWorkspacePatchObjects(workspacePatch),
            },
            productWorkspace: workspacePatch,
            workspacePatch,
            contentFactoryWorkspacePatch: workspacePatch,
          },
        },
      },
    ],
  };
}

export function buildAgentAppTaskWorkerFailureResult(
  request: AgentAppTaskWorkerRunRequest,
  error: unknown,
): AgentAppTaskWorkerFailureResult {
  const errorMessage = normalizeErrorMessage(error);
  const errorCode = classifyWorkerError(error, errorMessage);
  const message = `Agent App task worker failed: ${errorMessage}`;
  return {
    status: "failed",
    errorCode,
    errorMessage,
    runtimeEvents: [
      {
        type: "runtime.error",
        payload: {
          message,
          errorCode,
          errorMessage,
          status: "failed",
          source: "agent_app_task_worker",
          appId: request.appId,
          taskId: request.taskId,
          taskKind: request.taskKind,
          turnId: request.turnId,
          metadata: {
            agentAppWorker: {
              appId: request.appId,
              taskId: request.taskId,
              taskKind: request.taskKind,
              turnId: request.turnId,
              workerEntrypoint: request.workerEntrypoint,
              status: "failed",
              errorCode,
              inputSummary: summarizeWorkerInput(request),
            },
          },
        },
      },
    ],
  };
}

async function resolveWorkerPath(
  packageRootPath: string,
  workerEntrypoint: string,
): Promise<string> {
  const root = path.resolve(packageRootPath);
  const entrypoint = workerEntrypoint.trim();
  if (
    !entrypoint ||
    entrypoint.startsWith("http://") ||
    entrypoint.startsWith("https://") ||
    entrypoint.includes("..")
  ) {
    throw new Error("Agent App worker entrypoint is not a safe relative path");
  }
  const workerPath = path.resolve(root, entrypoint.replace(/^\.\//, ""));
  if (workerPath !== root && !workerPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Agent App worker entrypoint escapes package root");
  }
  const workerStat = await stat(workerPath);
  if (!workerStat.isFile()) {
    throw new Error("Agent App worker entrypoint is not a file");
  }
  return workerPath;
}

async function runNodeWorker(
  workerPath: string,
  request: AgentAppTaskWorkerRunRequest,
): Promise<AgentAppTaskWorkerOutput> {
  const timeoutMs = Math.max(
    1_000,
    Math.min(120_000, request.timeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS),
  );
  const payload = JSON.stringify(buildWorkerInput(request));

  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], {
      cwd: request.packageRootPath,
      env: {
        HOME: process.env.HOME ?? "",
        PATH: process.env.PATH ?? "",
        TMPDIR: process.env.TMPDIR ?? "",
        LIME_AGENT_APP_RUNTIME: "task-worker",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Agent App worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_WORKER_OUTPUT_BYTES && !settled) {
        settled = true;
        clearTimeout(timer);
        child.kill("SIGTERM");
        reject(new Error("Agent App worker output exceeded 1 MiB"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const message = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(message || `Agent App worker exited with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(payload);
  });
}

function buildWorkerInput(
  request: AgentAppTaskWorkerRunRequest,
): Record<string, unknown> {
  const input = isRecord(request.input) ? request.input : {};
  return {
    ...input,
    appId: request.appId,
    taskId: request.taskId,
    taskKind: request.taskKind,
    sessionId: request.sessionId,
    turnId: request.turnId,
    prompt: request.prompt,
    title: request.title,
    metadata: request.metadata,
  };
}

function summarizeWorkerInput(request: AgentAppTaskWorkerRunRequest): string {
  const parts = [
    request.title ? `title=${request.title}` : null,
    request.prompt ? `prompt=${request.prompt}` : null,
    summarizeRecordKeys("input", request.input),
    summarizeRecordKeys("metadata", request.metadata),
  ].filter((part): part is string => Boolean(part));
  return truncateSummary(parts.join("; ") || request.taskKind);
}

function summarizeWorkerOutput(workspacePatch: unknown): string {
  const record = isRecord(workspacePatch) ? workspacePatch : {};
  const objects = Array.isArray(record.objects) ? record.objects : [];
  const objectTitles = objects
    .slice(0, 3)
    .map((object) => (isRecord(object) ? normalizeString(object.title) : null))
    .filter((title): title is string => Boolean(title));
  const objectSummary =
    objects.length > 0
      ? `${objects.length} objects${objectTitles.length > 0 ? `: ${objectTitles.join(", ")}` : ""}`
      : "workspace patch";
  return truncateSummary(objectSummary);
}

function summarizeRecordKeys(label: string, value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const keys = Object.keys(value).filter((key) => key.trim()).slice(0, 8);
  if (keys.length === 0) {
    return null;
  }
  return `${label}Keys=${keys.join(",")}`;
}

function countWorkspacePatchObjects(workspacePatch: unknown): number | null {
  if (!isRecord(workspacePatch)) {
    return null;
  }
  return Array.isArray(workspacePatch.objects) ? workspacePatch.objects.length : null;
}

function truncateSummary(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_WORKER_EVIDENCE_SUMMARY_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_WORKER_EVIDENCE_SUMMARY_CHARS - 3)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return "Unknown Agent App worker error";
}

function classifyWorkerError(error: unknown, message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("timed out")) {
    return "worker_timeout";
  }
  if (normalized.includes("output exceeded")) {
    return "worker_output_too_large";
  }
  if (normalized.includes("entrypoint")) {
    return "worker_entrypoint_invalid";
  }
  if (normalized.includes("workspace patch")) {
    return "worker_output_contract_invalid";
  }
  if (error instanceof SyntaxError) {
    return "worker_invalid_json_output";
  }
  if (normalized.includes("exited with")) {
    return "worker_process_failed";
  }
  return "worker_failed";
}
