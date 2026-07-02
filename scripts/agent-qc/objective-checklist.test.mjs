import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-agent-qc-objective-"));
}

describe("agent-qc objective checklist CLI", () => {
  it("默认 completion audit sidecar 缺失时应 fail closed 而不是 ENOENT", () => {
    const entrypoint = path.resolve(
      "scripts/agent-qc/objective-checklist.mjs",
    );
    const result = spawnSync(
      process.execPath,
      [entrypoint, "--format", "json", "--check"],
      {
        cwd: makeTempDir(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("ENOENT");
    const checklist = JSON.parse(result.stdout);
    expect(checklist).toMatchObject({
      status: "incomplete",
      passedCount: 0,
      totalCount: 1,
    });
    expect(checklist.blockers[0]?.gap).toContain(
      "缺少 completion audit sidecar",
    );
  });
});
