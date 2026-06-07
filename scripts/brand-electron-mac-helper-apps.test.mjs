import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { brandMacHelperApps } from "./brand-electron-mac-helper-apps.mjs";

const tmpRoots = [];

function createAppOutDir(helperInfoPlistContent) {
  const root = mkdtempSync(path.join(tmpdir(), "lime-electron-helper-brand-"));
  tmpRoots.push(root);
  const appOutDir = path.join(root, "mac-arm64");
  const helperContents = path.join(
    appOutDir,
    "Lime.app",
    "Contents",
    "Frameworks",
    "Lime Helper (GPU).app",
    "Contents",
  );
  mkdirSync(helperContents, { recursive: true });
  const infoPlistPath = path.join(helperContents, "Info.plist");
  writeFileSync(infoPlistPath, helperInfoPlistContent);
  return { appOutDir, infoPlistPath };
}

function buildInfoPlist(entries) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0">',
    "<dict>",
    ...entries.flatMap(([key, value]) => [
      `  <key>${key}</key>`,
      `  <string>${value}</string>`,
    ]),
    "</dict>",
    "</plist>",
  ].join("\n");
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    rmSync(root, { recursive: true, force: true });
  }
});

describe("brand-electron-mac-helper-apps", () => {
  it("把 macOS helper app Info.plist 中的 Electron Helper 品牌改为 Lime", () => {
    const { appOutDir, infoPlistPath } = createAppOutDir(
      buildInfoPlist([
        ["CFBundleDisplayName", "Lime Helper (GPU)"],
        ["CFBundleName", "Electron Helper (GPU)"],
        ["CFBundleExecutable", "Electron Helper (GPU)"],
      ]),
    );

    const result = brandMacHelperApps({ appOutDir, productName: "Lime" });
    const content = readFileSync(infoPlistPath, "utf8");

    expect(result).toEqual([
      expect.objectContaining({ changed: true, infoPlistPath }),
    ]);
    expect(content).toContain("<string>Lime Helper (GPU)</string>");
    expect(content).not.toContain("Electron Helper");
  });

  it("没有 macOS app bundle 时保持空结果", () => {
    const root = mkdtempSync(
      path.join(tmpdir(), "lime-electron-helper-brand-"),
    );
    tmpRoots.push(root);

    expect(
      brandMacHelperApps({ appOutDir: root, productName: "Lime" }),
    ).toEqual([]);
  });
});
