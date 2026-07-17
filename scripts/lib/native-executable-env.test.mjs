import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DARWIN_ARM64_SYSTEM_PATH_PREFIX,
  withNativeSystemPath,
} from "./native-executable-env.mjs";

describe("native executable env", () => {
  it("macOS arm64 应优先使用系统原生 executable 目录并去重", () => {
    const env = {
      PATH: "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
      TOKEN: "fixture",
    };

    const resolved = withNativeSystemPath(env, {
      platform: "darwin",
      arch: "arm64",
      delimiter: ":",
    });

    expect(resolved).toEqual({
      PATH: [
        ...DARWIN_ARM64_SYSTEM_PATH_PREFIX,
        "/usr/local/bin",
        "/opt/homebrew/bin",
      ].join(":"),
      TOKEN: "fixture",
    });
    expect(env.PATH).toBe("/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin");
  });

  it.each([
    ["darwin", "x64"],
    ["linux", "arm64"],
    ["win32", "arm64"],
  ])("%s/%s 应保留调用方 PATH", (platform, arch) => {
    expect(
      withNativeSystemPath(
        { PATH: "/custom/bin:/usr/local/bin" },
        { platform, arch, delimiter: ":" },
      ).PATH,
    ).toBe("/custom/bin:/usr/local/bin");
  });

  it("Gate runner Git owners 应共享原生 executable PATH", () => {
    const owners = [
      "scripts/agent-qc/verify-local-gate.mjs",
      "scripts/check-docs-boundary.mjs",
      "scripts/governance/check-architecture-confirmation.mjs",
      "scripts/lib/project-gate-candidate-core.mjs",
      "scripts/lib/rust-test-scope-core.mjs",
      "scripts/lib/scripts-governance-core.mjs",
      "scripts/local-ci.mjs",
      "scripts/quality-task-planner.mjs",
    ];

    for (const owner of owners) {
      expect(fs.readFileSync(owner, "utf8"), owner).toContain(
        "withNativeSystemPath",
      );
    }
  });
});
