import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildElectronUpdaterUploadPlan } from "./plan-electron-updater-r2-upload.mjs";
import { planR2ReleaseCleanup } from "./plan-r2-release-cleanup.mjs";
import { prepareGitHubReleaseAssets } from "./prepare-github-release-assets.mjs";

function writeFile(filePath, content = "asset") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

describe("Electron updater upload plan", () => {
  it("同名跨平台 Electron updater 资产应写入 feed 与版本化 R2 路径", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-electron-updater-plan-"),
    );
    const assetsDir = path.join(root, "release-assets");

    writeFile(
      path.join(assetsDir, "aarch64-apple-darwin", "Lime_1.20.0_aarch64.dmg"),
      "arm-installer",
    );
    writeFile(
      path.join(assetsDir, "aarch64-apple-darwin", "latest-mac.yml"),
      "arm-feed",
    );
    writeFile(
      path.join(assetsDir, "x86_64-apple-darwin", "Lime_1.20.0_x64.dmg"),
      "x64-installer",
    );
    writeFile(
      path.join(assetsDir, "x86_64-apple-darwin", "latest-mac.yml"),
      "x64-feed",
    );
    writeFile(
      path.join(
        assetsDir,
        "x86_64-pc-windows-msvc",
        "Lime_1.20.0_x64-setup.exe",
      ),
      "win-installer",
    );
    writeFile(
      path.join(assetsDir, "x86_64-pc-windows-msvc", "latest.yml"),
      "win-feed",
    );

    const plan = buildElectronUpdaterUploadPlan({
      assetsDir,
      channel: "stable",
      version: "v1.20.0",
    });

    expect(plan.map((item) => item.key)).toEqual([
      "lime/stable/darwin-arm64/latest-mac.yml",
      "lime/stable/darwin-arm64/Lime_1.20.0_aarch64.dmg",
      "lime/stable/darwin-x64/latest-mac.yml",
      "lime/stable/darwin-x64/Lime_1.20.0_x64.dmg",
      "lime/stable/v1.20.0/darwin-arm64/latest-mac.yml",
      "lime/stable/v1.20.0/darwin-arm64/Lime_1.20.0_aarch64.dmg",
      "lime/stable/v1.20.0/darwin-x64/latest-mac.yml",
      "lime/stable/v1.20.0/darwin-x64/Lime_1.20.0_x64.dmg",
      "lime/stable/v1.20.0/win32-x64/latest.yml",
      "lime/stable/v1.20.0/win32-x64/Lime_1.20.0_x64-setup.exe",
      "lime/stable/win32-x64/latest.yml",
      "lime/stable/win32-x64/Lime_1.20.0_x64-setup.exe",
    ]);
    expect(
      plan
        .filter((item) => /^latest(?:-mac)?\.yml$/.test(path.basename(item.file)))
        .every((item) => item.cacheControl.includes("max-age=60")),
    ).toBe(true);
  });

  it("拒绝旧 updater 资产进入 Electron R2 上传计划", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-electron-updater-legacy-"),
    );
    writeFile(
      path.join(
        root,
        "release-assets",
        "aarch64-apple-darwin",
        "Lime.app.tar.gz",
      ),
    );

    expect(() =>
      buildElectronUpdaterUploadPlan({
        assetsDir: path.join(root, "release-assets"),
        version: "v1.20.0",
      }),
    ).toThrow(/legacy updater assets/);
  });
});

describe("R2 release cleanup", () => {
  it("只删除超过保留窗口且未受保护的旧版本", () => {
    const keys = [
      "lime/stable/v1.20.0/win32-x64/latest.yml",
      "lime/stable/v1.20.0/win32-x64/Lime_1.20.0_x64-setup.exe",
      "lime/stable/v1.19.0/win32-x64/Lime_1.19.0_x64-setup.exe",
      "lime/stable/v1.18.0/win32-x64/Lime_1.18.0_x64-setup.exe",
      "lime/stable/v1.17.0/win32-x64/Lime_1.17.0_x64-setup.exe",
      "lime/stable/v1.16.0/win32-x64/Lime_1.16.0_x64-setup.exe",
    ];

    const plan = planR2ReleaseCleanup({
      currentVersion: "v1.20.0",
      keep: 3,
      keys,
      minimumSupportedVersion: "v1.16.0",
    });

    expect(plan.deleteKeys).toEqual([
      "lime/stable/v1.17.0/win32-x64/Lime_1.17.0_x64-setup.exe",
    ]);
    expect(plan.protectedVersions).toContain("1.16.0");
  });
});

describe("GitHub release asset staging", () => {
  it("同名 Electron updater metadata 上传 GitHub Release 前应按平台重命名", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-github-release-assets-"),
    );
    const assetsDir = path.join(root, "release-assets");
    const outDir = path.join(root, "release-github-assets");

    writeFile(
      path.join(assetsDir, "aarch64-apple-darwin", "latest-mac.yml"),
      "arm-feed",
    );
    writeFile(
      path.join(assetsDir, "aarch64-apple-darwin", "Lime_1.29.0_aarch64.dmg"),
    );
    writeFile(
      path.join(assetsDir, "x86_64-apple-darwin", "latest-mac.yml"),
      "x64-feed",
    );
    writeFile(
      path.join(assetsDir, "x86_64-apple-darwin", "Lime_1.29.0_x64.dmg"),
    );
    writeFile(
      path.join(
        assetsDir,
        "x86_64-pc-windows-msvc",
        "Lime_1.29.0_x64-setup.exe",
      ),
    );
    writeFile(path.join(assetsDir, "x86_64-pc-windows-msvc", "latest.yml"));

    const copied = prepareGitHubReleaseAssets({
      assetsDir,
      outDir,
    });

    expect(copied.map((item) => item.name).sort()).toEqual(
      [
        "Lime_1.29.0_aarch64.dmg",
        "Lime_1.29.0_x64.dmg",
        "Lime_1.29.0_x64-setup.exe",
        "macos-arm64-latest-mac.yml",
        "macos-x64-latest-mac.yml",
        "latest.yml",
      ].sort(),
    );
    expect(
      fs.readFileSync(
        path.join(outDir, "macos-arm64-latest-mac.yml"),
        "utf8",
      ),
    ).toBe("arm-feed");
    expect(
      fs.readFileSync(
        path.join(outDir, "macos-x64-latest-mac.yml"),
        "utf8",
      ),
    ).toBe("x64-feed");
  });
});
