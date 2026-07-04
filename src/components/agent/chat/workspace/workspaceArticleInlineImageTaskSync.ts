import { applyDocumentInlineImageTaskSync } from "./workspaceDocumentInlineImageTaskSync";
import type { Message } from "../types";
import type { Artifact } from "@/lib/artifact/types";
import type { SessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import {
  buildWorkspaceArticleEditedDraftKey,
  markdownContainsWorkspaceArticleInlineImageTask,
  readWorkspaceArticleObjectMarkdown,
  type WorkspaceArticleEditedDraft,
} from "./workspaceArticleWorkspaceEditedDraft";
import {
  buildWorkspaceArticleWorkspaceFromUnknown,
  selectWorkspaceArticleDraftObject,
  type WorkspaceArticleObject,
  type WorkspaceArticleWorkspace,
} from "./workspaceArticleWorkspaceModel";
import { collectWorkspaceArticlePatchRecordsFromArtifactLike } from "./workspaceArticleWorkspaceMetadata";

export interface WorkspaceArticleInlineImageTaskSyncResult {
  consumedTaskIds: string[];
  markdown: string;
  object: WorkspaceArticleObject;
}

export interface WorkspaceArticleInlineImageTaskMessageArtifactSyncParams {
  taskRecord: Record<string, unknown>;
  taskId: string;
  outputs: Array<{
    url?: string | null;
    prompt?: string | null;
    slotId?: string | null;
    slotPrompt?: string | null;
  }>;
}

interface BuildWorkspaceArticleInlineImageTaskSyncParams {
  articleWorkspace: WorkspaceArticleWorkspace | null;
  editedDraft: WorkspaceArticleEditedDraft | null;
  imageWorkbenchState: SessionImageWorkbenchState;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveObjectMarkdown(
  object: WorkspaceArticleObject,
  editedDraft: WorkspaceArticleEditedDraft | null,
): string {
  if (
    editedDraft &&
    editedDraft.objectKey === buildWorkspaceArticleEditedDraftKey(object)
  ) {
    return editedDraft.markdown;
  }
  return readWorkspaceArticleObjectMarkdown(object);
}

function normalizeTaskStatus(status: string): string {
  switch (status) {
    case "complete":
      return "completed";
    case "error":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "partial":
      return "partial";
    default:
      return "running";
  }
}

function hasArticleInlineImageTaskTarget(
  markdown: string,
  taskId: string,
  slotId: string,
): boolean {
  return (
    markdown.includes(`lime:image-task-slot:${slotId}`) ||
    markdown.includes(`pending-image-task://${encodeURIComponent(taskId)}`) ||
    markdown.includes(`pending-image-task://${taskId}`)
  );
}

function isSameWorkspaceArticleObject(
  left: WorkspaceArticleObject,
  right: WorkspaceArticleObject,
): boolean {
  return (
    left.ref.appId === right.ref.appId &&
    left.ref.sessionId === right.ref.sessionId &&
    left.ref.kind === right.ref.kind &&
    left.ref.id === right.ref.id
  );
}

function resolveArticleDraftObjectCandidates(
  articleWorkspace: WorkspaceArticleWorkspace,
): WorkspaceArticleObject[] {
  const candidates: WorkspaceArticleObject[] = [];
  const pushCandidate = (object: WorkspaceArticleObject | null) => {
    if (!object || object.ref.kind !== "articleDraft") {
      return;
    }
    if (candidates.some((candidate) => isSameWorkspaceArticleObject(candidate, object))) {
      return;
    }
    candidates.push(object);
  };

  pushCandidate(selectWorkspaceArticleDraftObject(articleWorkspace.objects));
  articleWorkspace.objects.forEach(pushCandidate);
  return candidates;
}

interface WorkspaceArticleInlineImageTaskTarget {
  applyTarget: Extract<
    NonNullable<SessionImageWorkbenchState["tasks"][number]["applyTarget"]>,
    { kind: "canvas-insert" }
  >;
  slotId: string;
  task: SessionImageWorkbenchState["tasks"][number];
}

function resolveWorkspaceArticleInlineImageTaskTargets(params: {
  articleWorkspace: WorkspaceArticleWorkspace | null;
  editedDraft: WorkspaceArticleEditedDraft | null;
  imageWorkbenchState: SessionImageWorkbenchState;
}): {
  initialMarkdown: string;
  object: WorkspaceArticleObject;
  targets: WorkspaceArticleInlineImageTaskTarget[];
} | null {
  if (!params.articleWorkspace) {
    return null;
  }

  const objectCandidates = resolveArticleDraftObjectCandidates(
    params.articleWorkspace,
  );
  if (objectCandidates.length === 0) {
    return null;
  }

  for (const object of objectCandidates) {
    const initialMarkdown = resolveObjectMarkdown(object, params.editedDraft);
    if (!initialMarkdown.trim()) {
      continue;
    }

    const targets = params.imageWorkbenchState.tasks
      .map((task): WorkspaceArticleInlineImageTaskTarget | null => {
        const applyTarget =
          task.applyTarget?.kind === "canvas-insert" ? task.applyTarget : null;
        const slotId = applyTarget?.slotId?.trim();
        if (
          !applyTarget ||
          applyTarget.canvasType !== "document" ||
          !slotId ||
          !hasArticleInlineImageTaskTarget(initialMarkdown, task.id, slotId)
        ) {
          return null;
        }
        return {
          applyTarget,
          slotId,
          task,
        };
      })
      .filter((target): target is WorkspaceArticleInlineImageTaskTarget =>
        Boolean(target),
      );

    if (targets.length === 0) {
      continue;
    }

    return {
      initialMarkdown,
      object,
      targets,
    };
  }

  return null;
}

export function selectWorkspaceArticleInlineImageTaskIds(params: {
  articleWorkspace: WorkspaceArticleWorkspace | null;
  editedDraft: WorkspaceArticleEditedDraft | null;
  imageWorkbenchState: SessionImageWorkbenchState;
}): string[] {
  return (
    resolveWorkspaceArticleInlineImageTaskTargets(params)?.targets.map(
      (target) => target.task.id,
    ) ?? []
  );
}

export function collectWorkspaceArticleInlineImageTaskRecoveryMarkdowns(params: {
  articleWorkspace: WorkspaceArticleWorkspace | null;
  editedDraft: WorkspaceArticleEditedDraft | null;
}): string[] {
  if (!params.articleWorkspace) {
    return [];
  }
  return params.articleWorkspace.objects
    .map((object) => resolveObjectMarkdown(object, params.editedDraft))
    .filter((markdown) =>
      markdownContainsWorkspaceArticleInlineImageTask(markdown),
    );
}

function collectArtifactDocumentInlineImageTaskRecoveryMarkdowns(
  artifact: Artifact,
): string[] {
  const markdowns = new Set<string>();
  const artifactDocument = asRecord(artifact.meta?.artifactDocument);
  const blocks = Array.isArray(artifactDocument?.blocks)
    ? artifactDocument.blocks
    : [];
  blocks.forEach((block) => {
    const blockRecord = asRecord(block);
    if (!blockRecord) {
      return;
    }
    ["markdown", "content"].forEach((key) => {
      const markdown = blockRecord[key];
      if (
        typeof markdown === "string" &&
        markdownContainsWorkspaceArticleInlineImageTask(markdown)
      ) {
        markdowns.add(markdown);
      }
    });
  });
  return [...markdowns];
}

function collectWorkspacePatchInlineImageTaskRecoveryMarkdowns(
  artifact: Artifact,
): string[] {
  const markdowns = new Set<string>();
  collectWorkspaceArticlePatchRecordsFromArtifactLike(artifact).forEach(
    (candidate) => {
      const articleWorkspace = buildWorkspaceArticleWorkspaceFromUnknown(
        candidate,
        "threadRead",
      );
      collectWorkspaceArticleInlineImageTaskRecoveryMarkdowns({
        articleWorkspace,
        editedDraft: articleWorkspace?.editedDraft ?? null,
      }).forEach((markdown) => markdowns.add(markdown));
    },
  );
  return [...markdowns];
}

export function collectWorkspaceArticleInlineImageTaskRecoveryMarkdownsFromMessages(
  messages: readonly Message[],
): string[] {
  const markdowns = new Set<string>();
  messages.forEach((message) => {
    (message.artifacts ?? []).forEach((artifact) => {
      const content = artifact.content?.trim();
      if (
        content &&
        markdownContainsWorkspaceArticleInlineImageTask(content)
      ) {
        markdowns.add(content);
      }
      collectArtifactDocumentInlineImageTaskRecoveryMarkdowns(artifact).forEach(
        (markdown) => markdowns.add(markdown),
      );
      collectWorkspacePatchInlineImageTaskRecoveryMarkdowns(artifact).forEach(
        (markdown) => markdowns.add(markdown),
      );
    });
  });
  return [...markdowns];
}

function syncInlineImageTaskMarkdown(
  markdown: unknown,
  params: WorkspaceArticleInlineImageTaskMessageArtifactSyncParams,
): string | null {
  if (typeof markdown !== "string" || !markdown.trim()) {
    return null;
  }
  const nextMarkdown = applyDocumentInlineImageTaskSync(markdown, params);
  return nextMarkdown === markdown ? null : nextMarkdown;
}

function syncInlineImageTaskWorkspacePatch(
  value: unknown,
  params: WorkspaceArticleInlineImageTaskMessageArtifactSyncParams,
): unknown {
  const record = asRecord(value);
  if (!record) {
    return value;
  }

  let changed = false;
  const nextRecord: Record<string, unknown> = { ...record };
  const objects = Array.isArray(record.objects) ? record.objects : null;
  if (objects) {
    const nextObjects = objects.map((object) => {
      const objectRecord = asRecord(object);
      const source = asRecord(objectRecord?.source);
      if (!objectRecord || !source) {
        return object;
      }

      let sourceChanged = false;
      const nextSource: Record<string, unknown> = { ...source };
      ["documentText", "finalMarkdown", "markdown", "content"].forEach(
        (key) => {
          const nextMarkdown = syncInlineImageTaskMarkdown(source[key], params);
          if (!nextMarkdown) {
            return;
          }
          sourceChanged = true;
          nextSource[key] = nextMarkdown;
        },
      );
      if (!sourceChanged) {
        return object;
      }
      changed = true;
      return {
        ...objectRecord,
        source: nextSource,
      };
    });
    if (changed) {
      nextRecord.objects = nextObjects;
    }
  }

  const editedDraft = asRecord(record.editedDraft) ?? asRecord(record.edited_draft);
  if (editedDraft) {
    let draftChanged = false;
    const nextEditedDraft: Record<string, unknown> = { ...editedDraft };
    ["markdown", "documentText", "finalMarkdown"].forEach((key) => {
      const nextMarkdown = syncInlineImageTaskMarkdown(
        editedDraft[key],
        params,
      );
      if (!nextMarkdown) {
        return;
      }
      draftChanged = true;
      nextEditedDraft[key] = nextMarkdown;
    });
    if (draftChanged) {
      changed = true;
      if (record.editedDraft) {
        nextRecord.editedDraft = nextEditedDraft;
      }
      if (record.edited_draft) {
        nextRecord.edited_draft = nextEditedDraft;
      }
    }
  }

  return changed ? nextRecord : value;
}

function syncInlineImageTaskArtifactDocument(
  value: unknown,
  params: WorkspaceArticleInlineImageTaskMessageArtifactSyncParams,
): unknown {
  const record = asRecord(value);
  const blocks = Array.isArray(record?.blocks) ? record.blocks : null;
  if (!record || !blocks) {
    return value;
  }

  let changed = false;
  const nextBlocks = blocks.map((block) => {
    const blockRecord = asRecord(block);
    if (!blockRecord) {
      return block;
    }

    let blockChanged = false;
    const nextBlock: Record<string, unknown> = { ...blockRecord };
    ["markdown", "content"].forEach((key) => {
      const nextMarkdown = syncInlineImageTaskMarkdown(
        blockRecord[key],
        params,
      );
      if (!nextMarkdown) {
        return;
      }
      blockChanged = true;
      nextBlock[key] = nextMarkdown;
    });
    if (!blockChanged) {
      return block;
    }
    changed = true;
    return nextBlock;
  });

  return changed
    ? {
        ...record,
        blocks: nextBlocks,
      }
    : value;
}

function syncInlineImageTaskArtifact(
  artifact: Artifact,
  params: WorkspaceArticleInlineImageTaskMessageArtifactSyncParams,
): Artifact {
  const nextContent = syncInlineImageTaskMarkdown(artifact.content, params);
  const workspacePatch = syncInlineImageTaskWorkspacePatch(
    artifact.meta.workspacePatch,
    params,
  );
  const artifactDocument = syncInlineImageTaskArtifactDocument(
    artifact.meta.artifactDocument,
    params,
  );
  const nextMeta =
    workspacePatch === artifact.meta.workspacePatch &&
    artifactDocument === artifact.meta.artifactDocument
      ? artifact.meta
      : {
          ...artifact.meta,
          workspacePatch,
          artifactDocument,
        };
  if (!nextContent && nextMeta === artifact.meta) {
    return artifact;
  }
  return {
    ...artifact,
    content: nextContent ?? artifact.content,
    meta: nextMeta,
    updatedAt: Date.now(),
  };
}

export function syncWorkspaceArticleInlineImageTaskMessageArtifacts(
  messages: readonly Message[],
  params: WorkspaceArticleInlineImageTaskMessageArtifactSyncParams,
): Message[] {
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (!message.artifacts || message.artifacts.length === 0) {
      return message;
    }
    const nextArtifacts = message.artifacts.map((artifact) => {
      const nextArtifact = syncInlineImageTaskArtifact(artifact, params);
      if (nextArtifact !== artifact) {
        changed = true;
      }
      return nextArtifact;
    });
    return nextArtifacts === message.artifacts
      ? message
      : {
          ...message,
          artifacts: nextArtifacts,
        };
  });
  return changed ? nextMessages : (messages as Message[]);
}

export function applyWorkspaceArticleInlineImageTaskSyncResult(
  articleWorkspace: WorkspaceArticleWorkspace | null,
  syncResult: WorkspaceArticleInlineImageTaskSyncResult | null,
): WorkspaceArticleWorkspace | null {
  if (!articleWorkspace || !syncResult) {
    return articleWorkspace;
  }

  let changed = false;
  const objects = articleWorkspace.objects.map((object) => {
    if (
      object.ref.appId !== syncResult.object.ref.appId ||
      object.ref.sessionId !== syncResult.object.ref.sessionId ||
      object.ref.kind !== syncResult.object.ref.kind ||
      object.ref.id !== syncResult.object.ref.id
    ) {
      return object;
    }
    changed = true;
    return {
      ...object,
      source: {
        ...(object.source ?? {}),
        documentText: syncResult.markdown,
        finalMarkdown: syncResult.markdown,
      },
    };
  });

  return changed
    ? {
        ...articleWorkspace,
        objects,
      }
    : articleWorkspace;
}

function isGeneratedImageWorkbenchMessage(
  message: Message,
  consumedTaskIds: Set<string>,
): boolean {
  for (const taskId of consumedTaskIds) {
    if (
      message.id === `image-workbench:${taskId}:assistant` ||
      message.id === `image-workbench:${taskId}:user`
    ) {
      return true;
    }
  }
  return false;
}

function hasNonImageWorkbenchMessagePayload(message: Message): boolean {
  return Boolean(
    message.content.trim() ||
    (message.artifacts?.length ?? 0) > 0 ||
    (message.contentParts?.length ?? 0) > 0 ||
    (message.toolCalls?.length ?? 0) > 0 ||
    (message.images?.length ?? 0) > 0 ||
    message.taskPreview ||
    message.runtimeStatus,
  );
}

export function suppressWorkspaceArticleInlineImageTaskPreviewMessages(
  messages: readonly Message[],
  consumedTaskIds: readonly string[],
): Message[] {
  if (messages.length === 0 || consumedTaskIds.length === 0) {
    return messages as Message[];
  }

  const consumedTaskIdSet = new Set(consumedTaskIds);
  let changed = false;
  const nextMessages: Message[] = [];
  for (const message of messages) {
    const previewTaskId = message.imageWorkbenchPreview?.taskId;
    const consumesPreview =
      previewTaskId && consumedTaskIdSet.has(previewTaskId);
    if (
      isGeneratedImageWorkbenchMessage(message, consumedTaskIdSet) ||
      (consumesPreview && !hasNonImageWorkbenchMessagePayload(message))
    ) {
      changed = true;
      continue;
    }
    if (consumesPreview) {
      changed = true;
      const { imageWorkbenchPreview: _preview, ...messageWithoutPreview } =
        message;
      nextMessages.push(messageWithoutPreview);
      continue;
    }
    nextMessages.push(message);
  }

  return changed ? nextMessages : (messages as Message[]);
}

export function buildWorkspaceArticleInlineImageTaskSync(
  params: BuildWorkspaceArticleInlineImageTaskSyncParams,
): WorkspaceArticleInlineImageTaskSyncResult | null {
  const resolved = resolveWorkspaceArticleInlineImageTaskTargets(params);
  if (!resolved) {
    return null;
  }

  const nextMarkdown = resolved.targets.reduce((markdown, target) => {
    const { applyTarget, slotId, task } = target;
    return applyDocumentInlineImageTaskSync(markdown, {
      taskId: task.id,
      taskRecord: {
        status: normalizeTaskStatus(task.status),
        payload: {
          usage: "document-inline",
          prompt: task.prompt,
          anchor_section_title: applyTarget.sectionTitle ?? undefined,
          anchor_text: applyTarget.anchorText ?? undefined,
        },
        relationships: {
          slot_id: slotId,
        },
      },
      outputs: params.imageWorkbenchState.outputs
        .filter((output) => output.taskId === task.id)
        .map((output) => ({
          prompt: output.prompt,
          slotId: output.slotId,
          slotPrompt: output.slotPrompt,
          url: output.url,
        })),
    });
  }, resolved.initialMarkdown);

  if (nextMarkdown === resolved.initialMarkdown) {
    return null;
  }

  return {
    consumedTaskIds: resolved.targets.map((target) => target.task.id),
    markdown: nextMarkdown,
    object: resolved.object,
  };
}
