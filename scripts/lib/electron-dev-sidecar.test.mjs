import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  appServerBinaryName,
  buildLocalAppServer,
  localAppServerBinaryPath,
  resolveDevAppServerBinary,
  resolveCargoTargetDirectory,
} from "./electron-dev-sidecar.mjs";

describe("electron dev sidecar", () => {
  it("按平台解析 app-server 二进制名称", () => {
    expect(appServerBinaryName("darwin")).toBe("app-server");
    expect(appServerBinaryName("linux")).toBe("app-server");
    expect(appServerBinaryName("win32")).toBe("app-server.exe");
  });

  it("默认解析仓库内 debug app-server 路径", () => {
    expect(
      localAppServerBinaryPath({
        repoRoot: "/repo/lime",
        platform: "darwin",
        targetDirectory: path.resolve("/repo/lime/lime-rs/target"),
      }),
    ).toBe(path.resolve("/repo/lime/lime-rs/target/debug/app-server"));
  });

  it("读取仓库 cargo target-dir 配置", () => {
    expect(
      resolveCargoTargetDirectory({
        repoRoot: "/repo/lime",
        readConfigFile: () => '[build]\ntarget-dir = "lime-rs/target"\n',
      }),
    ).toBe(path.resolve("/repo/lime/lime-rs/target"));
  });

  it("没有 cargo target-dir 配置时回退到 lime-rs/target", () => {
    expect(
      resolveCargoTargetDirectory({
        repoRoot: "/repo/lime",
        readConfigFile: () => "[build]\n",
      }),
    ).toBe(path.resolve("/repo/lime/lime-rs/target"));
  });

  it("优先使用 APP_SERVER_BIN 环境变量", () => {
    const calls = [];
    const resolved = resolveDevAppServerBinary({
      env: { APP_SERVER_BIN: "  /custom/app-server  " },
      exists(pathValue) {
        calls.push(pathValue);
        return false;
      },
      build() {
        throw new Error("should not build");
      },
    });

    expect(resolved).toBe("/custom/app-server");
    expect(calls).toHaveLength(0);
  });

  it("本地二进制存在时直接返回，不触发 cargo build", () => {
    const builds = [];
    const resolved = resolveDevAppServerBinary({
      env: {},
      repoRoot: "/repo/lime",
      platform: "darwin",
      exists: () => true,
      build(call) {
        builds.push(call);
      },
    });

    expect(resolved).toBe(path.resolve("/repo/lime/lime-rs/target/debug/app-server"));
    expect(builds).toHaveLength(0);
  });

  it("本地二进制缺失时先构建再返回二进制路径", () => {
    let existsCalls = 0;
    const builds = [];
    const resolved = resolveDevAppServerBinary({
      env: {},
      repoRoot: "/repo/lime",
      platform: "darwin",
      exists: () => {
        existsCalls += 1;
        return existsCalls > 1;
      },
      build(call) {
        builds.push(call);
      },
    });

    expect(resolved).toBe(path.resolve("/repo/lime/lime-rs/target/debug/app-server"));
    expect(builds).toEqual([{ repoRoot: "/repo/lime", platform: "darwin" }]);
  });

  it("构建后仍缺失二进制时报错", () => {
    expect(() =>
      resolveDevAppServerBinary({
        env: {},
        repoRoot: "/repo/lime",
        platform: "darwin",
        exists: () => false,
        build() {},
      }),
    ).toThrow(/app-server binary was not created/);
  });

  it("调用 cargo build 构建 app-server sidecar", () => {
    const calls = [];
    buildLocalAppServer({
      repoRoot: "/repo/lime",
      platform: "darwin",
      runner(command, args, options) {
        calls.push({ command, args, options });
        return { status: 0 };
      },
    });

    expect(calls).toEqual([
      {
        command: "cargo",
        args: [
          "build",
          "--manifest-path",
          path.resolve("/repo/lime/lime-rs/Cargo.toml"),
          "-p",
          "app-server",
          "--bin",
          "app-server",
        ],
        options: {
          cwd: "/repo/lime",
          stdio: "inherit",
          shell: false,
        },
      },
    ]);
  });

  it("cargo build 失败时抛出错误", () => {
    expect(() =>
      buildLocalAppServer({
        repoRoot: "/repo/lime",
        runner: () => ({ status: 2 }),
      }),
    ).toThrow("cargo build app-server failed with 2");
  });
});
