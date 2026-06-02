import type { ReactNode } from "react";
import { Eye, FileText, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  InventoryStatCard,
  PathTextLink,
} from "./HarnessStatusPanelPrimitives";
import { agentText } from "./harnessPanelText";
import { formatSize } from "./harnessStatusPanelViewModel";
import type {
  HandoffOpenPathHandler,
  HandoffOpenPreviewHandler,
} from "./HarnessHandoffExportTypes";

interface HarnessExportCardFrameProps {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actions: ReactNode;
  error?: string | null;
  hasContent: boolean;
  emptyMessage: ReactNode;
  className?: string;
  children: ReactNode;
}

export function HarnessExportCardFrame({
  icon,
  title,
  description,
  actions,
  error,
  hasContent,
  emptyMessage,
  className,
  children,
}: HarnessExportCardFrameProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-muted/20 p-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {icon}
            <span>{title}</span>
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {hasContent ? (
        <div className="mt-3 space-y-3">{children}</div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

interface HarnessExportDirectoryCardProps {
  title: ReactNode;
  relativePath: string;
  absolutePath: string;
  onOpenPath: HandoffOpenPathHandler;
}

export function HarnessExportDirectoryCard({
  title,
  relativePath,
  absolutePath,
  onOpenPath,
}: HarnessExportDirectoryCardProps) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
        <span>{title}</span>
      </div>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div>
          {agentText("agentChat.harness.generated.2ee19fe8b0", "相对路径：")}
          <span className="ml-1 break-all font-mono text-foreground">
            {relativePath}
          </span>
        </div>
        <div>
          {agentText("agentChat.harness.generated.f9c616413f", "绝对路径：")}
          <PathTextLink
            path={absolutePath}
            className="ml-1"
            onOpenPath={onOpenPath}
          />
        </div>
      </div>
    </div>
  );
}

interface HarnessExportArtifact {
  kind: string;
  title: string;
  relative_path: string;
  absolute_path: string;
  bytes: number;
}

interface HarnessExportArtifactListProps<
  TArtifact extends HarnessExportArtifact,
> {
  artifacts: readonly TArtifact[];
  formatKindLabel: (kind: TArtifact["kind"]) => string;
  previewDescriptionPrefix: string;
  previewAriaLabelPrefix: string;
  openAriaLabelPrefix: string;
  title?: ReactNode;
  onOpenPath: HandoffOpenPathHandler;
  onOpenPreview: HandoffOpenPreviewHandler;
}

export function HarnessExportArtifactList<
  TArtifact extends HarnessExportArtifact,
>({
  artifacts,
  formatKindLabel,
  previewDescriptionPrefix,
  previewAriaLabelPrefix,
  openAriaLabelPrefix,
  title,
  onOpenPath,
  onOpenPreview,
}: HarnessExportArtifactListProps<TArtifact>) {
  return (
    <div className="space-y-3">
      {title ? (
        <div className="text-sm font-medium text-foreground">{title}</div>
      ) : null}
      {artifacts.map((artifact) => {
        const sizeLabel = formatSize(artifact.bytes);
        const kindLabel = formatKindLabel(artifact.kind);

        return (
          <div
            key={artifact.absolute_path}
            className="rounded-xl border border-border bg-background p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {artifact.title}
                  </span>
                  <Badge variant="outline">{kindLabel}</Badge>
                  {sizeLabel ? (
                    <Badge variant="secondary">{sizeLabel}</Badge>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <div>
                    {agentText(
                      "agentChat.harness.generated.2ee19fe8b0",
                      "相对路径：",
                    )}
                    <span className="ml-1 break-all font-mono text-foreground">
                      {artifact.relative_path}
                    </span>
                  </div>
                  <div className="mt-1">
                    {agentText(
                      "agentChat.harness.generated.f9c616413f",
                      "绝对路径：",
                    )}
                    <PathTextLink
                      path={artifact.absolute_path}
                      className="ml-1"
                      onOpenPath={onOpenPath}
                    />
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  aria-label={`${previewAriaLabelPrefix}：${artifact.title}`}
                  onClick={() =>
                    void onOpenPreview({
                      title: artifact.title,
                      description: `${previewDescriptionPrefix} · ${kindLabel}`,
                      path: artifact.absolute_path,
                    })
                  }
                >
                  <Eye className="h-4 w-4" />
                  {agentText("agentChat.harness.generated.de61aa8e1c", "预览")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-2"
                  aria-label={`${openAriaLabelPrefix}：${artifact.absolute_path}`}
                  onClick={() => void onOpenPath(artifact.absolute_path)}
                >
                  <FolderOpen className="h-4 w-4" />
                  {agentText("agentChat.harness.generated.65fc81e161", "打开")}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { InventoryStatCard };
