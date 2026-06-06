import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const clientDistPath = path.join(repoRoot, "packages", "app-server-client", "dist", "index.js");
const { PROTOCOL_VERSION, platformKey, sha256File } = await import(pathToFileURL(clientDistPath).href);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }

    const key = item.slice(2);
    const next = argv[index + 1];
    const value = !next || next.startsWith("--") ? "true" : next;
    if (value !== "true") {
      index += 1;
    }
    args[key] = value;
  }
  return args;
}

function readPackageVersion(packageJsonPath = path.join(repoRoot, "package.json")) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const version = String(packageJson.version || "").trim();
  if (!version) {
    throw new Error(`package version is missing: ${packageJsonPath}`);
  }
  return version;
}

async function buildAppServerReleaseManifest(options) {
  const binaryPath = path.resolve(requiredOption(options.binary, "binary"));
  const url = requiredOption(options.url, "url");
  const version = String(options.version || readPackageVersion()).trim();
  const platform = String(options.platform || platformKey()).trim();

  if (!fs.existsSync(binaryPath) || !fs.statSync(binaryPath).isFile()) {
    throw new Error(`app-server binary is missing: ${binaryPath}`);
  }
  if (!version) {
    throw new Error("version is required");
  }
  if (!platform) {
    throw new Error("platform is required");
  }

  return {
    version,
    protocolVersion: PROTOCOL_VERSION,
    artifacts: [
      {
        platform,
        url,
        sha256: await sha256File(binaryPath),
      },
    ],
  };
}

async function writeAppServerReleaseManifest(options) {
  const manifest = await buildAppServerReleaseManifest(options);
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  if (options.out) {
    const outPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content);
    return {
      manifest,
      outPath,
    };
  }

  process.stdout.write(content);
  return {
    manifest,
    outPath: "",
  };
}

function requiredOption(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`--${name} is required`);
  }
  return normalized;
}

function printUsage() {
  console.log(`Usage:
  node scripts/app-server-release-manifest.mjs \\
    --binary lime-rs/target/debug/app-server \\
    --url https://example/app-server-darwin-arm64.tar.gz \\
    [--platform darwin-arm64] [--version 1.59.0] [--out dist/app-server/manifest.json]`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const result = await writeAppServerReleaseManifest({
    binary: args.binary,
    url: args.url,
    platform: args.platform,
    version: args.version,
    out: args.out,
  });

  if (result.outPath) {
    console.log(`[app-server:manifest] wrote ${path.relative(process.cwd(), result.outPath)}`);
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isCli) {
  main().catch((error) => {
    console.error(`[app-server:manifest] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

export {
  buildAppServerReleaseManifest,
  parseArgs,
  readPackageVersion,
  writeAppServerReleaseManifest,
};
