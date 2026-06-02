import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { HarnessActiveFileWrite } from "../utils/harnessState";
import { formatArtifactWritePhaseLabel } from "../utils/messageArtifacts";
import { getActiveWriteDescription } from "./harnessStatusPanelViewModel";
import { InteractiveText, PathTextLink } from "./HarnessStatusPanelPrimitives";
import { agentText } from "./harnessPanelText";

interface ActiveWritePreviewRequest {
  title: string;
  description?: string;
  path?: string;
  content?: string;
  preview?: string;
}

interface HarnessActiveWritesSectionProps {
  writes: HarnessActiveFileWrite[];
  onOpenPreview: (request: ActiveWritePreviewRequest) => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
  onOpenUrl: (url: string) => void | Promise<void>;
}

export function HarnessActiveWritesSection({
  writes,
  onOpenPreview,
  onOpenPath,
  onOpenUrl,
}: HarnessActiveWritesSectionProps) {
  return (
    <div className="space-y-3">
      {writes.map((write) => (
        <button
          key={write.id}
          type="button"
          className="w-full rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/60"
          onClick={() =>
            void onOpenPreview({
              title: write.displayName,
              description: getActiveWriteDescription(write),
              path: write.path,
              content: write.content,
              preview: write.preview || write.latestChunk,
            })
          }
          aria-label={`查看文件写入：${write.displayName}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="truncate text-sm font-medium text-foreground">
                  {write.displayName}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {getActiveWriteDescription(write)}
              </div>
              <PathTextLink
                path={write.path}
                className="mt-1 text-xs"
                stopPropagation={true}
                onOpenPath={onOpenPath}
              />
            </div>
            <Badge variant="outline">
              {formatArtifactWritePhaseLabel(write.phase)}
            </Badge>
          </div>
          {write.preview || write.latestChunk ? (
            <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
              <InteractiveText
                text={write.preview || write.latestChunk}
                mono={true}
                stopPropagation={true}
                onOpenUrl={onOpenUrl}
              />
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">
              {agentText(
                "agentChat.harness.generated.54f5c230c9",
                "正在准备文件内容...",
              )}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
