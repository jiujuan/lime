import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateReleaseWorkflow } from "./release-workflow-guard.mjs";

function tempWorkflowPath(content) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "electron-release-workflow-"),
  );
  const filePath = path.join(dir, "release.yml");
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("Electron release workflow guard", () => {
  it("accepts the current Forge-only release workflow", () => {
    expect(() => validateReleaseWorkflow()).not.toThrow();
  });

  it("rejects macOS arm64 runner drift", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(
      current.replace("platform: macos-15", "platform: macos-latest"),
    );

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /macOS-arm64\.platform expected macos-15/,
    );
  });

  it("rejects retired packaging tools in release workflow", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(`${current}\n# electron-builder\n`);

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /retired packaging input: electron-builder/,
    );
  });
});
