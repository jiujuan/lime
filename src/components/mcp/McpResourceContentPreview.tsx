import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { McpResourceContent } from "@/lib/api/mcp";
import { buildMcpResourcePreview } from "./mcpResourcePreview";

interface McpResourceContentPreviewProps {
  content: McpResourceContent;
}

export function McpResourceContentPreview({
  content,
}: McpResourceContentPreviewProps) {
  const { t, i18n } = useTranslation("settings");
  const preview = buildMcpResourcePreview(content);
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );
  const formatNumber = (value: number) => numberFormatter.format(value);

  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-muted-foreground">
          {preview.mimeType}
        </span>
      </div>
      {preview.kind === "text" ? (
        <>
          <pre
            className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all bg-background p-2 rounded border max-h-64 overflow-y-auto"
            data-testid="mcp-resource-text-preview"
          >
            {preview.text}
          </pre>
          {preview.truncated && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("settings.mcpPage.runtime.resourceBrowser.preview.truncated", {
                shown: formatNumber(preview.text.length),
                hidden: formatNumber(preview.hiddenChars),
                total: formatNumber(preview.totalChars),
              })}
            </p>
          )}
        </>
      ) : preview.kind === "image" ? (
        <div
          className="text-xs text-muted-foreground"
          data-testid="mcp-resource-image-summary"
        >
          {t("settings.mcpPage.runtime.resourceBrowser.preview.image", {
            bytes: formatNumber(preview.byteCount),
          })}
        </div>
      ) : preview.kind === "blob" ? (
        <div
          className="text-xs text-muted-foreground"
          data-testid="mcp-resource-blob-summary"
        >
          {t("settings.mcpPage.runtime.resourceBrowser.preview.blob", {
            bytes: formatNumber(preview.byteCount),
          })}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          {t("settings.mcpPage.runtime.resourceBrowser.preview.empty")}
        </div>
      )}
    </div>
  );
}
