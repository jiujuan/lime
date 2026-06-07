#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }

    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function normalizeDarwinArch(value = process.arch) {
  if (value === "arm64" || value === "x64") {
    return value;
  }
  throw new Error(`unsupported macOS zip arch: ${value}`);
}

function feedLabelForDarwinArch(arch = process.arch) {
  return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
}

function defaultReleasesManifest() {
  return {
    currentRelease: "",
    releases: [],
  };
}

function readReleasesManifest(filePath) {
  if (!filePath) {
    return defaultReleasesManifest();
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`invalid RELEASES.json manifest: ${filePath}`);
  }
  return {
    currentRelease:
      typeof parsed.currentRelease === "string" ? parsed.currentRelease : "",
    releases: Array.isArray(parsed.releases) ? parsed.releases : [],
  };
}

function forgeCliPath(cwd = process.cwd()) {
  return path.join(
    cwd,
    "node_modules",
    "@electron-forge",
    "cli",
    "dist",
    "electron-forge.js",
  );
}

function defaultOutDir(cwd = process.cwd()) {
  return path.join(cwd, ".tmp", "electron-forge-local-feed");
}

function defaultPackageRoot(cwd = process.cwd()) {
  return path.join(cwd, "release-electron");
}

function packageDirNameForDarwinArch(arch) {
  return `Lime-darwin-${arch}`;
}

function prepareIsolatedPackageDir({ arch, cwd, outDir, packageRoot }) {
  const source = path.join(packageRoot, packageDirNameForDarwinArch(arch));
  if (!fs.existsSync(source)) {
    throw new Error(
      `packaged app is missing: ${source}; run npm run electron:package:dir first`,
    );
  }

  const destination = path.join(outDir, packageDirNameForDarwinArch(arch));
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.symlinkSync(path.relative(outDir, source), destination, "dir");
  return {
    destination,
    relativeSource: path.relative(cwd, source),
    source,
  };
}

function prepareIsolatedMakeDir({ arch, outDir }) {
  const makeDir = path.join(outDir, "make", "zip", "darwin", arch);
  fs.rmSync(makeDir, { recursive: true, force: true });
  return makeDir;
}

function buildForgeMakeZipArgs({
  arch,
  cwd = process.cwd(),
  skipPackage = true,
} = {}) {
  const args = [forgeCliPath(cwd), "make"];
  if (skipPackage) {
    args.push("--skip-package");
  }
  args.push("--platform", "darwin", "--arch", arch, "--targets", "zip");
  return args;
}

function assertSingleCurrentVersionZip({ makeDir, packageVersion }) {
  const zipFiles = fs
    .readdirSync(makeDir)
    .filter((name) => name.endsWith(".zip"))
    .sort();
  const expectedSuffix = `-${packageVersion}.zip`;
  const matchingZipFiles = zipFiles.filter((name) =>
    name.endsWith(expectedSuffix),
  );

  if (matchingZipFiles.length !== 1 || zipFiles.length !== 1) {
    throw new Error(
      `Forge ZIP make must generate exactly one current ${packageVersion} zip under ${makeDir}; found ${zipFiles.join(", ") || "(none)"}`,
    );
  }
  return matchingZipFiles.map((name) => path.join(makeDir, name));
}

function createLocalReleasesServer({ feedPath, releasesManifest }) {
  const manifestBody = `${JSON.stringify(releasesManifest)}\n`;

  return http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === `${feedPath}/RELEASES.json`) {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(manifestBody);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found\n");
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`electron-forge make zip exited with code ${code}`));
    });
  });
}

async function makeZipWithLocalFeed({
  arch = process.arch,
  cwd = process.cwd(),
  existingReleases,
  outDir = defaultOutDir(cwd),
  packageRoot = defaultPackageRoot(cwd),
  spawnFn = spawn,
  stdio = "inherit",
} = {}) {
  const normalizedArch = normalizeDarwinArch(arch);
  const resolvedOutDir = path.resolve(cwd, outDir);
  const resolvedPackageRoot = path.resolve(cwd, packageRoot);
  const feedLabel = feedLabelForDarwinArch(normalizedArch);
  const feedPath = `/lime/stable/${feedLabel}`;
  const releasesManifest = readReleasesManifest(existingReleases);
  const packageVersion = JSON.parse(
    fs.readFileSync(path.join(cwd, "package.json"), "utf8"),
  ).version;
  const packageLink = prepareIsolatedPackageDir({
    arch: normalizedArch,
    cwd,
    outDir: resolvedOutDir,
    packageRoot: resolvedPackageRoot,
  });
  const makeDir = prepareIsolatedMakeDir({
    arch: normalizedArch,
    outDir: resolvedOutDir,
  });
  const server = createLocalReleasesServer({
    feedPath,
    releasesManifest,
  });

  await listen(server);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const feedUrl = `http://127.0.0.1:${port}${feedPath}`;

  try {
    const child = spawnFn(
      process.execPath,
      buildForgeMakeZipArgs({
        arch: normalizedArch,
        cwd,
      }),
      {
        cwd,
        env: {
          ...process.env,
          LIME_ELECTRON_FORGE_OUT_DIR: resolvedOutDir,
          LIME_ELECTRON_UPDATES_URL: feedUrl,
          TMPDIR: process.env.TMPDIR || os.tmpdir(),
        },
        stdio,
      },
    );
    await waitForChild(child);
    const releasesPath = path.join(makeDir, "RELEASES.json");
    if (!fs.existsSync(releasesPath)) {
      throw new Error(`Forge ZIP make did not generate ${releasesPath}`);
    }
    const zipFiles = assertSingleCurrentVersionZip({
      makeDir,
      packageVersion,
    });

    return {
      arch: normalizedArch,
      feedUrl,
      outDir: resolvedOutDir,
      packageLink,
      releasesPath,
      zipFiles,
    };
  } finally {
    await close(server);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await makeZipWithLocalFeed({
    arch: args.arch || process.arch,
    existingReleases: args["existing-releases"],
    outDir: args["out-dir"],
    packageRoot: args["package-root"],
  });
  console.log(
    `Electron Forge macOS ZIP make completed with local update feed: ${result.feedUrl}`,
  );
  console.log(`Artifacts: ${path.relative(process.cwd(), result.outDir)}`);
  console.log(`Packaged app: ${result.packageLink.relativeSource}`);
  console.log(
    `RELEASES.json: ${path.relative(process.cwd(), result.releasesPath)}`,
  );
  for (const zipFile of result.zipFiles) {
    console.log(`ZIP: ${path.relative(process.cwd(), zipFile)}`);
  }
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export {
  assertSingleCurrentVersionZip,
  buildForgeMakeZipArgs,
  createLocalReleasesServer,
  defaultOutDir,
  defaultPackageRoot,
  feedLabelForDarwinArch,
  makeZipWithLocalFeed,
  normalizeDarwinArch,
  parseArgs,
  prepareIsolatedPackageDir,
  prepareIsolatedMakeDir,
  readReleasesManifest,
};
