import { describe, expect, it } from "vitest";
import { buildExpertSkillEvidenceSummaryViewModel } from "./expertSkillEvidenceSummaryViewModel";

const COPY = {
  title: "证据包复盘",
  counts: (searchCount: number, invocationCount: number) =>
    `检索 ${searchCount} 次 · 执行 ${invocationCount} 次`,
  exportedAt: (exportedAt: string) => `最近导出 ${exportedAt}`,
  latestSkill: (skillName: string) => `最近技能 ${skillName}`,
  knownGaps: (count: number) => `${count} 个已知缺口`,
};

function translateRuntimeEnable(
  _key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
) {
  return defaultValue.replace(/\{\{\s*count\s*\}\}/g, String(options?.count));
}

describe("buildExpertSkillEvidenceSummaryViewModel", () => {
  it("应从 snake_case Evidence Pack 中生成专家技能复盘摘要", () => {
    const viewModel = buildExpertSkillEvidenceSummaryViewModel({
      evidencePack: {
        exported_at: "2026-06-21T00:00:05.000Z",
        known_gaps: ["缺少截图"],
        observability_summary: {
          skill_searches: [
            {
              event: "skill_search",
              query: "capability report",
              status: "completed",
            },
          ],
          skill_invocations: [
            {
              event: "skill_invocation",
              skill_name: "project:capability-report",
              status: "completed",
              workspace_skill_runtime_enable: {
                source: "manual_session_enable",
                bindings: [{ skill: "project:capability-report" }],
              },
            },
          ],
        },
      },
      copy: COPY,
      translateRuntimeEnable,
      formatExportedAt: () => "2026/6/21 08:00",
    });

    expect(viewModel).toEqual({
      visible: true,
      title: "证据包复盘",
      countLabel: "检索 1 次 · 执行 1 次",
      exportedAtLabel: "最近导出 2026/6/21 08:00",
      latestSkillLabel: "最近技能 project:capability-report",
      runtimeEnableLabel: "运行启用 · 手动会话 · 1 个绑定",
      knownGapsLabel: "1 个已知缺口",
    });
  });

  it("应兼容 camelCase Evidence Pack 中间态", () => {
    const viewModel = buildExpertSkillEvidenceSummaryViewModel({
      evidencePack: {
        exportedAt: "2026-06-21T00:00:05.000Z",
        knownGaps: [],
        observabilitySummary: {
          skillSearches: [{ event: "skill_search", status: "completed" }],
          skillInvocations: [
            {
              event: "skill_invocation",
              skillName: "analysis",
              status: "completed",
              workspaceSkillRuntimeEnable: {
                bindings: [{ skill: "analysis" }, { skill: "summary" }],
              },
            },
          ],
        },
      },
      copy: COPY,
      translateRuntimeEnable,
      formatExportedAt: (value) => value,
    });

    expect(viewModel.countLabel).toBe("检索 1 次 · 执行 1 次");
    expect(viewModel.latestSkillLabel).toBe("最近技能 analysis");
    expect(viewModel.runtimeEnableLabel).toBe("运行启用 · 2 个绑定");
    expect(viewModel.knownGapsLabel).toBeNull();
  });

  it("缺少 Evidence Pack 时不显示摘要", () => {
    expect(
      buildExpertSkillEvidenceSummaryViewModel({
        evidencePack: null,
        copy: COPY,
        translateRuntimeEnable,
        formatExportedAt: (value) => value,
      }),
    ).toEqual({
      visible: false,
      title: "证据包复盘",
      countLabel: "检索 0 次 · 执行 0 次",
      exportedAtLabel: null,
      latestSkillLabel: null,
      runtimeEnableLabel: null,
      knownGapsLabel: null,
    });
  });
});
