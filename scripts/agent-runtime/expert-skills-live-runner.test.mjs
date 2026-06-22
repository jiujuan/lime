import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  normalizeLiveSummaryFromSource,
  parseArgs,
  runExpertSkillsLiveRunner,
} from "./expert-skills-live-runner.mjs";

const CORE_ASSERTIONS = {
  liveProviderUsed: true,
  liveProviderNotUsed: false,
  expertSkillsRuntimePromptReachedBackend: true,
  expertSkillsRuntimeMetadataReachedBackend: true,
  expertDeclaredSkillRefsObserved: true,
  expertSelectedSkillObserved: true,
  expertInvokedSkillObserved: true,
  readModelExpertSkillsRuntimeCompleted: true,
  readModelExpertSkillSearchObserved: true,
  readModelExpertSkillInvocationObserved: true,
  evidenceExpertSkillBodyReadObserved: true,
  evidenceExpertSkillGateObserved: true,
  evidencePackExpertSkillSearchObserved: true,
  evidencePackExpertSkillInvocationObserved: true,
  expertSkillSearchBeforeSkillInvocation: true,
};

const PANEL_ASSERTIONS = {
  expertPanelSecondTurnPromptReachedBackend: true,
  expertPanelSkillRefsOverrideReachedBackend: true,
  expertPanelReadModelCompleted: true,
  expertPanelEvidenceSkillBodyReadObserved: true,
  expertPanelEvidenceSkillGateObserved: true,
  expertPanelEvidenceSkillSearchObserved: true,
  expertPanelEvidenceSkillInvocationObserved: true,
  expertPanelSkillSearchBeforeSkillInvocation: true,
  expertPanelEvidencePackExportedFromHarnessPanel: true,
  expertPanelEvidenceSummaryVisible: true,
  expertPanelEvidenceSummarySkillCountsVisible: true,
  expertPanelEvidenceSummaryLatestSkillVisible: true,
  expertPanelEvidenceSummaryRuntimeEnableVisible: true,
  expertPanelEvidenceSummaryHidesRawRuntimeEnable: true,
};

async function withTempDir(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "expert-skills-live-"));
  try {
    return await callback(dir);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

function writeSummary(dir, fileName, overrides = {}) {
  const {
    assertions,
    evidencePackExpertPanelSkillsRuntime,
    evidencePackExpertSkillsRuntime,
    ...summaryOverrides
  } = overrides;
  const summary = {
    ok: true,
    scenario: "expert-panel-skills-runtime",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    assertions: {
      ...CORE_ASSERTIONS,
      ...PANEL_ASSERTIONS,
      ...(assertions ?? {}),
    },
    evidencePackExpertPanelSkillsRuntime: {
      hasEvidencePack: true,
      skillSearchCount: 1,
      skillInvocationCount: 1,
      skillBodyReadObserved: true,
      skillGateObserved: true,
      expertDeclaredObserved: true,
      expertSelectedObserved: true,
      expertInvokedObserved: true,
      skillSearchBeforeSkillInvocation: true,
      ...(evidencePackExpertPanelSkillsRuntime ?? {}),
    },
    evidencePackExpertSkillsRuntime,
    ...summaryOverrides,
  };
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`);
  return filePath;
}

function writeDeterministicSummary(dir) {
  return writeSummary(dir, "deterministic.json", {
    provider: "fixture-provider",
    model: "fixture-model",
    assertions: {
      liveProviderUsed: false,
      liveProviderNotUsed: true,
    },
  });
}

describe("expert skills live runner", () => {
  it("默认不允许 live Provider 验收执行", async () => {
    await expect(
      runExpertSkillsLiveRunner({
        allowLiveProvider: false,
        liveSummary: "",
        executeLiveRuntime: false,
      }),
    ).rejects.toThrow("默认禁止执行");
  });

  it("parseArgs 只有显式参数才打开 live runtime 执行", () => {
    const options = parseArgs([
      "--allow-live-provider",
      "--execute-live-runtime",
      "--provider-preference",
      "deepseek",
      "--model-preference",
      "deepseek-v4-flash",
    ]);

    expect(options.allowLiveProvider).toBe(true);
    expect(options.executeLiveRuntime).toBe(true);
    expect(options.providerPreference).toBe("deepseek");
    expect(options.modelPreference).toBe("deepseek-v4-flash");
  });

  it("拒绝把 fixture summary 归一化成 live summary", () =>
    withTempDir((dir) => {
      const fixture = writeSummary(dir, "fixture.json", {
        provider: "fixture-provider",
        model: "fixture-model",
      });

      expect(() =>
        normalizeLiveSummaryFromSource(JSON.parse(fs.readFileSync(fixture, "utf8")), fixture),
      ).toThrow("fixture provider/model");
    }));

  it("读取已有 live summary 后写出 gate 可消费的 summary", async () =>
    withTempDir(async (dir) => {
      const deterministicSummary = writeDeterministicSummary(dir);
      const liveSummary = writeSummary(dir, "live.json");
      const output = path.join(dir, "normalized-live.json");

      const result = await runExpertSkillsLiveRunner({
        allowLiveProvider: true,
        liveSummary,
        executeLiveRuntime: false,
        deterministicSummary,
        output,
      });

      expect(result.output).toBe(output);
      expect(result.summary.liveProviderUsed).toBe(true);
      expect(result.gateReport.status).toBe("pass");
      expect(fs.existsSync(output)).toBe(true);
    }));
});
