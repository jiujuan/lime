import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AgentRuntimeEvidencePack } from "@/lib/api/agentRuntime/evidenceTypes";
import { formatIsoDateTime } from "../components/harnessStatusPanelViewModel";
import { buildExpertSkillEvidenceSummaryViewModel } from "./expertSkillEvidenceSummaryViewModel";
import { BlockTitle, BulletList, Card } from "./ExpertInfoPanel.styles";

interface ExpertSkillEvidenceSummaryProps {
  evidencePack?: AgentRuntimeEvidencePack | null;
}

export function ExpertSkillEvidenceSummary({
  evidencePack,
}: ExpertSkillEvidenceSummaryProps) {
  const { t } = useTranslation("agent");
  const viewModel = useMemo(
    () =>
      buildExpertSkillEvidenceSummaryViewModel({
        evidencePack,
        formatExportedAt: formatIsoDateTime,
        translateRuntimeEnable: (key, defaultValue, options) =>
          String(
            t(
              key as never,
              {
                defaultValue,
                ...(options ?? {}),
              } as never,
            ),
          ),
        copy: {
          title: String(
            t("agentExperts.info.skills.evidence.title", "证据包复盘"),
          ),
          counts: (searchCount, invocationCount) =>
            String(
              t("agentExperts.info.skills.evidence.counts", {
                searchCount,
                invocationCount,
                defaultValue:
                  "检索 {{searchCount}} 次 · 执行 {{invocationCount}} 次",
              }),
            ),
          exportedAt: (exportedAt) =>
            String(
              t("agentExperts.info.skills.evidence.exportedAt", {
                exportedAt,
                defaultValue: "最近导出 {{exportedAt}}",
              }),
            ),
          latestSkill: (skillName) =>
            String(
              t("agentExperts.info.skills.evidence.latestSkill", {
                skillName,
                defaultValue: "最近技能 {{skillName}}",
              }),
            ),
          knownGaps: (count) =>
            String(
              t("agentExperts.info.skills.evidence.knownGaps", {
                count,
                defaultValue: "{{count}} 个已知缺口",
              }),
            ),
        },
      }),
    [evidencePack, t],
  );

  if (!viewModel.visible) {
    return null;
  }

  return (
    <Card data-testid="expert-info-skills-evidence-summary">
      <BlockTitle>{viewModel.title}</BlockTitle>
      <BulletList>
        <li>{viewModel.countLabel}</li>
        {viewModel.latestSkillLabel ? (
          <li>{viewModel.latestSkillLabel}</li>
        ) : null}
        {viewModel.runtimeEnableLabel ? (
          <li>{viewModel.runtimeEnableLabel}</li>
        ) : null}
        {viewModel.knownGapsLabel ? <li>{viewModel.knownGapsLabel}</li> : null}
        {viewModel.exportedAtLabel ? (
          <li>{viewModel.exportedAtLabel}</li>
        ) : null}
      </BulletList>
    </Card>
  );
}
