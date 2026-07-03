const DEFAULT_WORKSPACE_PATCH_PATH =
  ".lime/artifacts/content-factory/workspace-patch.json";

function normalizeText(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function splitMarkdownParagraphBlocks(markdown) {
  const text = normalizeText(markdown, "");
  if (!text) {
    return [];
  }
  const blocks = [];
  const lines = text.split(/\r?\n/);
  let current = [];
  let inCodeFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isFence = trimmed.startsWith("```") || trimmed.startsWith("~~~");
    if (isFence) {
      inCodeFence = !inCodeFence;
    }
    if (!inCodeFence && trimmed === "") {
      const block = current.join("\n").trimEnd();
      if (block.trim()) {
        blocks.push(block);
      }
      current = [];
      continue;
    }
    current.push(line);
  }
  const trailing = current.join("\n").trimEnd();
  if (trailing.trim()) {
    blocks.push(trailing);
  }
  return blocks;
}

function buildMarkdownParagraphPrefixes(markdown) {
  const blocks = splitMarkdownParagraphBlocks(markdown);
  return blocks.reduce((prefixes, block) => {
    const previous = prefixes.at(-1);
    const next = previous ? `${previous}\n\n${block}` : block;
    if (prefixes.at(-1) !== next) {
      prefixes.push(next);
    }
    return prefixes;
  }, []);
}

function findArticleDraftObject(patch) {
  return Array.isArray(patch?.objects)
    ? patch.objects.find((object) => object?.ref?.kind === "articleDraft")
    : null;
}

function buildStreamingPatch(patch, documentText) {
  const article = findArticleDraftObject(patch);
  if (!article) {
    return cloneJson(patch);
  }
  const source = article.source || {};
  const streamingArticle = {
    ...cloneJson(article),
    status: "generating",
    summary: article.summary || "正在检索资料并生成文章草稿",
    source: {
      taskKind: source.taskKind,
      taskId: source.taskId,
      turnId: source.turnId,
      artifactIds: source.artifactIds,
      prompt: source.prompt,
      processMarkdown: source.processMarkdown,
      documentText,
      finalMarkdown: documentText,
      articleGenerationStatus: "streaming",
      hostSearchStatus: source.hostSearchStatus || "completed",
    },
  };
  return {
    schemaVersion: patch.schemaVersion,
    appId: patch.appId,
    sessionId: patch.sessionId,
    workspaceId: patch.workspaceId,
    surfaceKind: patch.surfaceKind,
    selectedObjectRef: patch.selectedObjectRef || article.ref,
    layoutState: patch.layoutState,
    objects: [streamingArticle],
  };
}

function buildWorkspacePatchArtifactSnapshot({
  artifact,
  articleWorkspaceSchema,
  artifactKind,
  complete,
  patch,
  sequence,
}) {
  const metadata = {
    ...(artifact.metadata || {}),
    kind: artifactKind,
    articleWorkspaceSchema,
    complete,
    writePhase: complete ? "persisted" : "streaming",
    contentStatus: complete ? "complete" : "streaming",
    contentFactoryWorkspacePatch: patch,
    workspace_patch: patch,
  };
  if (!complete) {
    metadata.streamSource = "worker_delta";
    metadata.streamSequence = sequence;
  }
  return {
    kind: "artifact.snapshot",
    artifactId: artifact.artifactId,
    artifactRef: artifact.artifactRef || artifact.artifactId,
    path: artifact.path || DEFAULT_WORKSPACE_PATCH_PATH,
    filePath: artifact.filePath || DEFAULT_WORKSPACE_PATCH_PATH,
    file_path:
      artifact.file_path || artifact.filePath || DEFAULT_WORKSPACE_PATCH_PATH,
    title: artifact.title || "Content Factory workspace patch",
    contentType: artifact.contentType || "application/json",
    status: complete ? "ready" : "streaming",
    metadata,
    content: JSON.stringify(patch),
  };
}

export function markWorkspacePatchArtifactComplete({
  artifact,
  articleWorkspaceSchema,
  artifactKind,
}) {
  if (!artifact?.metadata) {
    return artifact;
  }
  artifact.metadata = {
    ...artifact.metadata,
    kind: artifactKind,
    articleWorkspaceSchema,
    complete: true,
    writePhase: "persisted",
    contentStatus: "complete",
  };
  return artifact;
}

export async function emitArticleDraftParagraphSnapshots({
  articleWorkspaceSchema,
  artifactKind,
  context,
  response,
  writeRuntimeProgressEvent,
}) {
  if (context?.taskKind !== "content.article.generate") {
    return;
  }
  const artifact = response.artifacts?.find(
    (item) =>
      item?.kind === "artifact.snapshot" &&
      item?.metadata?.kind === artifactKind,
  );
  if (!artifact) {
    return;
  }
  const patch = artifact.metadata?.contentFactoryWorkspacePatch;
  const article = findArticleDraftObject(patch);
  const documentText = normalizeText(
    article?.source?.documentText ?? article?.source?.finalMarkdown,
    "",
  );
  const prefixes = buildMarkdownParagraphPrefixes(documentText);
  if (prefixes.length === 0) {
    return;
  }

  for (const [index, prefix] of prefixes.entries()) {
    const streamingPatch = buildStreamingPatch(patch, prefix);
    writeRuntimeProgressEvent("artifact.snapshot", {
      artifact: buildWorkspacePatchArtifactSnapshot({
        artifact,
        articleWorkspaceSchema,
        artifactKind,
        complete: false,
        patch: streamingPatch,
        sequence: index + 1,
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}
