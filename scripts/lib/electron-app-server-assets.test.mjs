import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  APP_SERVER_PROTOCOL_VERSION,
  appServerResourceBinaryName,
  appServerResourcePlatformKey,
  buildElectronAppServerReleaseManifest,
  electronAppServerBinaryDestination,
  electronAppServerManifestPath,
  electronAppServerResourcesRoot,
  prepareElectronAppServerAssets,
  resolveElectronAppServerRuntimeEnv,
} from "./electron-app-server-assets.mjs";

describe("electron app-server assets", () => {
  it("按平台解析 resources sidecar 名称与平台 key", () => {
    expect(appServerResourceBinaryName("darwin")).toBe("app-server");
    expect(appServerResourceBinaryName("win32")).toBe("app-server.exe");
    expect(appServerResourcePlatformKey("darwin", "arm64")).toBe("darwin-arm64");
    expect(appServerResourcePlatformKey("darwin", "x64")).toBe("darwin-x64");
    expect(appServerResourcePlatformKey("win32", "x64")).toBe("win32-x64");
    expect(appServerResourcePlatformKey("linux", "x64")).toBe("linux-x64");
  });

  it("解析 Electron resources 输出路径", () => {
    const outputRoot = electronAppServerResourcesRoot("/repo/lime");
    expect(outputRoot).toBe(path.resolve("/repo/lime/dist-electron"));
    expect(electronAppServerManifestPath({ outputRoot })).toBe(
      path.resolve("/repo/lime/dist-electron/app-server.release.json"),
    );
    expect(
      electronAppServerBinaryDestination({
        outputRoot,
        platform: "darwin",
        arch: "arm64",
      }),
    ).toBe(
      path.resolve("/repo/lime/dist-electron/app-server/darwin-arm64/app-server"),
    );
  });

  it("生成 Electron packaged app-server manifest", async () => {
    const manifest = await buildElectronAppServerReleaseManifest({
      binaryPath: "/repo/lime/dist-electron/app-server/darwin-arm64/app-server",
      version: "1.59.0",
      platform: "darwin-arm64",
      sha256File: async () => "sha256",
    });

    expect(manifest).toEqual({
      version: "1.59.0",
      protocolVersion: APP_SERVER_PROTOCOL_VERSION,
      artifacts: [
        {
          platform: "darwin-arm64",
          url: "app-resource://app-server/darwin-arm64/app-server",
          sha256: "sha256",
        },
      ],
    });
  });

  it("准备 sidecar 二进制和 release manifest", async () => {
    const calls = [];
    const outputRoot = path.resolve("/repo/lime/dist-electron");
    const result = await prepareElectronAppServerAssets({
      repoRoot: "/repo/lime",
      outputRoot,
      platform: "darwin",
      arch: "arm64",
      sourceBinary: "/repo/lime/lime-rs/target/debug/app-server",
      readPackageJson: async () => ({ version: "1.59.0" }),
      makeDir: async (...args) => calls.push(["mkdir", ...args]),
      copy: async (...args) => calls.push(["copy", ...args]),
      clearLaunchBlockingXattrs: async (...args) => calls.push(["xattr", ...args]),
      getStat: async () => ({ mode: 0o755 }),
      changeMode: async (...args) => calls.push(["chmod", ...args]),
      write: async (...args) => calls.push(["write", ...args]),
      sha256File: async (filePath) => {
        expect(filePath).toBe(
          path.resolve("/repo/lime/dist-electron/app-server/darwin-arm64/app-server"),
        );
        return "sha256";
      },
    });

    expect(result.binaryPath).toBe(
      path.resolve("/repo/lime/dist-electron/app-server/darwin-arm64/app-server"),
    );
    expect(result.manifestPath).toBe(
      path.resolve("/repo/lime/dist-electron/app-server.release.json"),
    );
    expect(calls[0]).toEqual([
      "mkdir",
      path.resolve("/repo/lime/dist-electron/app-server/darwin-arm64"),
      { recursive: true },
    ]);
    expect(calls[1]).toEqual([
      "copy",
      path.resolve("/repo/lime/lime-rs/target/debug/app-server"),
      path.resolve("/repo/lime/dist-electron/app-server/darwin-arm64/app-server"),
    ]);
    expect(calls[2]).toEqual([
      "xattr",
      path.resolve("/repo/lime/dist-electron/app-server/darwin-arm64/app-server"),
      "darwin",
    ]);
    expect(calls[3]).toEqual([
      "chmod",
      path.resolve("/repo/lime/dist-electron/app-server/darwin-arm64/app-server"),
      0o755,
    ]);
    expect(calls[4][0]).toBe("write");
    expect(calls[4][1]).toBe(
      path.resolve("/repo/lime/dist-electron/app-server.release.json"),
    );
  });

  it("runtime env 优先使用显式 APP_SERVER_BIN", () => {
    expect(
      resolveElectronAppServerRuntimeEnv({
        env: { APP_SERVER_BIN: "  /custom/app-server  " },
        exists: () => true,
        resolveBinary: () => {
          throw new Error("should not resolve");
        },
      }),
    ).toEqual({ APP_SERVER_BIN: "/custom/app-server" });
  });

  it("runtime env 已存在 manifest 时不注入开发 sidecar", () => {
    expect(
      resolveElectronAppServerRuntimeEnv({
        env: {},
        repoRoot: "/repo/lime",
        exists: () => true,
        resolveBinary: () => {
          throw new Error("should not resolve");
        },
      }),
    ).toEqual({});
  });

  it("runtime env 无 manifest 时回退开发 sidecar", () => {
    expect(
      resolveElectronAppServerRuntimeEnv({
        env: {},
        repoRoot: "/repo/lime",
        platform: "darwin",
        exists: () => false,
        resolveBinary: (options) => {
          expect(options.repoRoot).toBe("/repo/lime");
          expect(options.platform).toBe("darwin");
          return "/repo/lime/lime-rs/target/debug/app-server";
        },
      }),
    ).toEqual({ APP_SERVER_BIN: "/repo/lime/lime-rs/target/debug/app-server" });
  });
});
