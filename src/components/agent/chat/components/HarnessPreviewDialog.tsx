import { AlertCircle, Eye, HardDriveDownload, Loader2 } from "lucide-react";
import { ArtifactRenderer } from "@/components/artifact/ArtifactRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InteractiveText, PathTextLink } from "./HarnessStatusPanelPrimitives";
import { agentText } from "./harnessPanelText";
import { formatSize } from "./harnessStatusPanelViewModel";
import type { HarnessPreviewDialogState } from "./useHarnessPreviewDialog";

interface HarnessPreviewDialogProps {
  previewDialog: HarnessPreviewDialogState;
  canOpenInConversation: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFile: () => void;
  onCopyPath: () => void | Promise<void>;
  onCopyContent: () => void | Promise<void>;
  onRevealPath: () => void | Promise<void>;
  onOpenPath: () => void | Promise<void>;
  onOpenPathValue: (path: string) => void | Promise<void>;
  onOpenUrl: (url: string) => void | Promise<void>;
}

export function HarnessPreviewDialog({
  previewDialog,
  canOpenInConversation,
  onOpenChange,
  onOpenFile,
  onCopyPath,
  onCopyContent,
  onRevealPath,
  onOpenPath,
  onOpenPathValue,
  onOpenUrl,
}: HarnessPreviewDialogProps) {
  const formattedSize = formatSize(previewDialog.size);

  return (
    <Dialog open={previewDialog.open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-4xl" className="p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="pr-8">{previewDialog.title}</DialogTitle>
          <DialogDescription className="space-y-1">
            {previewDialog.description ? (
              <InteractiveText
                text={previewDialog.description}
                className="block"
                onOpenUrl={onOpenUrl}
              />
            ) : null}
            {previewDialog.path ? (
              <PathTextLink
                path={previewDialog.path}
                className="block text-xs"
                onOpenPath={onOpenPathValue}
              />
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{previewDialog.displayName}</Badge>
            {formattedSize ? (
              <Badge variant="outline">{formattedSize}</Badge>
            ) : null}
            {previewDialog.loading ? (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {agentText(
                  "agentChat.harness.generated.995ffb79c5",
                  "正在加载完整内容",
                )}
              </Badge>
            ) : null}
            {previewDialog.preview &&
            previewDialog.content === previewDialog.preview &&
            !previewDialog.loading ? (
              <Badge variant="outline">
                {agentText(
                  "agentChat.harness.generated.4d7905b93d",
                  "当前展示为摘要预览",
                )}
              </Badge>
            ) : null}
          </div>

          <ScrollArea className="max-h-[60vh] rounded-xl border border-border bg-muted/30">
            {previewDialog.artifact ? (
              <div className="h-[58vh] min-h-[360px] bg-background">
                <ArtifactRenderer
                  artifact={previewDialog.artifact}
                  tone="light"
                  hideToolbar
                />
              </div>
            ) : previewDialog.isBinary ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <HardDriveDownload className="h-4 w-4" />
                {agentText(
                  "agentChat.harness.generated.bdc2620ca1",
                  "该文件为二进制内容，暂不支持文本预览。",
                )}
              </div>
            ) : previewDialog.error ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {previewDialog.error}
              </div>
            ) : previewDialog.content ? (
              <div className="px-4 py-4 text-xs leading-6 text-foreground">
                <InteractiveText
                  text={previewDialog.content}
                  mono={true}
                  onOpenUrl={onOpenUrl}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <Eye className="h-4 w-4" />
                {agentText(
                  "agentChat.harness.generated.4579c8c918",
                  "暂无可展示内容",
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          {previewDialog.path ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void onCopyPath()}
            >
              {agentText("agentChat.harness.generated.e0c29eaeb3", "复制路径")}
            </Button>
          ) : null}
          {previewDialog.content?.trim() ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void onCopyContent()}
            >
              {agentText("agentChat.harness.generated.3aeb16d4b1", "复制内容")}
            </Button>
          ) : null}
          {previewDialog.path ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void onRevealPath()}
            >
              {agentText("agentChat.harness.generated.6cd39eba27", "定位文件")}
            </Button>
          ) : null}
          {previewDialog.path ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void onOpenPath()}
            >
              {agentText("agentChat.harness.generated.e252faadbf", "系统打开")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {agentText("agentChat.harness.generated.6c14bd7f6f", "关闭")}
          </Button>
          {canOpenInConversation &&
          !previewDialog.isBinary &&
          previewDialog.content?.trim() ? (
            <Button type="button" onClick={onOpenFile}>
              {agentText(
                "agentChat.harness.generated.1ac483c406",
                "在会话中打开",
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
