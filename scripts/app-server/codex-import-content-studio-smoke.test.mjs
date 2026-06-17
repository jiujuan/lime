import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/app-server/codex-import-content-studio-smoke.mjs",
    "utf8",
  );
}

describe("codex import content-studio smoke guard", () => {
  it("uses an isolated App Server data-dir by default so the dogfood can be rerun", () => {
    const content = readSmokeScript();

    expect(content).toContain("resolveSmokeDataDir");
    expect(content).toContain("CODEX_IMPORT_SMOKE_DATA_DIR");
    expect(content).toContain("CODEX_IMPORT_SMOKE_KEEP_DATA_DIR");
    expect(content).toContain("mkdtemp(");
    expect(content).toContain("tmpdir()");
    expect(content).toContain('stdioSidecar(binaryPath, undefined, dataDir.path)');
    expect(content).toContain("await dataDir.cleanup()");
  });

  it("still verifies first-import and duplicate-import paths in one isolated run", () => {
    const content = readSmokeScript();

    expect(content).toContain("expectCreatesSession: true");
    expect(content).toContain("confirmed: false");
    expect(content).toContain("explicit user confirmation");
    expect(content).toContain("duplicateCommit");
    expect(content).toContain("willCreateSession");
    expect(content).toContain("willAppendToExistingSession");
    expect(content).toContain("rescan import status");
  });
});
