#!/usr/bin/env node

import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_MANIFEST_PATH = "internal/test/benchmark-release.manifest.json";
const COMMAND_TIMEOUT_MS = 10_000;

function parseArgs(argv) {
  const result = {
    check: false,
    format: "json",
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outputPath: "",
    version: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      result.check = true;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      result.format = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--manifest" && argv[index + 1]) {
      result.manifestPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      result.outputPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--version" && argv[index + 1]) {
      result.version = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  if (!["json", "markdown"].includes(result.format)) {
    throw new Error("--format 只支持 json 或 markdown");
  }

  return result;
}

function printHelp() {
  console.log(`
Lime Benchmark Release Context

用法:
  npm run agent-qc:benchmark-release:context -- --version 1.97.0 --check
  npm run agent-qc:benchmark-release:context -- --version 1.97.0 --output .lime/benchmark/releases/1.97.0/run-context.json --format json --check

选项:
  --manifest PATH  release benchmark manifest，默认 ${DEFAULT_MANIFEST_PATH}
  --version VALUE  release 版本或 run id；默认 package.json version
  --format FMT     输出格式：json | markdown
  --output PATH    写入文件；默认 .lime/benchmark/releases/<version>/run-context.json
  --check          context 结构无效或 source commit 不匹配时非 0 退出；不因 Docker / runner 缺失失败
  -h, --help       显示帮助
`);
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeOutput(outputPath, content) {
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, content, "utf8");
}

function defaultCommandRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    timeout: options.timeoutMs || COMMAND_TIMEOUT_MS,
    windowsHide: true,
  });

  return {
    command,
    args,
    cwd: normalizePath(path.relative(process.cwd(), options.cwd || process.cwd()) || "."),
    status: result.status,
    signal: result.signal || "",
    ok: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || "",
  };
}

function commandProbe(id, command, args, commandRunner, options = {}) {
  const result = commandRunner(command, args, {
    timeoutMs: options.timeoutMs || COMMAND_TIMEOUT_MS,
    cwd: options.cwd || process.cwd(),
  });
  return {
    id,
    available: Boolean(result.ok),
    command: {
      executable: command,
      args,
      cwd: result.cwd,
      status: result.status,
      signal: result.signal,
      error: result.error,
      stdoutFirstLine: String(result.stdout || "").split(/\r?\n/).find(Boolean) || "",
      stderrTail: String(result.stderr || "").slice(-1_000),
    },
  };
}

function readGitHeadFile(repoPath) {
  const headPath = path.join(repoPath, ".git", "HEAD");
  if (!fs.existsSync(headPath)) {
    return "";
  }

  const headContent = fs.readFileSync(headPath, "utf8").trim();
  if (!headContent.startsWith("ref:")) {
    return headContent;
  }

  const refPath = headContent.slice("ref:".length).trim();
  const resolvedRefPath = path.join(repoPath, ".git", refPath);
  return fs.existsSync(resolvedRefPath)
    ? fs.readFileSync(resolvedRefPath, "utf8").trim()
    : "";
}

function readGitValue(repoPath, args, commandRunner) {
  const result = commandRunner("git", ["-C", repoPath, ...args], {
    timeoutMs: COMMAND_TIMEOUT_MS,
  });
  return result.ok ? String(result.stdout || "").trim() : "";
}

function readGitContext(rootDir, commandRunner) {
  const head = readGitValue(rootDir, ["rev-parse", "HEAD"], commandRunner) || readGitHeadFile(rootDir);
  const branch = readGitValue(rootDir, ["branch", "--show-current"], commandRunner);
  const statusShort = readGitValue(rootDir, ["status", "--short"], commandRunner);
  const statusLines = statusShort ? statusShort.split(/\r?\n/).filter(Boolean) : [];

  return {
    head,
    branch,
    dirty: statusLines.length > 0,
    statusEntryCount: statusLines.length,
    statusShortSha256: statusShort ? sha256Text(statusShort) : "",
  };
}

function readPackageContext(rootDir, issues) {
  const packagePath = path.join(rootDir, "package.json");
  try {
    const packageJson = readJsonFile(packagePath);
    return {
      name: packageJson.name || "",
      version: packageJson.version || "",
    };
  } catch (error) {
    issues.push(`package.json 读取失败：${error.message}`);
    return {
      name: "",
      version: "",
    };
  }
}

function readManifestContext(rootDir, manifestPath, issues) {
  const resolvedManifestPath = path.resolve(rootDir, manifestPath);
  try {
    const source = readTextFile(resolvedManifestPath);
    const manifest = JSON.parse(source);
    return {
      manifest,
      manifestPath: normalizePath(path.relative(rootDir, resolvedManifestPath)),
      manifestSha256: sha256Text(source),
    };
  } catch (error) {
    issues.push(`${manifestPath}: manifest 读取失败：${error.message}`);
    return {
      manifest: {},
      manifestPath: normalizePath(path.relative(rootDir, resolvedManifestPath)),
      manifestSha256: "",
    };
  }
}

function readSourceContexts(rootDir, manifest, commandRunner, issues) {
  const sources = Array.isArray(manifest.downloadedSources)
    ? manifest.downloadedSources
    : [];

  return sources.map((source) => {
    const resolvedPath = source.localPath
      ? path.resolve(rootDir, source.localPath)
      : "";
    const exists = Boolean(resolvedPath && fs.existsSync(resolvedPath));
    const gitHead = exists
      ? readGitValue(resolvedPath, ["rev-parse", "HEAD"], commandRunner) || readGitHeadFile(resolvedPath)
      : "";
    const commitMatches = Boolean(source.commit && gitHead && source.commit === gitHead);

    if (!exists) {
      issues.push(`${source.id || "source"}: localPath 不存在：${source.localPath || "(empty)"}`);
    } else if (!gitHead) {
      issues.push(`${source.id || "source"}: 无法读取 source git HEAD`);
    } else if (!commitMatches) {
      issues.push(`${source.id || "source"}: source HEAD 与 manifest commit 不一致：${gitHead} != ${source.commit}`);
    }

    return {
      id: source.id || "",
      priority: source.priority || "",
      localPath: source.localPath || "",
      commit: source.commit || "",
      gitHead,
      exists,
      commitMatches,
    };
  });
}

function buildEnvironmentContext(commandRunner) {
  const probes = [
    commandProbe("node", "node", ["--version"], commandRunner),
    commandProbe("npm", "npm", ["--version"], commandRunner),
    commandProbe("rustc", "rustc", ["--version"], commandRunner),
    commandProbe("cargo", "cargo", ["--version"], commandRunner),
    commandProbe("uv", "uv", ["--version"], commandRunner),
    commandProbe("docker_cli", "docker", ["--version"], commandRunner, {
      timeoutMs: 5_000,
    }),
    commandProbe("docker_daemon", "docker", ["info", "--format", "{{json .ServerVersion}}"], commandRunner, {
      timeoutMs: 5_000,
    }),
  ];

  return {
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuCount: os.cpus().length,
    },
    process: {
      node: process.version,
      versions: {
        v8: process.versions.v8 || "",
        uv: process.versions.uv || "",
      },
    },
    tools: probes,
    unavailableToolIds: probes
      .filter((probe) => !probe.available)
      .map((probe) => probe.id),
  };
}

function defaultVersion(packageContext, explicitVersion) {
  return explicitVersion || packageContext.version || "<version>";
}

function defaultOutputPath(version, format = "json") {
  const extension = format === "markdown" ? "md" : "json";
  return path.join(".lime", "benchmark", "releases", version, `run-context.${extension}`);
}

function buildBenchmarkReleaseContext({
  rootDir = process.cwd(),
  manifestPath = DEFAULT_MANIFEST_PATH,
  version = "",
  commandRunner = defaultCommandRunner,
  now = () => new Date(),
} = {}) {
  const issues = [];
  const warnings = [];
  const packageContext = readPackageContext(rootDir, issues);
  const resolvedVersion = defaultVersion(packageContext, version);
  const manifestContext = readManifestContext(rootDir, manifestPath, issues);
  const git = readGitContext(rootDir, commandRunner);
  const sources = readSourceContexts(
    rootDir,
    manifestContext.manifest,
    commandRunner,
    issues,
  );
  const environment = buildEnvironmentContext(commandRunner);

  if (git.dirty) {
    warnings.push(`worktree dirty: ${git.statusEntryCount} entries`);
  }
  if (environment.unavailableToolIds.length > 0) {
    warnings.push(
      `unavailable tools: ${environment.unavailableToolIds.join(", ")}`,
    );
  }

  return {
    schemaVersion: "benchmark-release-run-context-v1",
    generatedAt: now().toISOString(),
    version: resolvedVersion,
    releaseRoot: `.lime/benchmark/releases/${resolvedVersion}`,
    manifestPath: manifestContext.manifestPath,
    manifestSha256: manifestContext.manifestSha256,
    datasetVersion: manifestContext.manifest.datasetVersion || "",
    package: packageContext,
    git,
    environment,
    downloadedSources: sources,
    summary: {
      downloadedSourceCount: sources.length,
      sourceMismatchCount: sources.filter((source) => !source.commitMatches).length,
      unavailableToolCount: environment.unavailableToolIds.length,
      issueCount: issues.length,
      warningCount: warnings.length,
    },
    issues,
    warnings,
  };
}

function validateBenchmarkReleaseContext(context) {
  const issues = [...(context.issues || [])];
  if (context.schemaVersion !== "benchmark-release-run-context-v1") {
    issues.push("schemaVersion 必须是 benchmark-release-run-context-v1");
  }
  if (!context.version) {
    issues.push("version 不能为空");
  }
  if (!context.manifestSha256) {
    issues.push("manifestSha256 不能为空");
  }
  if (!context.package?.version) {
    issues.push("package.version 不能为空");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function renderMarkdown(context) {
  const lines = [
    "# Benchmark Release Run Context",
    "",
    `- version: ${context.version}`,
    `- datasetVersion: ${context.datasetVersion || "-"}`,
    `- manifest: ${context.manifestPath}`,
    `- manifestSha256: ${context.manifestSha256 || "-"}`,
    `- git: ${context.git.head || "-"}${context.git.branch ? ` (${context.git.branch})` : ""}`,
    `- dirty: ${context.git.dirty ? "yes" : "no"} (${context.git.statusEntryCount})`,
    `- unavailableTools: ${context.environment.unavailableToolIds.join(", ") || "-"}`,
    "",
    "## Downloaded Sources",
    "",
    "| Source | Commit | Local HEAD | Match |",
    "| --- | --- | --- | --- |",
  ];

  for (const source of context.downloadedSources) {
    lines.push(
      `| ${source.id} | ${source.commit || "-"} | ${source.gitHead || "-"} | ${source.commitMatches ? "yes" : "no"} |`,
    );
  }

  if (context.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of context.issues) {
      lines.push(`- ${issue}`);
    }
  }

  if (context.warnings.length > 0) {
    lines.push("", "## Warnings", "");
    for (const warning of context.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const context = buildBenchmarkReleaseContext({
    rootDir: process.cwd(),
    manifestPath: options.manifestPath,
    version: options.version,
  });
  const validation = validateBenchmarkReleaseContext(context);
  const content =
    options.format === "json"
      ? `${JSON.stringify({ ...context, validation }, null, 2)}\n`
      : renderMarkdown(context);
  const outputPath = options.outputPath || defaultOutputPath(context.version, options.format);

  writeOutput(outputPath, content);

  if (options.check && !validation.valid) {
    for (const issue of validation.issues) {
      console.error(`[benchmark-release-context] ${issue}`);
    }
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildBenchmarkReleaseContext,
  defaultOutputPath,
  renderMarkdown,
  validateBenchmarkReleaseContext,
};
