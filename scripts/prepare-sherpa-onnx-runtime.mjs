import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_SRC_TAURI_DIR = "src-tauri";
const SHERPA_RELEASE_BASE_URL =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download";

function fail(message) {
  throw new Error(message);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

export function resolveSherpaOnnxSysVersion(lockText) {
  const entry = lockText
    .split(/\r?\n\[\[package\]\]\r?\n/)
    .find((block) =>
      /(?:^|\r?\n)name = "sherpa-onnx-sys"(?:\r?\n|$)/.test(block),
    );
  if (!entry) {
    fail("Unable to find sherpa-onnx-sys in Cargo.lock");
  }

  const match = entry.match(/(?:^|\r?\n)version = "([^"]+)"/);
  if (!match) {
    fail("Unable to resolve sherpa-onnx-sys version from Cargo.lock");
  }

  return match[1];
}

export function resolveSherpaRuntimePlan({
  repoRoot = process.cwd(),
  srcTauriDir = DEFAULT_SRC_TAURI_DIR,
  targetTriple,
  version,
}) {
  if (!targetTriple) {
    fail("Missing target triple");
  }
  if (!version) {
    fail("Missing sherpa-onnx-sys version");
  }

  let archiveName;
  let libs;

  switch (targetTriple) {
    case "x86_64-pc-windows-msvc":
      archiveName = `sherpa-onnx-v${version}-win-x64-shared-MT-Release-lib.tar.bz2`;
      libs = ["onnxruntime.dll", "sherpa-onnx-c-api.dll"];
      break;
    case "aarch64-apple-darwin":
      archiveName = `sherpa-onnx-v${version}-osx-arm64-shared-lib.tar.bz2`;
      libs = [
        "libonnxruntime.1.24.4.dylib",
        "libonnxruntime.dylib",
        "libsherpa-onnx-c-api.dylib",
      ];
      break;
    case "x86_64-apple-darwin":
      archiveName = `sherpa-onnx-v${version}-osx-x64-shared-lib.tar.bz2`;
      libs = [
        "libonnxruntime.1.24.4.dylib",
        "libonnxruntime.dylib",
        "libsherpa-onnx-c-api.dylib",
      ];
      break;
    default:
      fail(`Unsupported sherpa-onnx release target: ${targetTriple}`);
  }

  const srcTauriRoot = path.resolve(repoRoot, srcTauriDir);
  const archiveStem = archiveName.replace(/\.tar\.bz2$/, "");
  const prebuiltRoot = path.join(
    srcTauriRoot,
    "target",
    "sherpa-onnx-prebuilt",
  );
  const archivePath = path.join(prebuiltRoot, archiveName);
  const extractedDir = path.join(prebuiltRoot, archiveStem);
  const libDir = path.join(extractedDir, "lib");
  const releaseDir = path.join(srcTauriRoot, "target", targetTriple, "release");
  const runtimeLibDir = path.join(
    srcTauriRoot,
    ".release-runtime-libs",
    targetTriple,
  );
  const url = `${SHERPA_RELEASE_BASE_URL}/v${version}/${archiveName}`;

  return {
    archiveName,
    archivePath,
    extractedDir,
    libDir,
    libs,
    prebuiltRoot,
    releaseDir,
    runtimeLibDir,
    targetTriple,
    url,
    version,
  };
}

function findExistingLib(root, libName) {
  if (!fs.existsSync(root)) {
    return null;
  }

  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (
        entry.name === libName &&
        path.basename(path.dirname(entryPath)) === "lib"
      ) {
        return entryPath;
      }
    }
  }

  return null;
}

function ensureArchiveExtracted(plan) {
  fs.mkdirSync(plan.prebuiltRoot, { recursive: true });

  if (!fs.existsSync(plan.libDir)) {
    if (!fs.existsSync(plan.archivePath)) {
      console.log(`Downloading sherpa-onnx shared runtime: ${plan.url}`);
      const partialPath = `${plan.archivePath}.part`;
      runCommand("curl", [
        "--fail",
        "--location",
        "--retry",
        "5",
        "--retry-connrefused",
        "--connect-timeout",
        "30",
        "--output",
        partialPath,
        plan.url,
      ]);
      fs.renameSync(partialPath, plan.archivePath);
    }

    fs.rmSync(plan.extractedDir, { recursive: true, force: true });
    runCommand("tar", ["-xjf", plan.archivePath, "-C", plan.prebuiltRoot]);
  }

  if (!fs.existsSync(plan.libDir)) {
    fail(
      `Downloaded sherpa-onnx archive did not contain expected lib directory: ${plan.libDir}`,
    );
  }
}

function copyRuntimeLibraries(plan) {
  fs.mkdirSync(plan.releaseDir, { recursive: true });
  fs.mkdirSync(plan.runtimeLibDir, { recursive: true });

  for (const lib of plan.libs) {
    const releasePath = path.join(plan.releaseDir, lib);
    const runtimePath = path.join(plan.runtimeLibDir, lib);

    let sourcePath = path.join(plan.libDir, lib);
    if (!fs.existsSync(sourcePath)) {
      sourcePath = findExistingLib(plan.prebuiltRoot, lib);
    }

    if (sourcePath && fs.existsSync(sourcePath)) {
      if (!fs.existsSync(releasePath)) {
        fs.copyFileSync(sourcePath, releasePath);
      }
      if (!fs.existsSync(runtimePath)) {
        fs.copyFileSync(sourcePath, runtimePath);
      }
    } else if (fs.existsSync(releasePath) && !fs.existsSync(runtimePath)) {
      fs.copyFileSync(releasePath, runtimePath);
    }

    if (!fs.existsSync(releasePath)) {
      fail(`Expected ONNX runtime shared library missing: ${releasePath}`);
    }
    if (!fs.existsSync(runtimePath)) {
      fail(
        `Expected staged ONNX runtime shared library missing: ${runtimePath}`,
      );
    }
  }
}

export function prepareSherpaOnnxRuntime({
  repoRoot = process.cwd(),
  srcTauriDir = DEFAULT_SRC_TAURI_DIR,
  targetTriple,
} = {}) {
  const lockPath = path.resolve(repoRoot, srcTauriDir, "Cargo.lock");
  const version = resolveSherpaOnnxSysVersion(
    fs.readFileSync(lockPath, "utf8"),
  );
  const plan = resolveSherpaRuntimePlan({
    repoRoot,
    srcTauriDir,
    targetTriple,
    version,
  });

  ensureArchiveExtracted(plan);
  copyRuntimeLibraries(plan);

  console.log(`Prepared sherpa-onnx shared libraries for ${plan.targetTriple}`);
  console.log(`Prebuilt lib dir: ${plan.libDir}`);
  console.log(`Release lib dir: ${plan.releaseDir}`);
  for (const lib of plan.libs) {
    console.log(` - ${lib}`);
  }

  return plan;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      options.targetTriple = argv[index + 1];
      index += 1;
    } else if (arg === "--src-tauri-dir") {
      options.srcTauriDir = argv[index + 1];
      index += 1;
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    prepareSherpaOnnxRuntime(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
