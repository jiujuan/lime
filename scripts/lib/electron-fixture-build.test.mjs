import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  electronFixtureBuildReadyEnv,
  electronFixtureBuildRequiredFiles,
  ensureElectronFixtureBuild,
  inspectElectronFixtureBuildFreshness,
} from "./electron-fixture-build.mjs";

const tempRoots = [];

function createTempRoot() {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "electron-fixture-build-"),
  );
  tempRoots.push(rootDir);
  return rootDir;
}

function writeFile(filePath, content, mtime) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  fs.utimesSync(filePath, mtime, mtime);
}

function writeRequiredFiles(rootDir, mtime) {
  for (const filePath of electronFixtureBuildRequiredFiles({ rootDir })) {
    writeFile(filePath, "fixture artifact", mtime);
  }
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();
    fs.rmSync(rootDir, { force: true, recursive: true });
  }
});

describe("electron fixture build freshness", () => {
  it("reuses packaged artifacts when build inputs are older", () => {
    const rootDir = createTempRoot();
    writeFile(
      path.join(rootDir, "src", "App.tsx"),
      "export const app = true;",
      new Date("2026-01-01T00:00:00.000Z"),
    );
    writeRequiredFiles(rootDir, new Date("2026-01-01T00:10:00.000Z"));

    const freshness = inspectElectronFixtureBuildFreshness({ rootDir });

    expect(freshness).toMatchObject({
      ready: true,
      reason: "fresh-artifacts",
      missingFiles: [],
    });
    expect(freshness.newestSource.relativePath).toBe(
      path.join("src", "App.tsx"),
    );
  });

  it("marks the current process build-ready when fresh artifacts are reused", () => {
    const rootDir = createTempRoot();
    const envKey = electronFixtureBuildReadyEnv();
    const previousEnv = process.env[envKey];
    const previousLog = console.log;
    delete process.env[envKey];
    writeFile(
      path.join(rootDir, "src", "App.tsx"),
      "export const app = true;",
      new Date("2026-01-01T00:00:00.000Z"),
    );
    writeRequiredFiles(rootDir, new Date("2026-01-01T00:10:00.000Z"));

    try {
      console.log = () => {};
      const result = ensureElectronFixtureBuild({
        rootDir,
        logPrefix: "electron-fixture-build-test",
      });

      expect(result).toMatchObject({
        status: "reused",
        reason: "fresh-artifacts",
      });
      expect(process.env[envKey]).toBe("1");
    } finally {
      if (previousEnv === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = previousEnv;
      }
      console.log = previousLog;
    }
  });

  it("marks packaged artifacts stale when a build input is newer", () => {
    const rootDir = createTempRoot();
    writeRequiredFiles(rootDir, new Date("2026-01-01T00:00:00.000Z"));
    writeFile(
      path.join(rootDir, "electron", "main.ts"),
      "export const main = true;",
      new Date("2026-01-01T00:10:00.000Z"),
    );

    const freshness = inspectElectronFixtureBuildFreshness({ rootDir });

    expect(freshness).toMatchObject({
      ready: false,
      reason: "stale-source",
      missingFiles: [],
    });
    expect(freshness.newestSource.relativePath).toBe(
      path.join("electron", "main.ts"),
    );
  });

  it("treats app-server asset helper changes as build inputs", () => {
    const rootDir = createTempRoot();
    writeRequiredFiles(rootDir, new Date("2026-01-01T00:00:00.000Z"));
    writeFile(
      path.join(rootDir, "scripts", "lib", "electron-app-server-assets.mjs"),
      "export const changed = true;",
      new Date("2026-01-01T00:10:00.000Z"),
    );

    const freshness = inspectElectronFixtureBuildFreshness({ rootDir });

    expect(freshness).toMatchObject({
      ready: false,
      reason: "stale-source",
      missingFiles: [],
    });
    expect(freshness.newestSource.relativePath).toBe(
      path.join("scripts", "lib", "electron-app-server-assets.mjs"),
    );
  });

  it("requires preload and packaged app-server artifacts", () => {
    const rootDir = createTempRoot();
    writeFile(
      path.join(rootDir, "dist", "index.html"),
      "<html></html>",
      new Date("2026-01-01T00:00:00.000Z"),
    );
    writeFile(
      path.join(rootDir, "dist-electron", "main", "main.js"),
      "console.log('main');",
      new Date("2026-01-01T00:00:00.000Z"),
    );
    writeFile(
      path.join(rootDir, "dist-electron", "app-server.release.json"),
      "{}",
      new Date("2026-01-01T00:00:00.000Z"),
    );

    const freshness = inspectElectronFixtureBuildFreshness({ rootDir });
    const missingRelativePaths = freshness.missingFiles.map((filePath) =>
      path.relative(rootDir, filePath),
    );

    expect(freshness.ready).toBe(false);
    expect(freshness.reason).toBe("missing-artifacts");
    expect(missingRelativePaths).toContain(
      path.join("dist-electron", "preload", "preload.cjs"),
    );
    expect(
      missingRelativePaths.some((filePath) =>
        filePath.startsWith(path.join("dist-electron", "app-server")),
      ),
    ).toBe(true);
  });
});
