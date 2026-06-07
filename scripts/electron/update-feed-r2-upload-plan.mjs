#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_TO_FEED = {
  "aarch64-apple-darwin": "darwin-arm64",
  "x86_64-apple-darwin": "darwin-x64",
  "x86_64-pc-windows-msvc": "win32-x64",
};

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

function walkFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const result = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(filePath);
      } else if (entry.isFile()) {
        result.push(filePath);
      }
    }
  }
  return result.sort();
}

function normalizeVersionTag(value) {
  const version = String(value || "").trim();
  if (!version) {
    throw new Error("version is required");
  }
  return `v${version.replace(/^v/, "")}`;
}

function contentTypeFor(filePath) {
  const basename = path.basename(filePath);
  if (basename === "RELEASES.json") {
    return "application/json";
  }
  if (basename === "RELEASES") {
    return "text/plain";
  }
  return "application/octet-stream";
}

function cacheControlFor(filePath) {
  if (/^RELEASES(?:\.json)?$/i.test(path.basename(filePath))) {
    return "public, max-age=60, stale-while-revalidate=300";
  }
  return "public, max-age=31536000, immutable";
}

function isElectronUpdaterAsset(filePath) {
  const basename = path.basename(filePath);
  if (/^RELEASES(?:\.json)?$/i.test(basename)) {
    return true;
  }
  return /\.(dmg|exe|nupkg|zip)$/i.test(basename);
}

function assertNoRetiredUpdaterAssets(files) {
  const legacy = files.filter((file) =>
    /(?:\.app\.tar\.gz|\.sig|latest(?:-mac)?\.yml|\.blockmap|latest\.json)$/i.test(
      path.basename(file),
    ),
  );
  if (legacy.length > 0) {
    throw new Error(
      `legacy updater assets are not allowed in Electron release: ${legacy.join(", ")}`,
    );
  }
}

function buildElectronUpdateFeedUploadPlan({
  assetsDir = "release-assets",
  bucket = "lime-releases",
  channel = "stable",
  version,
} = {}) {
  const root = path.resolve(assetsDir);
  const versionTag = normalizeVersionTag(version);
  const files = walkFiles(root);
  assertNoRetiredUpdaterAssets(files);

  const items = [];
  for (const file of files) {
    const targetTriple = path.relative(root, file).split(path.sep)[0] || "";
    const feed = TARGET_TO_FEED[targetTriple];
    if (!feed || !isElectronUpdaterAsset(file)) {
      continue;
    }
    const key = `lime/${channel}/${feed}/${path.basename(file)}`;
    const versionedKey = `lime/${channel}/${versionTag}/${feed}/${path.basename(file)}`;
    for (const itemKey of [key, versionedKey]) {
      items.push({
        bucket,
        cacheControl: cacheControlFor(file),
        contentType: contentTypeFor(file),
        file,
        key: itemKey,
      });
    }
  }

  if (items.length === 0) {
    throw new Error(`no Electron updater assets found under ${root}`);
  }
  return items.sort((left, right) => left.key.localeCompare(right.key));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildElectronUpdateFeedUploadPlan({
    assetsDir: args["assets-dir"],
    bucket:
      args.bucket || process.env.LIME_RELEASES_R2_BUCKET || "lime-releases",
    channel: args.channel || process.env.LIME_RELEASE_CHANNEL || "stable",
    version:
      args.version || process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME,
  });

  const outFile = args.output;
  if (outFile) {
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(plan, null, 2)}\n`);
  } else {
    console.log(JSON.stringify(plan, null, 2));
  }
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main();
}

export { buildElectronUpdateFeedUploadPlan };
