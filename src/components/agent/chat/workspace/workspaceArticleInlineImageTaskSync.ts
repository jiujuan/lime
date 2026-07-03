import { applyDocumentInlineImageTaskSync } from "./workspaceDocumentInlineImageTaskSync";
import type { Message } from "../types";
import type { SessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import {
  buildWorkspaceArticleEditedDraftKey,
  type WorkspaceArticleEditedDraft,
} from "./workspaceArticleWorkspaceEditedDraft";
import {
  selectWorkspaceArticleDraftObject,
  type WorkspaceArticleObject,
  type WorkspaceArticleWorkspace,
} from "./workspaceArticleWorkspaceModel";

export interface WorkspaceArticleInlineImageTaskSyncResult {
  consumedTaskIds: string[];
  markdown: string;
  object: WorkspaceArticleObject;
}

interface BuildWorkspaceArticleInlineImageTaskSyncParams {
  articleWorkspace: WorkspaceArticleWorkspace | null;
  editedDraft: WorkspaceArticleEditedDraft | null;
  imageWorkbenchState: SessionImageWorkbenchState;
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
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
  const source = object.source ?? {};
  return readString(
    source.documentText,
    source.finalMarkdown,
    source.markdown,
    source.content,
  );
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
  const object = params.articleWorkspace
    ? selectWorkspaceArticleDraftObject(params.articleWorkspace.objects)
    : null;
  if (!object) {
    return null;
  }

  const initialMarkdown = resolveObjectMarkdown(object, params.editedDraft);
  if (!initialMarkdown.trim()) {
    return null;
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
    return null;
  }

  return {
    initialMarkdown,
    object,
    targets,
  };
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
