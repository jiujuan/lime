import {
  buildDocumentInlineImageApplyTarget,
  type ImageWorkbenchApplyTarget,
} from "./imageWorkbenchHelpers";
import { asRecord, readString } from "./imageTaskPreviewRuntimePayload";

export function resolveTaskRecordInlineApplyTarget(params: {
  baseApplyTarget: ImageWorkbenchApplyTarget | null;
  taskRecord: Record<string, unknown>;
  projectId?: string | null;
  contentId?: string | null;
}): ImageWorkbenchApplyTarget | null {
  const payload = asRecord(params.taskRecord.payload);
  const relationships = asRecord(params.taskRecord.relationships);
  const slotId = readString([relationships, payload], ["slot_id", "slotId"]);
  const usage = readString([payload], ["usage"]);
  if (usage !== "document-inline" && !slotId) {
    return params.baseApplyTarget;
  }

  if (params.baseApplyTarget?.kind === "document-cover") {
    return params.baseApplyTarget;
  }

  const baseCanvas =
    params.baseApplyTarget?.kind === "canvas-insert"
      ? params.baseApplyTarget
      : null;

  return buildDocumentInlineImageApplyTarget({
    slotId: slotId || baseCanvas?.slotId || null,
    anchorHint:
      readString([payload], ["anchor_hint", "anchorHint"]) ||
      baseCanvas?.anchorHint ||
      null,
    sectionTitle:
      readString([payload], ["anchor_section_title", "anchorSectionTitle"]) ||
      baseCanvas?.sectionTitle ||
      null,
    anchorText:
      readString([payload], ["anchor_text", "anchorText"]) ||
      baseCanvas?.anchorText ||
      null,
    projectId:
      readString([payload], ["project_id", "projectId"]) ??
      params.projectId ??
      null,
    contentId:
      readString([payload], ["content_id", "contentId"]) ??
      params.contentId ??
      null,
  });
}
