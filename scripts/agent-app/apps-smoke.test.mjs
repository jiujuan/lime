import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync("scripts/agent-app/apps-smoke.mjs", "utf8");
}

describe("agent app center smoke guard", () => {
  it("keeps delete-data rehearsal gated and proves real uninstall through keep-data", () => {
    const content = readSmokeScript();

    expect(content).toContain('"app_server_handle_json_lines"');
    expect(content).toContain('"agentAppInstalled/list"');
    expect(content).toContain('"agentAppInstalled/save"');
    expect(content).toContain(
      '[data-testid="agent-apps-delete-data-current-phase-gate"]',
    );
    expect(content).toContain(
      '[data-testid="agent-apps-uninstall-delete-data"]',
    );
    expect(content).toContain(
      '[data-testid="agent-apps-uninstall-keep-data"]',
    );
    expect(content).toContain("deleteDataDryRunRetainsInstalledState");
    expect(content).toContain("deleteDataConfirmationGateLocked");
    expect(content).toContain("keepDataRemovedInstalledState");
    expect(content).toContain('"post_keep_data_restore"');
    expect(content).toContain("cleanupEvidenceDryRunOnly");
    expect(content).not.toContain("deleteDataRemovedInstalledState");
    expect(content).not.toContain("postDeleteInstalledStateRestored");
  });

  it("rejects legacy Agent App lifecycle commands as positive smoke evidence", () => {
    const content = readSmokeScript();

    expect(content).not.toContain('invoke("agent_app_uninstall"');
    expect(content).not.toContain('invoke("agent_app_uninstall_rehearsal"');
    expect(content).not.toContain('invoke("agent_app_save_installed_state"');
    expect(content).not.toContain('"agent_app_uninstall"');
    expect(content).not.toContain('"agent_app_uninstall_rehearsal"');
    expect(content).not.toContain('"agent_app_save_installed_state"');
    expect(content).not.toContain("invokeMockOnly");
    expect(content).not.toContain("defaultMocks");
  });
});
