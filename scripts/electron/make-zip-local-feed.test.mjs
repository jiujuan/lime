import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertSingleCurrentVersionZip,
  buildForgeMakeZipArgs,
  createLocalReleasesServer,
  defaultOutDir,
  defaultPackageRoot,
  feedLabelForDarwinArch,
  normalizeDarwinArch,
  parseArgs,
  prepareIsolatedPackageDir,
  prepareIsolatedMakeDir,
} from "./make-zip-local-feed.mjs";

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

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            body,
            statusCode: response.statusCode,
          });
        });
      })
      .on("error", reject);
  });
}

describe("Electron Forge macOS ZIP local feed helper", () => {
  it("maps macOS arches to current updater feeds", () => {
    expect(feedLabelForDarwinArch("arm64")).toBe("darwin-arm64");
    expect(feedLabelForDarwinArch("x64")).toBe("darwin-x64");
    expect(defaultOutDir("/repo")).toBe(
      path.join("/repo", ".tmp", "electron-forge-local-feed"),
    );
    expect(defaultPackageRoot("/repo")).toBe(
      path.join("/repo", "release-electron"),
    );
    expect(() => normalizeDarwinArch("ia32")).toThrow(
      /unsupported macOS zip arch/,
    );
  });

  it("builds the Forge ZIP make argv without old builder or updater entrypoints", () => {
    const args = buildForgeMakeZipArgs({
      arch: "arm64",
      cwd: "/repo",
    });

    expect(args).toEqual([
      path.join(
        "/repo",
        "node_modules",
        "@electron-forge",
        "cli",
        "dist",
        "electron-forge.js",
      ),
      "make",
      "--skip-package",
      "--platform",
      "darwin",
      "--arch",
      "arm64",
      "--targets",
      "zip",
    ]);
    expect(args.join(" ")).not.toContain("electron-builder");
    expect(args.join(" ")).not.toContain("latest-mac.yml");
  });

  it("serves a deterministic RELEASES.json for MakerZIP manifest generation", async () => {
    const server = createLocalReleasesServer({
      feedPath: "/lime/stable/darwin-arm64",
      releasesManifest: {
        currentRelease: "1.58.0",
        releases: [{ version: "1.58.0" }],
      },
    });

    await listen(server);
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const response = await getJson(
        `http://127.0.0.1:${port}/lime/stable/darwin-arm64/RELEASES.json`,
      );

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        currentRelease: "1.58.0",
        releases: [{ version: "1.58.0" }],
      });
    } finally {
      await close(server);
    }
  });

  it("parses CLI args", () => {
    expect(
      parseArgs(["--arch", "x64", "--existing-releases", "tmp/RELEASES.json"]),
    ).toEqual({
      arch: "x64",
      "existing-releases": "tmp/RELEASES.json",
    });
  });

  it("links the existing package into the isolated Forge outDir", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lime-forge-zip-link-"));
    const packageRoot = path.join(root, "release-electron");
    const outDir = path.join(root, ".tmp", "electron-forge-local-feed");
    fs.mkdirSync(path.join(packageRoot, "Lime-darwin-arm64"), {
      recursive: true,
    });

    const result = prepareIsolatedPackageDir({
      arch: "arm64",
      cwd: root,
      outDir,
      packageRoot,
    });

    expect(result.relativeSource).toBe(
      path.join("release-electron", "Lime-darwin-arm64"),
    );
    expect(fs.lstatSync(result.destination).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(result.destination)).toBe(
      fs.realpathSync(result.source),
    );
  });

  it("cleans the isolated make output before generating a new ZIP", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lime-forge-zip-make-"));
    const outDir = path.join(root, ".tmp", "electron-forge-local-feed");
    const makeDir = path.join(outDir, "make", "zip", "darwin", "arm64");
    fs.mkdirSync(makeDir, { recursive: true });
    fs.writeFileSync(path.join(makeDir, "Lime-darwin-arm64-1.59.0.zip"), "");

    expect(prepareIsolatedMakeDir({ arch: "arm64", outDir })).toBe(makeDir);
    expect(fs.existsSync(makeDir)).toBe(false);
  });

  it("rejects stale ZIP versions in local feed evidence", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-forge-zip-stale-"),
    );
    fs.writeFileSync(path.join(root, "Lime-darwin-arm64-1.59.0.zip"), "");
    fs.writeFileSync(path.join(root, "Lime-darwin-arm64-1.60.0.zip"), "");

    expect(() =>
      assertSingleCurrentVersionZip({
        makeDir: root,
        packageVersion: "1.60.0",
      }),
    ).toThrow(/exactly one current 1\.60\.0 zip/);

    fs.rmSync(path.join(root, "Lime-darwin-arm64-1.59.0.zip"));
    expect(
      assertSingleCurrentVersionZip({
        makeDir: root,
        packageVersion: "1.60.0",
      }).map((filePath) => path.basename(filePath)),
    ).toEqual(["Lime-darwin-arm64-1.60.0.zip"]);
  });
});
