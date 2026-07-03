#!/usr/bin/env node

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

const APP_ID = "content-factory-app";
const WORKER_ENTRY = "src/runtime/content-factory-worker.mjs";
const DEFAULT_TIMEOUT_MS = 120_000;

function resolveDefaultContentFactoryDir() {
  if (process.env.CONTENT_FACTORY_APP_DIR) {
    return path.resolve(process.env.CONTENT_FACTORY_APP_DIR);
  }
  return path.resolve(
    process.cwd(),
    "..",
    "..",
    "limecloud",
    "content-factory-app",
  );
}

const DEFAULTS = {
  contentFactoryDir: resolveDefaultContentFactoryDir(),
  packageFile: "",
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "plugins",
  ),
  prefix: "content-factory-package-smoke",
  timeoutMs: DEFAULT_TIMEOUT_MS,
  runPackageTests: true,
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--content-factory-dir" && next) {
      options.contentFactoryDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--package-file" && next) {
      options.packageFile = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir" && next) {
      options.evidenceDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--prefix" && next) {
      options.prefix = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--skip-package-tests") {
      options.runPackageTests = false;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/plugin/content-factory-package-smoke.mjs [options]

Options:
  --content-factory-dir <dir>  content-factory-app directory, default ../../limecloud/content-factory-app
  --package-file <file>        .lapp package file, default dist-package/content-factory-app-<version>.lapp
  --evidence-dir <dir>         evidence output directory
  --prefix <name>              evidence filename prefix
  --timeout-ms <ms>            command timeout, default 120000
  --skip-package-tests         skip npm test and npm run validate:app in the external package
`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function commandName(command) {
  return process.platform === "win32" && command === "npm"
    ? "npm.cmd"
    : command;
}

function tail(value, maxLength = 6_000) {
  const text = String(value ?? "");
  return text.length > maxLength ? text.slice(-maxLength) : text;
}

async function runCommand(command, args, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return await new Promise((resolve, reject) => {
    const child = spawn(commandName(command), args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(options.env ?? {}) },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(
        new Error(
          `${command} ${args.join(" ")} timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const result = {
        command,
        args,
        cwd: options.cwd,
        exitCode: code,
        signal,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      };
      if (code === 0) {
        resolve(result);
        return;
      }
      const error = new Error(
        `${command} ${args.join(" ")} failed with exitCode=${code} signal=${signal ?? ""}`,
      );
      error.result = result;
      reject(error);
    });

    if (options.input) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function resolvePackageFile(
  contentFactoryDir,
  packageJson,
  explicitPackageFile,
) {
  if (explicitPackageFile) {
    assert(
      fsSync.existsSync(explicitPackageFile),
      `package file missing: ${explicitPackageFile}`,
    );
    return explicitPackageFile;
  }
  const preferred = path.join(
    contentFactoryDir,
    "dist-package",
    `${APP_ID}-${packageJson.version}.lapp`,
  );
  if (fsSync.existsSync(preferred)) {
    return preferred;
  }
  const distDir = path.join(contentFactoryDir, "dist-package");
  const entries = await fs.readdir(distDir, { withFileTypes: true });
  const packages = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".lapp"))
      .map(async (entry) => {
        const filePath = path.join(distDir, entry.name);
        const stat = await fs.stat(filePath);
        return { filePath, mtimeMs: stat.mtimeMs };
      }),
  );
  packages.sort((left, right) => right.mtimeMs - left.mtimeMs);
  assert(packages.length > 0, `no .lapp package found under ${distDir}`);
  return packages[0].filePath;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("zip end of central directory not found");
}

function readZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    assert(
      buffer.readUInt32LE(offset) === 0x02014b50,
      "invalid zip central directory",
    );
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = buffer
      .subarray(nameStart, nameStart + fileNameLength)
      .toString("utf8")
      .replace(/\\/g, "/");
    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = nameStart + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function findZipEntry(entries, expectedName) {
  return (
    entries.find((entry) => entry.name === expectedName) ??
    entries.find((entry) => entry.name.endsWith(`/${expectedName}`)) ??
    null
  );
}

function extractZipEntry(buffer, entry) {
  const offset = entry.localHeaderOffset;
  assert(
    buffer.readUInt32LE(offset) === 0x04034b50,
    `invalid local header for ${entry.name}`,
  );
  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(
    dataStart,
    dataStart + entry.compressedSize,
  );
  if (entry.compressionMethod === 0) {
    return compressed;
  }
  if (entry.compressionMethod === 8) {
    return zlib.inflateRawSync(compressed);
  }
  throw new Error(
    `unsupported zip compression method ${entry.compressionMethod} for ${entry.name}`,
  );
}

function extractZipText(buffer, entries, expectedName) {
  const entry = findZipEntry(entries, expectedName);
  assert(entry, `.lapp missing ${expectedName}`);
  return extractZipEntry(buffer, entry).toString("utf8");
}

function sha256(buffer) {
  return `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
}

function assertRuntimeContract(runtimeText) {
  const requiredTokens = [
    "entrypoint: ./src/runtime/content-factory-worker.mjs",
    "rightSurface: articleWorkspace",
    "key: content_article_workflow",
    "hostManagedGeneration:",
    "enabled: true",
    "article-draft-document",
    "outputField: documentText",
    "connectorRefs:",
    "hookPolicy:",
  ];
  for (const token of requiredTokens) {
    assert(
      runtimeText.includes(token),
      `app.runtime.yaml missing token: ${token}`,
    );
  }
}

function buildWorkerRequest(sampleRequest) {
  const hostMarkdown = [
    "# 宿主生成标题",
    "",
    "导语先说明为什么内容生产链路必须收敛到同一个可审计产物。",
    "",
    "## 第一节",
    "",
    "这里是宿主托管生成的第一段正文，用于证明 worker 消费真实 hostManagedGeneration 输出。",
    "",
    "## 第二节",
    "",
    "这里是第二段正文，段落级 partial 应该先于最终 response 输出。",
    "",
    "## 第三节",
    "",
    "这里是第三段正文，最终文章仍然回到 articleDraft.documentText。",
  ].join("\n");
  const hostManagedGeneration = {
    schemaVersion: "lime.plugin.host_managed_generation.v1",
    source: "content_factory_package_smoke",
    status: "completed",
    provider: "package-smoke-provider",
    model: "package-smoke-model",
    outputs: [
      {
        id: "article-draft-document",
        kind: "markdown_document",
        targetObjectKind: "articleDraft",
        outputField: "documentText",
        contentType: "text/markdown",
        content: hostMarkdown,
      },
    ],
  };
  return {
    ...sampleRequest,
    sessionId: "session-content-factory-package-smoke",
    turnId: "turn-content-factory-package-smoke",
    taskId: "task-content-factory-package-smoke",
    requestedAt: new Date().toISOString(),
    hostManagedGeneration,
    runtime: {
      ...(sampleRequest.runtime ?? {}),
      hostManagedGeneration: {
        enabled: true,
        requests: [
          {
            id: "article-draft-document",
            kind: "markdown_document",
            targetObjectKind: "articleDraft",
            outputField: "documentText",
          },
        ],
      },
      hostManagedGenerationResult: hostManagedGeneration,
    },
  };
}

function parseWorkerNdjson(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function articleFromArtifact(artifact) {
  const patch = artifact?.metadata?.contentFactoryWorkspacePatch;
  const article = patch?.objects?.find(
    (object) => object?.ref?.kind === "articleDraft",
  );
  assert(article, "artifact snapshot missing articleDraft object");
  return article;
}

function assertWorkerOutput(events) {
  assert(
    events.length >= 3,
    "worker output should contain progress events and final response",
  );
  const response = events.at(-1);
  assert(
    response.schemaVersion === "content-factory.worker-response.v1",
    "final response schema mismatch",
  );
  assert(response.appId === APP_ID, "final response appId mismatch");
  assert(response.status === "completed", "final response must be completed");
  const workflowConnectorEvents = events.filter(
    (event) =>
      event.kind === "runtime.event" &&
      event.eventType === "workflow.connector.requested",
  );
  assert(
    workflowConnectorEvents.length >= 1,
    "worker must emit workflow.connector.requested audit event",
  );
  assert(
    workflowConnectorEvents.every((event) => event.payload?.auditOnly === true),
    "workflow connector progress must be audit-only",
  );
  const artifactEvents = events.filter(
    (event) =>
      event.kind === "runtime.event" && event.eventType === "artifact.snapshot",
  );
  assert(
    artifactEvents.length >= 2,
    "worker must emit paragraph-level artifact.snapshot progress",
  );
  const partialLengths = artifactEvents.map((event, index) => {
    const artifact = event.payload?.artifact;
    assert(
      artifact?.metadata?.complete === false,
      "partial snapshot must not be complete",
    );
    assert(
      artifact.metadata.writePhase === "streaming",
      "partial snapshot writePhase mismatch",
    );
    assert(
      artifact.metadata.streamSource === "worker_delta",
      "partial snapshot streamSource mismatch",
    );
    assert(
      artifact.metadata.streamSequence === index + 1,
      "partial snapshot sequence mismatch",
    );
    const article = articleFromArtifact(artifact);
    assert(
      article.status === "generating",
      "partial article status must be generating",
    );
    return String(article.source?.documentText ?? "").length;
  });
  for (let index = 1; index < partialLengths.length; index += 1) {
    assert(
      partialLengths[index] > partialLengths[index - 1],
      "partial document length must increase",
    );
  }
  const finalArtifact = response.artifacts?.[0];
  assert(
    finalArtifact?.metadata?.complete === true,
    "final artifact must be complete",
  );
  const finalArticle = articleFromArtifact(finalArtifact);
  const finalText = String(finalArticle.source?.documentText ?? "");
  assert(
    finalText.includes("# 宿主生成标题"),
    "final article must use host-managed generation text",
  );
  assert(
    finalText.includes("第三段正文"),
    "final article must include full host-generated body",
  );
  assert(
    finalArticle.source?.hostManagedGeneration?.status === "completed",
    "final article must preserve hostManagedGeneration metadata",
  );
  assert(
    partialLengths.at(-1) < finalText.length,
    "last partial must remain smaller than final document text",
  );
  return {
    workflowConnectorEventCount: workflowConnectorEvents.length,
    paragraphPartialCount: artifactEvents.length,
    firstPartialLength: partialLengths[0],
    lastPartialLength: partialLengths.at(-1),
    finalDocumentLength: finalText.length,
    hostManagedGenerationStatus:
      finalArticle.source.hostManagedGeneration.status,
  };
}

async function runPackageSmoke(options) {
  const contentFactoryDir = options.contentFactoryDir;
  assert(
    fsSync.existsSync(contentFactoryDir),
    `content factory dir missing: ${contentFactoryDir}`,
  );
  const packageJson = await readJson(
    path.join(contentFactoryDir, "package.json"),
  );
  const pluginJson = await readJson(
    path.join(contentFactoryDir, "plugin.json"),
  );
  assert(packageJson.name === APP_ID, "package.json name mismatch");
  assert(pluginJson.id === APP_ID, "plugin.json id mismatch");
  assert(
    pluginJson.version === packageJson.version,
    "plugin.json version must match package.json",
  );

  const runtimeText = await fs.readFile(
    path.join(contentFactoryDir, "app.runtime.yaml"),
    "utf8",
  );
  assertRuntimeContract(runtimeText);

  const packageFile = await resolvePackageFile(
    contentFactoryDir,
    packageJson,
    options.packageFile,
  );
  const packageBuffer = await fs.readFile(packageFile);
  const packageHash = sha256(packageBuffer);
  const zipEntries = readZipEntries(packageBuffer);
  const requiredPackageEntries = [
    "plugin.json",
    "app.runtime.yaml",
    "app.workbench.yaml",
    "src/runtime/content-factory-worker.mjs",
    "src/runtime/article-planning.mjs",
    "examples/runtime-request.sample.json",
    "workflows/content-article.workflow.md",
    "skills/article-writing/SKILL.md",
    "connectors/connectors.json",
    "hooks/prompt-submit.mjs",
  ];
  const missingPackageEntries = requiredPackageEntries.filter(
    (entry) => !findZipEntry(zipEntries, entry),
  );
  assert(
    missingPackageEntries.length === 0,
    `.lapp missing required entries: ${missingPackageEntries.join(", ")}`,
  );
  const zipPluginJson = JSON.parse(
    extractZipText(packageBuffer, zipEntries, "plugin.json"),
  );
  const zipRuntimeText = extractZipText(
    packageBuffer,
    zipEntries,
    "app.runtime.yaml",
  );
  assert(zipPluginJson.id === APP_ID, ".lapp plugin.json id mismatch");
  assert(
    zipPluginJson.version === packageJson.version,
    ".lapp plugin.json version mismatch",
  );
  assertRuntimeContract(zipRuntimeText);

  const commandResults = [];
  if (options.runPackageTests) {
    commandResults.push(
      await runCommand("npm", ["test"], {
        cwd: contentFactoryDir,
        timeoutMs: options.timeoutMs,
      }),
    );
    commandResults.push(
      await runCommand("npm", ["run", "validate:app"], {
        cwd: contentFactoryDir,
        timeoutMs: options.timeoutMs,
      }),
    );
  }

  const sampleRequest = await readJson(
    path.join(contentFactoryDir, "examples", "runtime-request.sample.json"),
  );
  const workerRequest = buildWorkerRequest(sampleRequest);
  const workerResult = await runCommand("node", [WORKER_ENTRY], {
    cwd: contentFactoryDir,
    input: `${JSON.stringify(workerRequest)}\n`,
    timeoutMs: options.timeoutMs,
  });
  const workerEvents = parseWorkerNdjson(workerResult.stdout);
  const workerSummary = assertWorkerOutput(workerEvents);

  await fs.mkdir(options.evidenceDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const workerJsonlPath = path.join(
    options.evidenceDir,
    `${options.prefix}-${stamp}.worker.jsonl`,
  );
  const evidencePath = path.join(
    options.evidenceDir,
    `${options.prefix}-${stamp}.json`,
  );
  await fs.writeFile(workerJsonlPath, workerResult.stdout, "utf8");
  const evidence = {
    schemaVersion: "content-factory-package-smoke.v1",
    status: "passed",
    generatedAt: new Date().toISOString(),
    platform: {
      os: os.platform(),
      arch: os.arch(),
      node: process.version,
    },
    contentFactoryDir,
    packageFile,
    packageHash,
    appId: APP_ID,
    version: packageJson.version,
    packageEntryCount: zipEntries.length,
    requiredPackageEntries,
    packageManifest: {
      id: zipPluginJson.id,
      version: zipPluginJson.version,
      runtimeContribution: zipPluginJson.contributions?.runtime,
      workbenchContribution: zipPluginJson.contributions?.workbench,
    },
    commandResults: commandResults.map((result) => ({
      command: [result.command, ...result.args].join(" "),
      durationMs: result.durationMs,
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
    })),
    worker: {
      command: `node ${WORKER_ENTRY}`,
      durationMs: workerResult.durationMs,
      outputJsonl: workerJsonlPath,
      eventCount: workerEvents.length,
      ...workerSummary,
    },
  };
  await fs.writeFile(
    evidencePath,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  return { evidence, evidencePath, workerJsonlPath };
}

async function writeFailureEvidence(options, error) {
  if (!options) {
    return "";
  }
  await fs.mkdir(options.evidenceDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const failurePath = path.join(
    options.evidenceDir,
    `${options.prefix}-${stamp}.failure.json`,
  );
  const result = error?.result;
  const evidence = {
    schemaVersion: "content-factory-package-smoke.v1",
    status: "failed",
    generatedAt: new Date().toISOString(),
    contentFactoryDir: options.contentFactoryDir,
    packageFile: options.packageFile || "",
    error: {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : "",
    },
    commandResult: result
      ? {
          command: [result.command, ...result.args].join(" "),
          durationMs: result.durationMs,
          exitCode: result.exitCode,
          signal: result.signal,
          stdoutTail: tail(result.stdout),
          stderrTail: tail(result.stderr),
        }
      : null,
  };
  await fs.writeFile(
    failurePath,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  return failurePath;
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
  const result = await runPackageSmoke(options);
  console.log(
    `[content-factory-package-smoke] status=passed version=${result.evidence.version} partials=${result.evidence.worker.paragraphPartialCount}`,
  );
  console.log(
    `[content-factory-package-smoke] evidence=${result.evidencePath}`,
  );
  console.log(
    `[content-factory-package-smoke] workerJsonl=${result.workerJsonlPath}`,
  );
} catch (error) {
  const failurePath = await writeFailureEvidence(options, error).catch(
    () => "",
  );
  if (failurePath) {
    console.error(
      `[content-factory-package-smoke] failureEvidence=${failurePath}`,
    );
  }
  console.error(
    `[content-factory-package-smoke] failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
