import type { CanvasStateUnion } from "@/components/workspace/canvas/canvasUtils";
import { markdownContainsDocumentImageTaskPlaceholder } from "@/components/workspace/document/utils/imageTaskPlaceholder";
import type {
  ContentPart,
  Message,
  MessageImageWorkbenchPreview,
} from "../types";
import { parseImageWorkbenchCommand } from "../utils/imageWorkbenchCommand";
import type { SessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import { normalizeImageTaskPath } from "./imageTaskLocator";
import { isImageWorkbenchSubmissionTemplateText } from "../utils/imageWorkbenchStatusText";

export interface SeedImageTaskRecord {
  taskId: string;
  taskFilePath?: string;
  artifactPath?: string;
}

export function isDraftImageWorkbenchTaskId(taskId?: string | null): boolean {
  return taskId?.trim().startsWith("draft-image-") === true;
}

export function contentPartContainsProcess(part: ContentPart): boolean {
  return part.type !== "text";
}

function extractMessageThinkingContent(
  message: Pick<Message, "thinkingContent" | "contentParts">,
): string | undefined {
  const explicitThinking = message.thinkingContent?.trim()
    ? message.thinkingContent
    : undefined;
  if (explicitThinking) {
    return explicitThinking;
  }

  const thinkingText = (message.contentParts || [])
    .filter(
      (
        part,
      ): part is Extract<ContentPart, { type: "thinking"; text: string }> =>
        part.type === "thinking" && part.text.trim().length > 0,
    )
    .map((part) => part.text)
    .join("");
  return thinkingText.trim() ? thinkingText : undefined;
}

export function mergeMessageThinkingContent(params: {
  existingMessage: Message;
  nextMessage: Message;
}): string | undefined {
  const existingThinking = extractMessageThinkingContent(
    params.existingMessage,
  );
  const nextThinking = extractMessageThinkingContent(params.nextMessage);

  if (!existingThinking) {
    return nextThinking;
  }
  if (!nextThinking) {
    return existingThinking;
  }
  if (
    existingThinking === nextThinking ||
    existingThinking.includes(nextThinking)
  ) {
    return existingThinking;
  }
  if (nextThinking.includes(existingThinking)) {
    return nextThinking;
  }
  return `${existingThinking}\n\n${nextThinking}`;
}

export function collectSeedImageTasks(
  messages?: Message[],
): SeedImageTaskRecord[] {
  if (!messages || messages.length === 0) {
    return [];
  }

  const tasks: SeedImageTaskRecord[] = [];
  const seen = new Set<string>();
  messages.forEach((message) => {
    if (message.role !== "assistant") {
      return;
    }

    const taskId = message.imageWorkbenchPreview?.taskId?.trim();
    if (!taskId || isDraftImageWorkbenchTaskId(taskId) || seen.has(taskId)) {
      return;
    }

    seen.add(taskId);
    tasks.push({
      taskId,
      taskFilePath: normalizeImageTaskPath(
        message.imageWorkbenchPreview?.taskFilePath,
      ),
      artifactPath: normalizeImageTaskPath(
        message.imageWorkbenchPreview?.artifactPath,
      ),
    });
  });
  return tasks;
}

function hasCachedImageWorkbenchTasks(
  imageWorkbenchState?: SessionImageWorkbenchState,
): boolean {
  return (imageWorkbenchState?.tasks || []).some(
    (task) => !isDraftImageWorkbenchTaskId(task.id),
  );
}

function hasDocumentImageTaskRecoverySignal(
  canvasState?: CanvasStateUnion | null,
): boolean {
  return (
    canvasState?.type === "document" &&
    markdownContainsDocumentImageTaskPlaceholder(canvasState.content)
  );
}

export function normalizeImageWorkbenchPreviewIdentityText(
  value?: string | null,
): string {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isDraftImageWorkbenchPreview(
  preview?: MessageImageWorkbenchPreview,
): boolean {
  return isDraftImageWorkbenchTaskId(preview?.taskId);
}

function imageWorkbenchPreviewHasImage(
  preview: MessageImageWorkbenchPreview,
): boolean {
  if (preview.imageUrl?.trim()) {
    return true;
  }
  return (preview.previewImages || []).some((url) => url.trim().length > 0);
}

function imageWorkbenchPreviewBlocksPendingRecovery(
  preview?: MessageImageWorkbenchPreview,
): boolean {
  if (!preview || isDraftImageWorkbenchPreview(preview)) {
    return false;
  }
  return preview.status !== "running" || imageWorkbenchPreviewHasImage(preview);
}

function messageHasImageWorkbenchProcessSignal(message: Message): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  return (
    Boolean(message.isThinking) ||
    Boolean(message.runtimeStatus) ||
    Boolean(
      message.imageWorkbenchPreview &&
      !isDraftImageWorkbenchPreview(message.imageWorkbenchPreview),
    ) ||
    isImageWorkbenchSubmissionTemplateText(message.content) ||
    (message.toolCalls?.length || 0) > 0 ||
    (message.contentParts || []).some(contentPartContainsProcess)
  );
}

function messageHasTerminalFailureWithoutImageTaskSignal(
  message: Message,
): boolean {
  if (message.role !== "assistant") {
    return false;
  }
  if (
    message.runtimeStatus?.phase !== "failed" &&
    message.runtimeStatus?.phase !== "cancelled"
  ) {
    return false;
  }
  if (
    message.imageWorkbenchPreview &&
    !isDraftImageWorkbenchPreview(message.imageWorkbenchPreview)
  ) {
    return false;
  }
  if ((message.toolCalls?.length || 0) > 0) {
    return false;
  }
  return !(message.contentParts || []).some(contentPartContainsProcess);
}

function resolveMessageTimestampMsLocal(message: Message): number | null {
  return message.timestamp instanceof Date ? message.timestamp.getTime() : null;
}

export function resolvePendingImageCommandRecoverySignature(
  messages?: Message[],
): string | null {
  if (!messages || messages.length === 0) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    const parsedCommand = parseImageWorkbenchCommand(message.content || "");
    if (!parsedCommand) {
      continue;
    }

    const trailingMessages = messages.slice(index + 1);
    if (trailingMessages.length === 0) {
      return null;
    }

    if (
      trailingMessages.some(messageHasTerminalFailureWithoutImageTaskSignal)
    ) {
      return null;
    }

    if (
      trailingMessages.some(
        (candidate) =>
          candidate.role === "assistant" &&
          imageWorkbenchPreviewBlocksPendingRecovery(
            candidate.imageWorkbenchPreview,
          ),
      )
    ) {
      return null;
    }

    if (!trailingMessages.some(messageHasImageWorkbenchProcessSignal)) {
      return null;
    }

    const messageTimestamp = resolveMessageTimestampMsLocal(message);
    return [
      message.id,
      messageTimestamp === null ? "" : String(messageTimestamp),
      normalizeImageWorkbenchPreviewIdentityText(parsedCommand.rawText),
    ].join("::");
  }

  return null;
}

export function shouldProbeWorkspaceImageTaskCatalog(params: {
  messages?: Message[];
  imageWorkbenchState?: SessionImageWorkbenchState;
  canvasState?: CanvasStateUnion | null;
}): boolean {
  const messages = params.messages || [];
  return (
    collectSeedImageTasks(messages).length > 0 ||
    Boolean(resolvePendingImageCommandRecoverySignature(messages)) ||
    hasCachedImageWorkbenchTasks(params.imageWorkbenchState) ||
    hasDocumentImageTaskRecoverySignal(params.canvasState)
  );
}

export function shouldEnableWorkspaceImageTaskPreviewRuntime(params: {
  shouldDeferWorkspaceAuxiliaryLoads?: boolean;
  restoreFromWorkspace?: boolean;
  messages?: Message[];
  imageWorkbenchState?: SessionImageWorkbenchState;
  canvasState?: CanvasStateUnion | null;
}): boolean {
  if (!params.shouldDeferWorkspaceAuxiliaryLoads) {
    return true;
  }

  const messages = params.messages || [];
  if (
    messages.some((message) =>
      Boolean(message.imageWorkbenchPreview || message.imageRuntimeContract),
    )
  ) {
    return true;
  }

  const imageWorkbenchState = params.imageWorkbenchState;
  if (
    imageWorkbenchState?.active ||
    (imageWorkbenchState?.tasks || []).length > 0 ||
    (imageWorkbenchState?.outputs || []).length > 0
  ) {
    return true;
  }

  if (!params.restoreFromWorkspace) {
    return false;
  }

  return shouldProbeWorkspaceImageTaskCatalog({
    messages,
    imageWorkbenchState,
    canvasState: params.canvasState,
  });
}
