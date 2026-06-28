import { AlertTriangle, ChevronRight, FileText, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  WorkspacePluginHistoryRestoreLandingModel,
  WorkspacePluginHistoryRestoreLandingTone,
} from "./workspacePluginHistoryRestoreLanding";
import type { WorkspacePluginHistoryRestoreArtifactPreviewItem } from "./workspacePluginHistoryRestoreArtifacts";

type AgentTranslate = (
  key: string,
  options?: Record<string, string | number>,
) => string;

interface WorkspacePluginHistoryRestoreLandingCardProps {
  model: WorkspacePluginHistoryRestoreLandingModel;
  artifactPreviewItems?: readonly WorkspacePluginHistoryRestoreArtifactPreviewItem[];
  onOpenArtifactPreview?: (
    item: WorkspacePluginHistoryRestoreArtifactPreviewItem,
  ) => void;
}

function toneClasses(tone: WorkspacePluginHistoryRestoreLandingTone): {
  shell: string;
  icon: string;
  badge: string;
  Icon: typeof History;
} {
  switch (tone) {
    case "success":
      return {
        shell:
          "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-emerald-950/5 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-100",
        icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
        badge:
          "border-emerald-200 bg-white text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
        Icon: History,
      };
    case "info":
      return {
        shell:
          "border-sky-200 bg-sky-50 text-sky-950 shadow-sky-950/5 dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-100",
        icon: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200",
        badge:
          "border-sky-200 bg-white text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
        Icon: FileText,
      };
    case "warning":
    default:
      return {
        shell:
          "border-amber-200 bg-amber-50 text-amber-950 shadow-amber-950/5 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100",
        icon: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
        badge:
          "border-amber-200 bg-white text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
        Icon: AlertTriangle,
      };
  }
}

export function WorkspacePluginHistoryRestoreLandingCard({
  artifactPreviewItems = [],
  model,
  onOpenArtifactPreview,
}: WorkspacePluginHistoryRestoreLandingCardProps) {
  const { t } = useTranslation("agent");
  const translate: AgentTranslate = (key, options) =>
    String((t as unknown as AgentTranslate)(key, options));
  const tone = toneClasses(model.tone);
  const Icon = tone.Icon;
  const canOpenArtifactPreview = Boolean(onOpenArtifactPreview);
  const detailItems = [
    model.pluginLabel
      ? String(
          t("agentChat.workspaceConversation.pluginHistory.plugin", {
            plugin: model.pluginLabel,
          }),
        )
      : null,
    model.objectLabel
      ? String(
          t("agentChat.workspaceConversation.pluginHistory.object", {
            object: model.objectLabel,
          }),
        )
      : null,
    model.artifactCount > 0
      ? String(
          t("agentChat.workspaceConversation.pluginHistory.artifactCount", {
            count: model.artifactCount,
          }),
        )
      : null,
    model.openedTabCount > 0
      ? String(
          t("agentChat.workspaceConversation.pluginHistory.openedTabs", {
            count: model.openedTabCount,
          }),
        )
      : null,
  ].filter(Boolean);

  return (
    <section
      className={`mx-4 mb-3 rounded-[18px] border px-4 py-3 shadow-sm ${tone.shell}`}
      data-testid="workspace-plugin-history-landing-card"
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${tone.icon}`}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {String(
                translate(`agentChat.workspaceConversation.${model.titleKey}`),
              )}
            </h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone.badge}`}
            >
              {String(
                translate(`agentChat.workspaceConversation.${model.statusKey}`),
              )}
            </span>
          </div>
          <p className="text-sm leading-6 opacity-85">
            {String(
              translate(
                `agentChat.workspaceConversation.${model.descriptionKey}`,
              ),
            )}
          </p>
          {detailItems.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {detailItems.map((item) => (
                <span
                  key={String(item)}
                  className="rounded-full border border-current/15 bg-white/70 px-2 py-0.5 text-xs opacity-90 dark:bg-slate-950/20"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
          {artifactPreviewItems.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {artifactPreviewItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-current/20 bg-white px-2.5 py-1 text-xs font-medium shadow-sm transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950/35"
                  disabled={!canOpenArtifactPreview}
                  onClick={() => onOpenArtifactPreview?.(item)}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {String(
                      t(
                        "agentChat.workspaceConversation.pluginHistory.openArtifact",
                        {
                          index: item.displayIndex,
                        },
                      ),
                    )}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
