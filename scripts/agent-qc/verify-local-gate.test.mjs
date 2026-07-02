import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-agent-qc-verify-local-"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

describe("agent-qc verify-local gate CLI", () => {
  it("命令通过时应写入 pass sidecar", () => {
    const root = makeTempDir();
    const output = path.join(root, "verify-local.json");
    const markdownOutput = path.join(root, "verify-local.md");
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-qc/verify-local-gate.mjs"),
        "--output",
        output,
        "--markdown-output",
        markdownOutput,
        "--check",
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(readJson(output)).toMatchObject({ status: "pass", exitCode: 0 });
    expect(fs.readFileSync(markdownOutput, "utf8")).toContain("Status: pass");
  });

  it("命令失败时应写入 fail sidecar 并在 --check 下返回非 0", () => {
    const root = makeTempDir();
    const output = path.join(root, "verify-local.json");
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-qc/verify-local-gate.mjs"),
        "--output",
        output,
        "--markdown-output",
        path.join(root, "verify-local.md"),
        "--check",
        "--",
        process.execPath,
        "-e",
        "process.exit(2)",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(readJson(output)).toMatchObject({
      status: "fail",
      exitCode: 2,
      failedStage: "exitCode=2",
    });
  });
});
