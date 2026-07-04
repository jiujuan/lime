import { parseInlineHostCommandShortcodes } from "./inlineHostCommandShortcodes";
import {
  buildWorkspaceArticleEditedDraftKey,
  type WorkspaceArticleEditedDraft,
} from "./workspaceArticleWorkspaceEditedDraft";
import {
  selectWorkspaceArticleDraftObject,
  type WorkspaceArticleObject,
  type WorkspaceArticleWorkspace,
  type WorkspaceArticleWorkspaceImageSlotIntent,
} from "./workspaceArticleWorkspaceModel";

export interface WorkspaceArticleInlineHostCommandSyncResult {
  imageSlotIntents: WorkspaceArticleWorkspaceImageSlotIntent[];
  markdown: string;
  object: WorkspaceArticleObject;
}

export function isFixtureOnlyHostGenerationArticle(
  documentText: string | null | undefined,
): boolean {
  const text = typeof documentText === "string" ? documentText : "";
  return (
    text.includes("fixtureOnlyHostGeneration: true") ||
    text.includes("fixturePromptFingerprint:")
  );
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
    if (
      candidates.some((candidate) =>
        isSameWorkspaceArticleObject(candidate, object),
      )
    ) {
      return;
    }
    candidates.push(object);
  };

  pushCandidate(selectWorkspaceArticleDraftObject(articleWorkspace.objects));
  articleWorkspace.objects.forEach(pushCandidate);
  return candidates;
}

export function buildWorkspaceArticleInlineHostCommandSync(params: {
  articleWorkspace: WorkspaceArticleWorkspace | null;
  editedDraft: WorkspaceArticleEditedDraft | null;
}): WorkspaceArticleInlineHostCommandSyncResult | null {
  if (!params.articleWorkspace) {
    return null;
  }

  for (const object of resolveArticleDraftObjectCandidates(
    params.articleWorkspace,
  )) {
    const markdown = resolveObjectMarkdown(object, params.editedDraft);
    if (!markdown.trim() || isFixtureOnlyHostGenerationArticle(markdown)) {
      continue;
    }

    const parsed = parseInlineHostCommandShortcodes(markdown);
    if (
      parsed.requests.length === 0 ||
      parsed.materializedMarkdown === markdown
    ) {
      continue;
    }

    return {
      imageSlotIntents: parsed.requests.map((request) => ({
        anchorSectionTitle: request.anchorSectionTitle,
        anchorText: request.anchorText,
        articleWorkspace: params.articleWorkspace!,
        editedMarkdown: parsed.materializedMarkdown,
        object,
        prompt: request.prompt,
        slot: {
          id: request.slotId,
          title: request.prompt,
          prompt: request.prompt,
          status: "planned",
        },
      })),
      markdown: parsed.materializedMarkdown,
      object,
    };
  }

  return null;
}

export function applyWorkspaceArticleInlineHostCommandSyncResult(
  articleWorkspace: WorkspaceArticleWorkspace | null,
  syncResult: WorkspaceArticleInlineHostCommandSyncResult | null,
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
