import type {
  WorkspaceArticleObject,
  WorkspaceArticleWorkspaceCitation,
  WorkspaceArticleWorkspaceImageSlot,
  WorkspaceArticleWorkspaceOutlineSection,
  WorkspaceArticleWorkspacePreviewChecklistItem,
  WorkspaceArticleWorkspacePreviewField,
  WorkspaceArticleWorkspacePreviewImage,
  WorkspaceArticleWorkspacePreviewStoryboardRow,
  WorkspaceArticleWorkspaceResearchRound,
  WorkspaceArticleWorkspaceStructuredPreview,
  WorkspaceArticleWorkspaceTitleCandidate,
  WorkspaceArticleWorkspaceWritingPlanStep,
} from "./workspaceArticleWorkspaceModel";

export function buildWorkspaceArticleObjectStructuredPreview(
  object: WorkspaceArticleObject,
): WorkspaceArticleWorkspaceStructuredPreview {
  const source = object.source ?? {};
  return {
    processMarkdown: readWorkspaceArticleDraftProcessMarkdown(source),
    documentText: readWorkspaceArticleDraftDocumentText(source),
    images: readArray(
      source.images,
      source.imageItems,
      source.image_items,
      source.imageUrls,
      source.image_urls,
    )
      .map(readPreviewImage)
      .filter((item): item is WorkspaceArticleWorkspacePreviewImage =>
        Boolean(item),
      ),
    storyboard: readArray(source.shots, source.storyboard, source.scenes)
      .map(readStoryboardRow)
      .filter((item): item is WorkspaceArticleWorkspacePreviewStoryboardRow =>
        Boolean(item),
      ),
    checklist: readArray(
      source.items,
      source.checklist,
      source.checklistItems,
      source.checklist_items,
    )
      .map(readChecklistItem)
      .filter((item): item is WorkspaceArticleWorkspacePreviewChecklistItem =>
        Boolean(item),
      ),
    briefFields: readPreviewFields(source),
    researchRounds: readArray(source.researchRounds, source.research_rounds)
      .map(readResearchRound)
      .filter((item): item is WorkspaceArticleWorkspaceResearchRound =>
        Boolean(item),
      ),
    titleCandidates: readArray(source.titleCandidates, source.title_candidates)
      .map(readTitleCandidate)
      .filter((item): item is WorkspaceArticleWorkspaceTitleCandidate =>
        Boolean(item),
      ),
    outline: readArray(source.outline, source.sections)
      .map(readOutlineSection)
      .filter((item): item is WorkspaceArticleWorkspaceOutlineSection =>
        Boolean(item),
      ),
    keyTakeaways: readStringItems(
      source.keyTakeaways,
      source.key_takeaways,
      source.takeaways,
    ),
    imageSlots: readArray(source.imageSlots, source.image_slots)
      .map(readImageSlot)
      .filter((item): item is WorkspaceArticleWorkspaceImageSlot =>
        Boolean(item),
      ),
    citations: readArray(source.citations, source.references)
      .map(readCitation)
      .filter((item): item is WorkspaceArticleWorkspaceCitation =>
        Boolean(item),
      ),
    writingPlan: readArray(source.writingPlan, source.writing_plan)
      .map(readWritingPlanStep)
      .filter((item): item is WorkspaceArticleWorkspaceWritingPlanStep =>
        Boolean(item),
      ),
    reviewNotes: readStringItems(
      source.reviewNotes,
      source.review_notes,
      source.risks,
    ),
  };
}

function readWorkspaceArticleDraftProcessMarkdown(
  source: Record<string, unknown>,
): string | null {
  return (
    readString(
      source.processMarkdown,
      source.process_markdown,
      source.draftMarkdown,
      source.draft_markdown,
    ) || null
  );
}

function readWorkspaceArticleDraftDocumentText(
  source: Record<string, unknown>,
): string | null {
  return (
    readString(
      source.documentText,
      source.document_text,
      source.finalMarkdown,
      source.final_markdown,
    ) || null
  );
}

export function readWorkspaceArticleDraftMarkdown(
  source: Record<string, unknown>,
): string {
  return readWorkspaceArticleDraftDocumentText(source) ?? "";
}

function readStringItems(...values: unknown[]): string[] {
  return readArray(...values).filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function readNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readResearchRound(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceResearchRound | null {
  const fallbackId = `research-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? {
          id: fallbackId,
          title: normalized,
          summary: normalized,
          citations: [],
        }
      : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const title = readString(record.title, record.name, record.query);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    query: readString(record.query, record.keyword) || null,
    status: readString(record.status, record.state) || null,
    summary:
      readString(record.summary, record.description, record.result) || null,
    citations: readStringItems(record.citations, record.references),
  };
}

function readTitleCandidate(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceTitleCandidate | null {
  const fallbackId = `title-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? { id: fallbackId, title: normalized } : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const title = readString(record.title, record.name, record.text);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    angle: readString(record.angle, record.reason, record.description) || null,
    score: readNumberValue(record.score),
  };
}

function readOutlineSection(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceOutlineSection | null {
  const fallbackId = `section-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? { id: fallbackId, title: normalized, points: [], evidenceIds: [] }
      : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const title = readString(record.title, record.name, record.heading);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    purpose:
      readString(record.purpose, record.summary, record.description) || null,
    points: readStringItems(record.points, record.bullets),
    evidenceIds: readStringItems(record.evidenceIds, record.evidence_ids),
  };
}

function readImageSlot(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceImageSlot | null {
  const fallbackId = `image-slot-${index + 1}`;
  const record = asRecord(value);
  if (!record) {
    return typeof value === "string" && value.trim()
      ? { id: fallbackId, title: value.trim() }
      : null;
  }
  const title = readString(record.title, record.name, record.id);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    sectionId: readString(record.sectionId, record.section_id) || null,
    purpose: readString(record.purpose, record.description) || null,
    prompt:
      readString(record.prompt, record.imagePrompt, record.image_prompt) ||
      null,
    status: readString(record.status, record.state) || null,
  };
}

function readCitation(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceCitation | null {
  const fallbackId = `citation-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? { id: fallbackId, title: normalized } : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const title = readString(record.title, record.name, record.url, record.id);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    sourceType:
      readString(record.sourceType, record.source_type, record.type) || null,
    summary:
      readString(record.summary, record.description, record.notes) || null,
    status: readString(record.status, record.state) || null,
  };
}

function readWritingPlanStep(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspaceWritingPlanStep | null {
  const fallbackId = `plan-${index + 1}`;
  const record = asRecord(value);
  if (!record) {
    return typeof value === "string" && value.trim()
      ? { id: fallbackId, title: value.trim() }
      : null;
  }
  const title = readString(record.title, record.name, record.id);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    owner: readString(record.owner, record.subagent) || null,
    skillRef: readString(record.skillRef, record.skill_ref) || null,
    output:
      readString(
        record.output,
        record.expectedOutput,
        record.expected_output,
      ) || null,
    goal: readString(record.goal) || null,
    done: typeof record.done === "boolean" ? record.done : null,
  };
}

function readPreviewImage(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspacePreviewImage | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? {
          id: normalized,
          title: normalized,
          url: normalized,
        }
      : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const url = readString(record.url, record.src, record.thumbnailUrl);
  const localPath = readString(
    record.localPath,
    record.local_path,
    record.filePath,
    record.file_path,
    record.path,
    record.cachedPath,
    record.cached_path,
    record.assetPath,
    record.asset_path,
  );
  const id =
    readString(
      record.id,
      record.artifactId,
      record.artifact_id,
      url,
      localPath,
    ) || `image-${index + 1}`;
  return {
    id,
    title: readString(record.title, record.name, record.alt, id) || id,
    url: url || null,
    localPath: localPath || null,
    filePath: readString(record.filePath, record.file_path) || null,
    cachedPath: readString(record.cachedPath, record.cached_path) || null,
    alt: readString(record.alt, record.description) || null,
    prompt:
      readString(record.prompt, record.imagePrompt, record.image_prompt) ||
      null,
  };
}

function readStoryboardRow(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspacePreviewStoryboardRow | null {
  const fallbackId = `shot-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? {
          id: fallbackId,
          title: normalized,
        }
      : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id, record.shotId, record.shot_id) || fallbackId;
  const title =
    readString(record.title, record.name, record.scene, record.summary) ||
    `${index + 1}`;
  return {
    id,
    title,
    description:
      readString(
        record.description,
        record.action,
        record.camera,
        record.notes,
      ) || null,
    visualPrompt:
      readString(record.visualPrompt, record.visual_prompt, record.prompt) ||
      null,
    duration: readString(record.duration, record.time, record.seconds) || null,
  };
}

function readChecklistItem(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspacePreviewChecklistItem | null {
  const fallbackId = `item-${index + 1}`;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? {
          id: fallbackId,
          title: normalized,
        }
      : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const title = readString(record.title, record.label, record.name);
  if (!title) {
    return null;
  }
  return {
    id: readString(record.id, record.key) || fallbackId,
    title,
    status: readString(record.status, record.state) || null,
    notes: readString(record.notes, record.description, record.reason) || null,
  };
}

function readPreviewFields(
  source: Record<string, unknown>,
): WorkspaceArticleWorkspacePreviewField[] {
  const fields = readArray(
    source.fields,
    source.briefFields,
    source.brief_fields,
  )
    .map(readPreviewField)
    .filter((item): item is WorkspaceArticleWorkspacePreviewField =>
      Boolean(item),
    );
  if (fields.length > 0) {
    return fields;
  }

  const brief = asRecord(source.brief);
  if (!brief) {
    return [];
  }
  return Object.entries(brief)
    .map(([key, value]) => {
      const normalized = readString(value);
      return normalized
        ? {
            key,
            label: key,
            value: normalized,
          }
        : null;
    })
    .filter((item): item is WorkspaceArticleWorkspacePreviewField =>
      Boolean(item),
    );
}

function readPreviewField(
  value: unknown,
  index: number,
): WorkspaceArticleWorkspacePreviewField | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const key = readString(record.key, record.id) || `field-${index + 1}`;
  const label = readString(record.label, record.title, record.name, key);
  const fieldValue = readString(record.value, record.text, record.content);
  if (!fieldValue) {
    return null;
  }
  return {
    key,
    label,
    value: fieldValue,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function readArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}
