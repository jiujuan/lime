import fs from "node:fs";
import { describe, expect, it } from "vitest";

const scriptPath = "scripts/plugin/content-factory-production-gui-evidence.mjs";

function readScript() {
  return fs.readFileSync(scriptPath, "utf8");
}

describe("content factory production GUI evidence collector", () => {
  it("is exposed as an explicit npm production evidence collector", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(
      packageJson.scripts["plugin:content-factory-production-gui-evidence"],
    ).toBe("node scripts/plugin/content-factory-production-gui-evidence.mjs");
  });

  it("collects only from real Electron CDP and current App Server methods", () => {
    const content = readScript();

    expect(content).toContain("chromium.connectOverCDP");
    expect(content).toContain("window.__LIME_ELECTRON__ === true");
    expect(content).toContain('"app_server_handle_json_lines"');
    expect(content).toContain('"pluginInstalled/list"');
    expect(content).toContain('"agentSession/read"');
    expect(content).toContain('"evidence/export"');
    expect(content).toContain('"agentSession/action/respond"');
    expect(content).toContain('"agentSession/thread/resume"');
    expect(content).toContain("--turn-start-trace");
    expect(content).toContain("readProductionTurnStartTrace");
  });

  it("fails closed on production gate markers instead of inventing evidence", () => {
    const content = readScript();

    expect(content).toContain('sourceKind === "cloud_release"');
    expect(content).toContain('signatureVerificationStatus === "verified"');
    expect(content).toContain('hostManagedGenerationStatus === "completed"');
    expect(content).toContain("workflowJsonlEvents.length > 0");
    expect(content).toContain("workflowResumeLifecyclePresent");
    expect(content).toContain("tracedTurnStartViaElectronIpc");
    expect(content).toContain("statusFromAssertions");
    expect(content).toContain("missingAssertions");
  });

  it("recognizes workflowResume metadata from action/respond and queued resume contracts", () => {
    const content = readScript();

    expect(content).toContain(
      "../lib/content-factory-production-workflow-evidence.mjs",
    );
    expect(content).toContain("projectAppServerParamsForEvidence");
    expect(content).toContain("workflowResumeBindingsFromTrace");
    expect(content).toContain("workflowResumeEventBinding");
    expect(content).toContain("summarizeWorkflowResumeLifecycle");
  });

  it("keeps secrets and local CDP URLs out of gate evidence", () => {
    const content = readScript();

    expect(content).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(content).not.toContain("apiKey:");
    expect(content).toContain("Bearer [redacted]");
    expect(content).toContain("sanitizeText");
    expect(content).toContain("pageUrlKind");
    expect(content).toContain("endpointConfigured");
    expect(content).toContain("turnStartTrace");
    expect(content).toContain("--cdp-url or LIME_ELECTRON_CDP_URL is required");
    expect(content).toContain("sourceUriConfigured");
    expect(content).not.toContain("sourceUri: readString");
    expect(content).not.toContain("params: sanitizeJson");
    expect(content).not.toContain("url: options.cdpUrl");
    expect(content).not.toContain("pageUrl: runtime.href");
  });
});
