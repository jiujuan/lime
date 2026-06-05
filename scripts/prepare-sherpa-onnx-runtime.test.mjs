import { describe, expect, it } from "vitest";

import {
  resolveSherpaOnnxSysVersion,
  resolveSherpaRuntimePlan,
} from "./prepare-sherpa-onnx-runtime.mjs";

describe("prepare sherpa-onnx runtime", () => {
  it("从 Cargo.lock 解析 sherpa-onnx-sys 版本", () => {
    const version = resolveSherpaOnnxSysVersion(`
[[package]]
name = "other"
version = "0.1.0"

[[package]]
name = "sherpa-onnx-sys"
version = "1.13.0"
`);

    expect(version).toBe("1.13.0");
  });

  it("为 macOS arm64 解析预置运行时归档和库文件", () => {
    const plan = resolveSherpaRuntimePlan({
      repoRoot: "/repo",
      targetTriple: "aarch64-apple-darwin",
      version: "1.13.0",
    });

    expect(plan.archiveName).toBe(
      "sherpa-onnx-v1.13.0-osx-arm64-shared-lib.tar.bz2",
    );
    expect(plan.libs).toEqual([
      "libonnxruntime.1.24.4.dylib",
      "libonnxruntime.dylib",
      "libsherpa-onnx-c-api.dylib",
    ]);
    expect(plan.releaseDir).toBe(
      "/repo/lime-rs/target/aarch64-apple-darwin/release",
    );
    expect(plan.debugDirs).toEqual([
      "/repo/lime-rs/target/debug",
      "/repo/lime-rs/target/aarch64-apple-darwin/debug",
    ]);
  });

  it("为 Windows 解析预置运行时归档和库文件", () => {
    const plan = resolveSherpaRuntimePlan({
      repoRoot: "/repo",
      targetTriple: "x86_64-pc-windows-msvc",
      version: "1.13.0",
    });

    expect(plan.archiveName).toBe(
      "sherpa-onnx-v1.13.0-win-x64-shared-MT-Release-lib.tar.bz2",
    );
    expect(plan.libs).toEqual(["onnxruntime.dll", "sherpa-onnx-c-api.dll"]);
  });

  it("支持显式 Rust workspace 目录，不再暴露旧目录参数口径", () => {
    const plan = resolveSherpaRuntimePlan({
      repoRoot: "/repo",
      rustWorkspaceDir: "runtime-rs",
      targetTriple: "x86_64-apple-darwin",
      version: "1.13.0",
    });

    expect(plan.releaseDir).toBe(
      "/repo/runtime-rs/target/x86_64-apple-darwin/release",
    );
    expect(plan.runtimeLibDir).toBe(
      "/repo/runtime-rs/.release-runtime-libs/x86_64-apple-darwin",
    );
  });
});
