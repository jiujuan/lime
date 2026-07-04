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

function normalizeThinkingTextIdentity(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function collapseExactRepeatedThinkingText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  for (let repeatCount = 4; repeatCount >= 2; repeatCount -= 1) {
    if (trimmed.length % repeatCount !== 0) {
      continue;
    }

    const chunkLength = trimmed.length / repeatCount;
    const chunk = trimmed.slice(0, chunkLength);
    if (!chunk.trim()) {
      continue;
    }

    let repeated = true;
    for (let index = 1; index < repeatCount; index += 1) {
      if (
        trimmed.slice(index * chunkLength, (index + 1) * chunkLength) !== chunk
      ) {
        repeated = false;
        break;
      }
    }

    if (repeated) {
      return chunk.trim();
    }
  }

  return trimmed;
}

function dedupeConsecutiveThinkingBlocks(value: string): string {
  const collapsed = collapseExactRepeatedThinkingText(value);
  const blocks = collapsed
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length <= 1) {
    return collapsed;
  }

  const deduped: string[] = [];
  blocks.forEach((block) => {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      normalizeThinkingTextIdentity(previous) ===
        normalizeThinkingTextIdentity(block)
    ) {
      return;
    }
    deduped.push(block);
  });

  return deduped.join("\n\n");
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
    return nextThinking
      ? dedupeConsecutiveThinkingBlocks(nextThinking)
      : undefined;
  }
  if (!nextThinking) {
    return dedupeConsecutiveThinkingBlocks(existingThinking);
  }
  const normalizedExistingThinking =
    dedupeConsecutiveThinkingBlocks(existingThinking);
  const normalizedNextThinking = dedupeConsecutiveThinkingBlocks(nextThinking);
  if (
    normalizedExistingThinking === normalizedNextThinking ||
    normalizedExistingThinking.includes(normalizedNextThinking)
  ) {
    return normalizedExistingThinking;
  }
  if (normalizedNextThinking.includes(normalizedExistingThinking)) {
    return normalizedNextThinking;
  }
  return `${normalizedExistingThinking}\n\n${normalizedNextThinking}`;
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

function hasDocumentMarkdownImageTaskRecoverySignal(
  documentMarkdowns?: readonly (string | null | undefined)[],
): boolean {
  return (documentMarkdowns || []).some((markdown) =>
    markdownContainsDocumentImageTaskPlaceholder(markdown),
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
  documentMarkdowns?: readonly (string | null | undefined)[];
}): boolean {
  const messages = params.messages || [];
  return (
    collectSeedImageTasks(messages).length > 0 ||
    Boolean(resolvePendingImageCommandRecoverySignature(messages)) ||
    hasCachedImageWorkbenchTasks(params.imageWorkbenchState) ||
    hasDocumentImageTaskRecoverySignal(params.canvasState) ||
    hasDocumentMarkdownImageTaskRecoverySignal(params.documentMarkdowns)
  );
}

export function shouldEnableWorkspaceImageTaskPreviewRuntime(params: {
  shouldDeferWorkspaceAuxiliaryLoads?: boolean;
  restoreFromWorkspace?: boolean;
  messages?: Message[];
  imageWorkbenchState?: SessionImageWorkbenchState;
  canvasState?: CanvasStateUnion | null;
  documentMarkdowns?: readonly (string | null | undefined)[];
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
    documentMarkdowns: params.documentMarkdowns,
  });
}
