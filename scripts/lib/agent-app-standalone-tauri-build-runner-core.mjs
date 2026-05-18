import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

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

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=@+-]+$/.test(text)
    ? text
    : `'${text.replaceAll("'", "'\\''")}'`;
}

export function loadStandaloneEnvFile(envPath) {
  const env = {};
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    env[key] = value;
  }
  return env;
}

export function createNodeTauriBuildProcessRunner() {
  return {
    run({ args, command, cwd, env }) {
      const result = spawnSync(command, args, {
        cwd,
        encoding: "utf8",
        env: { ...process.env, ...env },
      });
      return {
        exitCode: typeof result.status === "number" ? result.status : 1,
        signal: result.signal ?? undefined,
        stderr: result.stderr ?? "",
        stdout: result.stdout ?? "",
      };
    },
  };
}

export function buildStandaloneTauriBuildPlan({
  npmCommand = "npm",
  outputRoot,
  packageFormat = "app",
  repoRoot = process.cwd(),
  targetTriple = "",
  writerResult,
}) {
  const blockers = [];
  const normalizedOutputRoot = normalizeBoundaryPath(outputRoot);
  const normalizedRepoRoot = normalizeBoundaryPath(repoRoot || process.cwd());

  if (!normalizedOutputRoot) {
    blockers.push({
      code: "OUTPUT_ROOT_MISSING",
      message:
        "Standalone Tauri build runner requires a non-empty output root.",
    });
  }
  if (normalizedOutputRoot && hasTraversal(normalizedOutputRoot)) {
    blockers.push({
      code: "PATH_TRAVERSAL_DETECTED",
      message:
        "Standalone Tauri build output root must not contain parent traversal.",
      details: { path: normalizedOutputRoot },
    });
  }
  if (writerResult?.status !== "written") {
    blockers.push({
      code: "WRITER_RESULT_NOT_WRITTEN",
      message:
        "Standalone Tauri build runner requires successful config writer evidence.",
      details: writerResult?.status ?? "missing",
    });
  }

  const configRef = findWrittenFile(writerResult, "tauri_config");
  const envRef = findWrittenFile(writerResult, "runtime_env");
  if (!configRef) {
    blockers.push({
      code: "TAURI_CONFIG_REF_MISSING",
      message:
        "Standalone Tauri build runner requires a written tauri_config ref.",
    });
  }
  if (!envRef) {
    blockers.push({
      code: "RUNTIME_ENV_REF_MISSING",
      message:
        "Standalone Tauri build runner requires a written runtime_env ref.",
    });
  }

  for (const ref of [configRef, envRef].filter(Boolean)) {
    if (hasTraversal(ref.path)) {
      blockers.push({
        code: "PATH_TRAVERSAL_DETECTED",
        message:
          "Standalone Tauri build input paths must not contain parent traversal.",
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
          "Standalone Tauri build runner refuses inputs outside output root.",
        details: { path: ref.path, outputRoot: normalizedOutputRoot },
      });
    }
  }

  if (blockers.length > 0) {
    return {
      schemaVersion: 1,
      status: "blocked",
      readyToRun: false,
      blockers,
    };
  }

  const args = ["run", "tauri", "--", "build", "--config", configRef.path];
  if (targetTriple) {
    args.push("--target", targetTriple);
  }
  if (packageFormat && packageFormat !== "app") {
    args.push("--bundles", packageFormat);
  }

  return {
    schemaVersion: 1,
    status: "ready",
    readyToRun: true,
    releaseReadiness: "build_only_not_release_ready",
    outputRoot: normalizedOutputRoot,
    repoRoot: normalizedRepoRoot,
    writerPlanHash: writerResult.planHash,
    configRef,
    envRef,
    command: {
      command: npmCommand,
      args,
      display: [npmCommand, ...args].map(shellQuote).join(" "),
    },
    blockers: [],
  };
}

export function runStandaloneTauriBuildPlan({
  envLoader = loadStandaloneEnvFile,
  plan,
  runner = createNodeTauriBuildProcessRunner(),
}) {
  if (!plan || plan.status !== "ready") {
    return {
      schemaVersion: 1,
      status: "blocked",
      exitCode: undefined,
      blockers: plan?.blockers ?? [
        {
          code: "BUILD_PLAN_NOT_READY",
          message: "Standalone Tauri build runner requires a ready build plan.",
        },
      ],
    };
  }

  let env = {};
  try {
    env = envLoader(plan.envRef.path);
  } catch (error) {
    return {
      schemaVersion: 1,
      status: "failed",
      command: plan.command.display,
      exitCode: undefined,
      stdout: "",
      stderr: "",
      failure: {
        code: "RUNTIME_ENV_LOAD_FAILED",
        message:
          "Standalone Tauri build runner failed to load runtime env file.",
        details: {
          path: plan.envRef.path,
          error: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }

  const result = runner.run({
    args: plan.command.args,
    command: plan.command.command,
    cwd: plan.repoRoot,
    env,
  });
  return {
    schemaVersion: 1,
    status: result.exitCode === 0 ? "completed" : "failed",
    command: plan.command.display,
    exitCode: result.exitCode,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    outputRoot: plan.outputRoot,
    writerPlanHash: plan.writerPlanHash,
  };
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
