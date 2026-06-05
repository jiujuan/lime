import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PROTOCOL_VERSION, sha256Hex } from "../packages/app-server-client/dist/index.js";
import {
  buildAppServerReleaseManifest,
  parseArgs,
  writeAppServerReleaseManifest,
} from "./app-server-release-manifest.mjs";

test("parses app-server manifest CLI args", () => {
  assert.deepEqual(
    parseArgs([
      "--binary",
      "target/app-server",
      "--url",
      "https://example/app-server.tar.gz",
      "--platform",
      "darwin-arm64",
      "--out",
      "manifest.json",
    ]),
    {
      binary: "target/app-server",
      url: "https://example/app-server.tar.gz",
      platform: "darwin-arm64",
      out: "manifest.json",
    },
  );
});

test("builds release manifest with sha256", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-manifest-"));
  const binaryPath = join(dir, "app-server");

  try {
    await writeFile(binaryPath, "sidecar-binary");

    const manifest = await buildAppServerReleaseManifest({
      binary: binaryPath,
      url: "https://example/app-server-darwin-arm64.tar.gz",
      platform: "darwin-arm64",
      version: "1.59.0",
    });

    assert.deepEqual(manifest, {
      version: "1.59.0",
      protocolVersion: PROTOCOL_VERSION,
      artifacts: [
        {
          platform: "darwin-arm64",
          url: "https://example/app-server-darwin-arm64.tar.gz",
          sha256: sha256Hex("sidecar-binary"),
        },
      ],
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writes release manifest file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "app-server-manifest-write-"));
  const binaryPath = join(dir, "app-server");
  const outPath = join(dir, "manifest.json");

  try {
    await writeFile(binaryPath, "sidecar-binary");

    const result = await writeAppServerReleaseManifest({
      binary: binaryPath,
      url: "https://example/app-server-darwin-arm64.tar.gz",
      platform: "darwin-arm64",
      version: "1.59.0",
      out: outPath,
    });

    const written = JSON.parse(await readFile(outPath, "utf8"));
    assert.equal(result.outPath, outPath);
    assert.deepEqual(written, result.manifest);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
