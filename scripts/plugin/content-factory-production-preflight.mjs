#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildContentFactoryProductionPreflight,
  extractContentFactoryPackageFile,
  writeJsonFile,
} from "../lib/content-factory-production-preflight-core.mjs";
import {
  buildFetchCloudEvidence,
  descriptorFromCatalog,
} from "../lib/content-factory-production-fetch-cloud-evidence.mjs";
import { localAppServerBinaryPath } from "../lib/electron-dev-sidecar.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const DEFAULT_EVIDENCE_DIR = path.join(
  repoRoot,
  ".lime",
  "qc",
  "gui-evidence",
  "agent-apps",
);

function defaultContentFactoryDir() {
  return (
    process.env.CONTENT_FACTORY_APP_DIR?.trim() ||
    path.resolve(repoRoot, "..", "..", "limecloud", "content-factory-app")
  );
}

function defaultAppServerBin() {
  return (
    process.env.APP_SERVER_BIN?.trim() || localAppServerBinaryPath({ repoRoot })
  );
}

function parseArgs(argv) {
  const options = {
    appServerBin: defaultAppServerBin(),
    appServerInspectJson: "",
    appSignature: "",
    bootstrap: "",
    catalog: "",
    check: false,
    contentFactoryDir: defaultContentFactoryDir(),
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    expectedVersion: "",
    fetchCloud: "",
    fetchCloudFromCatalog: false,
    fetchCloudOutput: "",
    output: "",
    packageFile: "",
    prefix: "content-factory-production-preflight",
    skipAppServerInspect: false,
    timeoutMs: 30_000,
    trustRoot: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
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
    if (arg === "--app-server-bin" && next) {
      options.appServerBin = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--app-server-inspect-json" && next) {
      options.appServerInspectJson = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--skip-app-server-inspect") {
      options.skipAppServerInspect = true;
      continue;
    }
    if (arg === "--catalog" && next) {
      options.catalog = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--bootstrap" && next) {
      options.bootstrap = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--fetch-cloud" && next) {
      options.fetchCloud = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--fetch-cloud-from-catalog") {
      options.fetchCloudFromCatalog = true;
      continue;
    }
    if (arg === "--fetch-cloud-output" && next) {
      options.fetchCloudOutput = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--app-signature" && next) {
      options.appSignature = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--trust-root" && next) {
      options.trustRoot = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--expected-version" && next) {
      options.expectedVersion = next.trim();
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
    if (arg === "--output" && next) {
      options.output = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5_000) {
    throw new Error("--timeout-ms must be >= 5000");
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/plugin/content-factory-production-preflight.mjs [options]

Options:
  --content-factory-dir <dir>       content-factory-app directory.
  --package-file <file>             .lapp package file.
  --app-server-bin <path>           app-server binary for pluginLocalPackage/inspect.
  --app-server-inspect-json <path>  Reuse a saved pluginLocalPackage/inspect result.
  --skip-app-server-inspect         Do not run current App Server inspect; result remains blocked.
  --catalog <path>                  Production catalog/client plugins JSON.
  --bootstrap <path>                Production bootstrap JSON.
  --fetch-cloud <path>              pluginPackage/fetchCloud verification evidence JSON.
  --fetch-cloud-from-catalog        Call current App Server pluginPackage/fetchCloud from --catalog.
  --fetch-cloud-output <path>       Write generated fetchCloud evidence JSON when --fetch-cloud-from-catalog is used.
  --app-signature <path>            app.signature.yaml, defaults to package dir.
  --trust-root <path>               plugin-signature-trust-root.json, defaults to package dir.
  --expected-version <version>      Expected content-factory-app version.
  --evidence-dir <dir>              Evidence output directory.
  --prefix <name>                   Evidence filename prefix.
  --output <path>                   Write non-sensitive preflight JSON.
  --timeout-ms <ms>                 App Server inspect timeout.
  --check                           Exit non-zero unless all production inputs are ready.

This preflight computes local .lapp package facts and release gaps. Manifest hash
must come from current App Server pluginLocalPackage/inspect. It never signs,
uploads, installs, calls a Provider, or writes passing cloud_release evidence.`);
}

async function readAppServerClientDist() {
  const clientDistPath = path.join(
    repoRoot,
    "packages",
    "app-server-client",
    "dist",
    "index.js",
  );
  if (!fs.existsSync(clientDistPath)) {
    throw new Error(
      'packages/app-server-client/dist is missing; run npm --prefix "packages/app-server-client" run build',
    );
  }
  return await import(pathToFileURL(clientDistPath).href);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolvePackageFile(
  contentFactoryDir,
  explicitPackageFile,
  expectedVersion,
) {
  if (explicitPackageFile) return explicitPackageFile;
  const version =
    expectedVersion ||
    readJsonFile(path.join(contentFactoryDir, "package.json")).version;
  return path.join(
    contentFactoryDir,
    "dist-package",
    `content-factory-app-${version}.lapp`,
  );
}

async function inspectPackageWithAppServer(options, packageFile) {
  if (options.appServerInspectJson) {
    return readJsonFile(options.appServerInspectJson);
  }
  if (options.skipAppServerInspect) {
    return null;
  }
  if (!options.appServerBin || !fs.existsSync(options.appServerBin)) {
    throw new Error(
      `app-server binary 不存在: ${options.appServerBin}. Use --skip-app-server-inspect to produce a blocked preflight without current manifest hash.`,
    );
  }
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "content-factory-production-preflight-"),
  );
  const appDir = extractContentFactoryPackageFile(
    packageFile,
    path.join(tempRoot, "package"),
  );
  const { PROTOCOL_VERSION, connectAppServerSidecar, stdioSidecar } =
    await readAppServerClientDist();
  const connected = await connectAppServerSidecar(
    {
      ...stdioSidecar(options.appServerBin),
      backendMode: "unavailable",
    },
    {
      clientInfo: {
        name: "content-factory-production-preflight",
        version: "1.0.0",
      },
      capabilities: {},
    },
    {
      expectedProtocolVersion: PROTOCOL_VERSION,
      initializeTimeoutMs: options.timeoutMs,
    },
  );
  try {
    const request = connected.client.inspectPluginLocalPackage({ appDir });
    const response = await connected.connection.request(
      request,
      request.method,
      {
        timeoutMs: options.timeoutMs,
      },
    );
    return response.result;
  } finally {
    await connected.sidecar.close().catch(() => undefined);
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

async function fetchCloudWithAppServer(options) {
  if (!options.fetchCloudFromCatalog) return null;
  if (!options.catalog) {
    throw new Error("--fetch-cloud-from-catalog requires --catalog");
  }
  if (!options.appServerBin || !fs.existsSync(options.appServerBin)) {
    throw new Error(
      `app-server binary 不存在: ${options.appServerBin}. Cannot call pluginPackage/fetchCloud.`,
    );
  }
  const catalog = readJsonFile(options.catalog);
  const bootstrap = options.bootstrap ? readJsonFile(options.bootstrap) : {};
  const descriptor = descriptorFromCatalog(catalog);
  const { PROTOCOL_VERSION, connectAppServerSidecar, stdioSidecar } =
    await readAppServerClientDist();
  const connected = await connectAppServerSidecar(
    {
      ...stdioSidecar(options.appServerBin),
      backendMode: "unavailable",
    },
    {
      clientInfo: {
        name: "content-factory-production-preflight",
        version: "1.0.0",
      },
      capabilities: {},
    },
    {
      expectedProtocolVersion: PROTOCOL_VERSION,
      initializeTimeoutMs: options.timeoutMs,
    },
  );
  try {
    const request = connected.client.fetchPluginCloudPackage({ descriptor });
    const response = await connected.connection.request(
      request,
      request.method,
      {
        timeoutMs: options.timeoutMs,
      },
    );
    return buildFetchCloudEvidence({
      bootstrap,
      catalog,
      descriptor,
      result: response.result,
    });
  } catch (error) {
    return buildFetchCloudEvidence({ bootstrap, catalog, descriptor, error });
  } finally {
    await connected.sidecar.close().catch(() => undefined);
  }
}

function defaultOutputPath(options) {
  if (options.output) return options.output;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(options.evidenceDir, `${options.prefix}-${stamp}.json`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const packageFile = resolvePackageFile(
    options.contentFactoryDir,
    options.packageFile,
    options.expectedVersion,
  );
  const appServerInspect = await inspectPackageWithAppServer(
    options,
    packageFile,
  );
  const fetchCloudEvidence = await fetchCloudWithAppServer(options);
  if (fetchCloudEvidence && options.fetchCloudOutput) {
    writeJsonFile(options.fetchCloudOutput, fetchCloudEvidence);
  }
  const result = buildContentFactoryProductionPreflight({
    appServerInspect,
    appSignaturePath: options.appSignature,
    bootstrapPath: options.bootstrap,
    catalogPath: options.catalog,
    contentFactoryDir: options.contentFactoryDir,
    expectedVersion: options.expectedVersion,
    fetchCloudEvidence,
    fetchCloudPath: options.fetchCloud,
    packageFile,
    trustRootPath: options.trustRoot,
  });
  const outputPath = defaultOutputPath(options);
  writeJsonFile(outputPath, result);
  console.log(
    `[content-factory-production-preflight] status=${result.status} packageHash=${result.package.packageHash || "missing"} manifestHash=${result.package.manifestHash || "missing"} missing=${result.missingRequirements.length}`,
  );
  if (result.missingRequirements.length > 0) {
    console.log(
      `[content-factory-production-preflight] missingCodes=${result.missingRequirements
        .map((item) => item.code)
        .join(",")}`,
    );
  }
  const missingPublishEnv = result.publishReadiness.requirements
    .filter((item) =>
      item.key === "packageUrl" ? item.remoteHttps !== true : !item.configured,
    )
    .map((item) => item.key);
  console.log(
    `[content-factory-production-preflight] publishReadiness=${
      result.publishReadiness.configured ? "configured" : "missing"
    } missingPublishEnv=${missingPublishEnv.join(",") || "none"}`,
  );
  console.log(`[content-factory-production-preflight] output=${outputPath}`);
  if (fetchCloudEvidence && options.fetchCloudOutput) {
    console.log(
      `[content-factory-production-preflight] fetchCloudOutput=${options.fetchCloudOutput}`,
    );
  }
  if (options.check && result.status !== "ready") {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(
      `[content-factory-production-preflight] failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
