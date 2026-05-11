import { FileQuestion, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ResourceManagerItem } from "./types";

interface UnsupportedResourceRendererProps {
  item: ResourceManagerItem;
}

function getUnsupportedPresentation(): {
  Icon: typeof FileQuestion;
  tone: string;
} {
  return {
    Icon: FileQuestion,
    tone: "border-slate-200 bg-slate-50 text-slate-600",
  };
}

export function UnsupportedResourceRenderer({
  item,
}: UnsupportedResourceRendererProps) {
  const { t } = useTranslation("workspace");
  const { Icon, tone } = getUnsupportedPresentation();

  return (
    <div
      data-testid="resource-manager-unsupported-preview"
      className="flex min-h-0 flex-1 items-center justify-center bg-[#f5f6f8] px-6 text-center text-slate-500"
    >
      <div className="w-full max-w-lg rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm shadow-slate-950/5">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border ${tone}`}
        >
          <Icon className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">
          {t("workspace.resourceManager.unsupported.title")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          {t("workspace.resourceManager.unsupported.description")}
        </p>
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs leading-6 text-slate-500">
          <div className="flex items-center gap-2 font-medium text-slate-700">
            <FileText className="h-4 w-4" />
            {item.title ||
              t("workspace.resourceManager.unsupported.titleFallback")}
          </div>
          {item.filePath ? (
            <div className="mt-1 truncate">{item.filePath}</div>
          ) : null}
          {item.mimeType ? (
            <div>
              {t("workspace.resourceManager.unsupported.mimeType", {
                mimeType: item.mimeType,
              })}
            </div>
          ) : null}
        </div>
        <p className="mt-5 text-[11px] text-slate-400">
          {t("workspace.resourceManager.unsupported.futureHint")}
        </p>
      </div>
    </div>
  );
}
