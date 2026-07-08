import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { AppCenterItem } from "./PluginsPageViewModel";
import {
  buildDetailMcpBindings,
  buildDetailSkills,
  buildDetailSubagents,
  buildDetailTools,
  type DetailDeclaration,
} from "./pluginDetailDeclarations";

type DetailDeclarationSectionProps = {
  titleKey: string;
  testId: string;
  itemTestIdPrefix: string;
  declarations: DetailDeclaration[];
};

function DetailDeclarationSection({
  titleKey,
  testId,
  itemTestIdPrefix,
  declarations,
}: DetailDeclarationSectionProps): ReactElement | null {
  const { t } = useTranslation("agent");

  if (declarations.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[color:var(--lime-text-strong)]">
          {t(titleKey)}
        </h3>
        <span className="text-xs text-[color:var(--lime-text-muted)]">
          {declarations.length}
        </span>
      </div>
      <div className="space-y-2">
        {declarations.map((declaration) => (
          <div
            key={declaration.key}
            className="rounded-[12px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-3"
            data-testid={`${itemTestIdPrefix}-${declaration.key}`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[color:var(--lime-text-strong)]">
                  {declaration.title}
                </span>
                {declaration.description ? (
                  <span className="mt-1 block line-clamp-2 text-xs leading-5 text-[color:var(--lime-text-muted)]">
                    {declaration.description}
                  </span>
                ) : null}
                {declaration.meta ? (
                  <span className="mt-1 block truncate text-xs text-[color:var(--lime-text-muted)]">
                    {declaration.meta}
                  </span>
                ) : null}
              </span>
              {declaration.required ? (
                <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  {t("plugin.apps.center.detail.required")}
                </span>
              ) : null}
            </div>
            {declaration.aliases?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {declaration.aliases.map((alias) => (
                  <span
                    key={alias}
                    className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function PluginDetailSubagentsSection({
  item,
}: {
  item: AppCenterItem;
}): ReactElement | null {
  return (
    <DetailDeclarationSection
      titleKey="plugin.apps.center.detail.subagents"
      testId="plugins-detail-subagents"
      itemTestIdPrefix="plugins-detail-subagent"
      declarations={buildDetailSubagents(item)}
    />
  );
}

export function PluginDetailRuntimeRequirementSections({
  item,
}: {
  item: AppCenterItem;
}): ReactElement {
  return (
    <>
      <DetailDeclarationSection
        titleKey="plugin.apps.center.detail.skills"
        testId="plugins-detail-skills"
        itemTestIdPrefix="plugins-detail-skill"
        declarations={buildDetailSkills(item)}
      />
      <DetailDeclarationSection
        titleKey="plugin.apps.center.detail.tools"
        testId="plugins-detail-tools"
        itemTestIdPrefix="plugins-detail-tool"
        declarations={buildDetailTools(item)}
      />
      <DetailDeclarationSection
        titleKey="plugin.apps.center.detail.mcpBindings"
        testId="plugins-detail-mcp-bindings"
        itemTestIdPrefix="plugins-detail-mcp-binding"
        declarations={buildDetailMcpBindings(item)}
      />
    </>
  );
}
