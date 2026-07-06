import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  collectBareRuntimeImports,
  verifyElectronRuntimeBundles,
  verifyMacAppIdentity,
} from "./verify-package-resources.mjs";

const tmpRoots = [];

function createPackageRoot(infoPlistContent, helperInfoPlists = []) {
  const root = mkdtempSync(path.join(tmpdir(), "lime-electron-package-"));
  tmpRoots.push(root);
  const appContents = path.join(root, "mac-arm64", "Lime.app", "Contents");
  mkdirSync(appContents, { recursive: true });
  writeFileSync(path.join(appContents, "Info.plist"), infoPlistContent);
  for (const [helperName, helperInfoPlistContent] of helperInfoPlists) {
    const helperContents = path.join(
      appContents,
      "Frameworks",
      helperName,
      "Contents",
    );
    mkdirSync(helperContents, { recursive: true });
    writeFileSync(
      path.join(helperContents, "Info.plist"),
      helperInfoPlistContent,
    );
  }
  return root;
}

function createRuntimeBundleRoot({ main, preload }) {
  const root = mkdtempSync(path.join(tmpdir(), "lime-electron-runtime-"));
  tmpRoots.push(root);
  const mainDir = path.join(root, "dist-electron", "main");
  const preloadDir = path.join(root, "dist-electron", "preload");
  mkdirSync(mainDir, { recursive: true });
  mkdirSync(preloadDir, { recursive: true });
  writeFileSync(path.join(mainDir, "main.js"), main);
  writeFileSync(path.join(preloadDir, "preload.cjs"), preload);
  return root;
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

function cleanLimeInfoPlist(extraEntries = []) {
  return buildInfoPlist([
    ["CFBundleDisplayName", "Lime"],
    ["CFBundleName", "Lime"],
    ["CFBundleExecutable", "Lime"],
    ["CFBundleIdentifier", "com.limecloud.lime"],
    ["CFBundleIconFile", "icon.icns"],
    ...extraEntries,
  ]);
}

function cleanHelperInfoPlist(suffix = " (GPU)", extraEntries = []) {
  return buildInfoPlist([
    ["CFBundleDisplayName", `Lime Helper${suffix}`],
    ["CFBundleName", `Lime Helper${suffix}`],
    ["CFBundleExecutable", `Lime Helper${suffix}`],
    [
      "CFBundleIdentifier",
      `com.limecloud.lime.helper${suffix.replace(/[ ()]/g, "")}`,
    ],
    ...extraEntries,
  ]);
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    rmSync(root, { recursive: true, force: true });
  }
});

describe("verify-electron-package-resources runtime bundles", () => {
  it("收集运行时裸依赖包名", () => {
    expect(
      collectBareRuntimeImports(`
        import path from "node:path";
        import YAML from "yaml";
        import "@scope/pkg/register";
        const electron = require("electron");
        const local = require("./local.cjs");
      `),
    ).toEqual(["@scope/pkg", "electron", "yaml"]);
  });

  it("拒绝 Electron runtime bundle 残留非内置裸依赖", () => {
    const root = createRuntimeBundleRoot({
      main: 'import { parse } from "yaml";\nimport path from "node:path";\n',
      preload: 'const electron = require("electron");\n',
    });

    expect(() => verifyElectronRuntimeBundles(root)).toThrow(/yaml/);
  });

  it("接受只包含 node/electron/相对导入的 runtime bundle", () => {
    const root = createRuntimeBundleRoot({
      main:
        'import path from "node:path";\nimport { Buffer } from "buffer";\nimport process from "process";\nimport "./chunk.js";\n',
      preload:
        'const electron = require("electron");\nconst local = require("./local.cjs");\n',
    });

    expect(() => verifyElectronRuntimeBundles(root)).not.toThrow();
  });
});

describe("verify-electron-package-resources macOS app identity", () => {
  it("接受完整 Lime macOS app identity", () => {
    const root = createPackageRoot(cleanLimeInfoPlist());

    expect(verifyMacAppIdentity(root, { platform: "darwin" })).toEqual([
      expect.objectContaining({ kind: "main" }),
    ]);
  });

  it("接受 Lime helper app identity，不把 helper 名称误判成主 app", () => {
    const root = createPackageRoot(cleanLimeInfoPlist(), [
      ["Lime Helper (GPU).app", cleanHelperInfoPlist(" (GPU)")],
    ]);

    expect(verifyMacAppIdentity(root, { platform: "darwin" })).toEqual([
      expect.objectContaining({ kind: "main" }),
      expect.objectContaining({ kind: "helper" }),
    ]);
  });

  it("拒绝仍使用 Electron 可执行名的 macOS app", () => {
    const root = createPackageRoot(
      cleanLimeInfoPlist([["CFBundleExecutable", "Electron"]]),
    );

    expect(() => verifyMacAppIdentity(root, { platform: "darwin" })).toThrow(
      /executable still uses Electron/,
    );
  });

  it("拒绝 Forge packager extendInfo 字符串污染出的数字键", () => {
    const root = createPackageRoot(cleanLimeInfoPlist([["0", "l"]]));

    expect(() => verifyMacAppIdentity(root, { platform: "darwin" })).toThrow(
      /numeric extendInfo keys/,
    );
  });

  it("拒绝 helper app 中残留的 Electron Helper 品牌", () => {
    const root = createPackageRoot(cleanLimeInfoPlist(), [
      [
        "Lime Helper (GPU).app",
        cleanHelperInfoPlist(" (GPU)", [
          ["CFBundleName", "Electron Helper (GPU)"],
        ]),
      ],
    ]);

    expect(() => verifyMacAppIdentity(root, { platform: "darwin" })).toThrow(
      /helper app identity still uses Electron/,
    );
  });

  it("非 macOS 平台不检查 macOS app identity", () => {
    const root = createPackageRoot(
      cleanLimeInfoPlist([["CFBundleExecutable", "Electron"]]),
    );

    expect(verifyMacAppIdentity(root, { platform: "win32" })).toEqual([]);
  });
});
