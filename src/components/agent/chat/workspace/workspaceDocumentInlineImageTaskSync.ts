import type { Dispatch, SetStateAction } from "react";
import type { CanvasStateUnion } from "@/components/workspace/canvas/canvasUtils";
import {
  replaceDocumentImageTaskPlaceholderWithImage,
  upsertDocumentImageTaskPlaceholder,
} from "@/components/workspace/document/utils/imageTaskPlaceholder";

export interface DocumentInlineImageTaskOutput {
  url?: string | null;
  prompt?: string | null;
  slotId?: string | null;
  slotPrompt?: string | null;
}

export interface SyncDocumentInlineImageTaskParams {
  taskRecord: Record<string, unknown>;
  taskId: string;
  outputs: DocumentInlineImageTaskOutput[];
  setCanvasState: Dispatch<SetStateAction<CanvasStateUnion | null>>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  candidates: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return undefined;
}

function normalizePreviewPrompt(value?: string | null): string {
  const trimmed = value?.trim() || "";
  const mediaTagMatch = trimmed.match(/^\[(?:img|video):(.+)\]$/i);
  return mediaTagMatch?.[1]?.trim() || trimmed;
}

function normalizeTaskStatus(status?: string): string {
  switch ((status || "").trim().toLowerCase()) {
    case "partial":
      return "partial";
    case "completed":
    case "success":
    case "succeeded":
      return "succeeded";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "running";
  }
}

function normalizeText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveTaskSlotId(taskRecord: Record<string, unknown>): string | null {
  return (
    readString(
      [asRecord(taskRecord.relationships), asRecord(taskRecord.payload)],
      ["slot_id", "slotId"],
    ) || null
  );
}

function resolveTaskAnchorSectionTitle(
  taskRecord: Record<string, unknown>,
): string | null {
  return (
    readString(
      [asRecord(taskRecord.payload)],
      ["anchor_section_title", "anchorSectionTitle"],
    ) || null
  );
}

function resolveTaskAnchorText(
  taskRecord: Record<string, unknown>,
): string | null {
  return (
    readString([asRecord(taskRecord.payload)], ["anchor_text", "anchorText"]) ||
    null
  );
}

function isDocumentInlineTaskRecord(
  taskRecord: Record<string, unknown>,
): boolean {
  const payload = asRecord(taskRecord.payload);
  return (
    readString([payload], ["usage"]) === "document-inline" ||
    Boolean(resolveTaskSlotId(taskRecord))
  );
}

function resolveTaskPrompt(taskRecord: Record<string, unknown>): string {
  return (
    normalizePreviewPrompt(
      readString([asRecord(taskRecord.payload)], ["prompt"]),
    ) || "配图任务"
  );
}

export function applyDocumentInlineImageTaskSync(
  markdown: string,
  params: Pick<
    SyncDocumentInlineImageTaskParams,
    "taskRecord" | "taskId" | "outputs"
  >,
): string {
  if (!isDocumentInlineTaskRecord(params.taskRecord)) {
    return markdown;
  }

  const prompt = resolveTaskPrompt(params.taskRecord);
  const taskSlotId = resolveTaskSlotId(params.taskRecord);
  const anchorSectionTitle = resolveTaskAnchorSectionTitle(params.taskRecord);
  const anchorText = resolveTaskAnchorText(params.taskRecord);
  const normalizedStatus = normalizeTaskStatus(
    readString([params.taskRecord], ["normalized_status", "status"]),
  );
  const completed =
    normalizedStatus === "succeeded" || normalizedStatus === "partial";
  const outputs = params.outputs
    .map((output) => ({
      imageUrl: normalizeText(output.url),
      prompt:
        normalizePreviewPrompt(output.slotPrompt) ||
        normalizePreviewPrompt(output.prompt) ||
        prompt,
      slotId: normalizeText(output.slotId),
    }))
    .filter(
      (
        output,
      ): output is {
        imageUrl: string;
        prompt: string;
        slotId: string | null;
      } => Boolean(output.imageUrl),
    );

  if (completed && outputs.length > 0) {
    return outputs.reduce((content, output, index) => {
      return replaceDocumentImageTaskPlaceholderWithImage(content, {
        taskId: params.taskId,
        slotId: output.slotId || (index === 0 ? taskSlotId : null),
        anchorSectionTitle,
        anchorText,
        prompt: output.prompt,
        imageUrl: output.imageUrl,
      });
    }, markdown);
  }

  return upsertDocumentImageTaskPlaceholder(markdown, {
    taskId: params.taskId,
    slotId: taskSlotId,
    anchorSectionTitle,
    anchorText,
    prompt,
    status:
      normalizedStatus === "failed"
        ? "failed"
        : normalizedStatus === "cancelled"
          ? "cancelled"
          : "running",
  });
}

export function syncDocumentInlineImageTask({
  setCanvasState,
  ...params
}: SyncDocumentInlineImageTaskParams): void {
  setCanvasState((previous) => {
    if (!previous || previous.type !== "document") {
      return previous;
    }

    const nextContent = applyDocumentInlineImageTaskSync(
      previous.content,
      params,
    );
    if (nextContent === previous.content) {
      return previous;
    }

    return {
      ...previous,
      content: nextContent,
    };
  });
}
