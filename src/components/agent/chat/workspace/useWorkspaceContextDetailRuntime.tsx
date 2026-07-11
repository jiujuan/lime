import { useCallback } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import type { ThemeContextWorkspaceState } from "../hooks/useThemeContextWorkspace";

interface UseWorkspaceContextDetailRuntimeParams {
  contextWorkspace: ThemeContextWorkspaceState;
  t: TFunction<"agent">;
}

export function useWorkspaceContextDetailRuntime({
  contextWorkspace,
  t,
}: UseWorkspaceContextDetailRuntimeParams) {
  return useCallback(
    (contextId: string) => {
      const detail = contextWorkspace.getContextDetail(contextId);
      if (!detail) {
        toast.error(t("generalWorkbench.context.detail.notFound"));
        return;
      }

      let sourceLabel = t("generalWorkbench.context.source.web");
      if (detail.source === "material") {
        sourceLabel = t("generalWorkbench.context.source.material");
      } else if (detail.source === "content") {
        sourceLabel = t("generalWorkbench.context.source.content");
      } else if (detail.searchMode === "social") {
        sourceLabel = t("generalWorkbench.context.source.social");
      }

      toast.info(
        <div style={{ maxWidth: "500px" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>
            {detail.name}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "hsl(var(--muted-foreground))",
              marginBottom: "8px",
            }}
          >
            {t("generalWorkbench.context.detail.sourceTokens", {
              source: sourceLabel,
              tokens: detail.estimatedTokens,
            })}
          </div>
          <div
            style={{
              fontSize: "13px",
              lineHeight: "1.5",
              maxHeight: "300px",
              overflow: "auto",
            }}
          >
            {detail.bodyText || detail.previewText}
          </div>
        </div>,
        { duration: 10000 },
      );
    },
    [contextWorkspace, t],
  );
}
