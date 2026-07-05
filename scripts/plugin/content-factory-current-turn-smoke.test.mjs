import fs from "node:fs";
import { describe, expect, it } from "vitest";

const smokeScriptPath = "scripts/plugin/content-factory-current-turn-smoke.mjs";
const hostGenerationHelperPath =
  "scripts/lib/content-factory-host-generation-fixture.mjs";

function readSmokeScript() {
  return fs.readFileSync(smokeScriptPath, "utf8");
}

describe("content factory current turn smoke live provider guard", () => {
  it("keeps npm smoke entries fixture-only by default", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["smoke:content-factory-current-turn"]).toBe(
      "node scripts/plugin/content-factory-current-turn-smoke.mjs --host-generation-fixture",
    );
    expect(
      packageJson.scripts["smoke:content-factory-current-turn:host-generation"],
    ).toBe(
      "node scripts/plugin/content-factory-current-turn-smoke.mjs --host-generation-fixture",
    );
    expect(
      packageJson.scripts["smoke:content-factory-current-turn:cloud-release"],
    ).toBe(
      "node scripts/plugin/content-factory-current-turn-smoke.mjs --cloud-release-fixture --host-generation-fixture",
    );
    expect(
      packageJson.scripts[
        "smoke:content-factory-current-turn:cloud-release-host-generation"
      ],
    ).toBe(
      "node scripts/plugin/content-factory-current-turn-smoke.mjs --cloud-release-fixture --host-generation-fixture",
    );
  });

  it("requires explicit live provider opt-in and prevents fixture/live mixing", () => {
    const content = readSmokeScript();

    expect(content).toContain("--allow-live-provider");
    expect(content).toContain("--live-provider");
    expect(content).toContain("LIME_ALLOW_LIVE_PROVIDER_SMOKE");
    expect(content).toContain("LIME_REAL_API_TEST");
    expect(content).toContain(
      "--host-generation-fixture and --live-provider are mutually exclusive",
    );
    expect(content).toContain("assertLiveProviderSmokeAllowed");
    expect(content).toContain("CONTENT_FACTORY_LIVE_API_KEY_ENV");
    expect(content).toContain("process.env[options.liveApiKeyEnv]");
    expect(content).toContain("API keys are not written to evidence");
    expect(content).toContain("liveProviderUsed: Boolean(liveHostGeneration)");
  });

  it("does not persist live provider secrets in evidence or source", () => {
    const content = [
      readSmokeScript(),
      fs.readFileSync(hostGenerationHelperPath, "utf8"),
    ].join("\n");

    expect(content).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(content).not.toContain("CONTENT_FACTORY_LIVE_API_KEY=");
    expect(content).toContain("apiKeyEnv: options.liveApiKeyEnv");
    expect(content).toContain("apiKeyConfigured: true");
    expect(content).toContain("sanitizeText(");
    expect(content).toContain(
      "api[_-]?key|authorization|password|secret|token",
    );
    expect(content).toContain("Bearer\\s+");
  });

  it("writes redacted failure diagnostics for live cloud release debugging", () => {
    const content = readSmokeScript();

    expect(content).toContain("summarizeSmokeOptions");
    expect(content).toContain("summarizeInstalledStateForDiagnostics");
    expect(content).toContain("markDiagnosticStage");
    expect(content).toContain("agentSession.turn.start.dispatch");
    expect(content).toContain("failure.events.jsonl");
    expect(content).toContain("failure.workflow-events.jsonl");
    expect(content).toContain("collectFailureDiagnostics");
    expect(content).toContain("diagnostics: sanitizeJson(failureDiagnostics)");
    expect(content).toContain("stdoutTail");
    expect(content).toContain("apiKeyConfigured");
    expect(content).not.toContain("apiKey:");
    expect(content).not.toContain("api_key:");
  });

  it("keeps live host generation out of fixture fingerprint assertions", () => {
    const content = readSmokeScript();

    expect(content).toContain("hostGenerationCompleted: hostGenerationEnabled");
    expect(content).toContain(
      "hostGenerationFixture: Boolean(hostGenerationFixture)",
    );
    expect(content).toContain(
      "live host generation must not include fixturePromptFingerprint",
    );
    expect(content).toContain(
      "live read model article must not include fixturePromptFingerprint",
    );
  });
});
