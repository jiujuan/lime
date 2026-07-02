import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentFactoryWorkerProgressEvents,
  buildContentFactoryWorkspacePatch,
  handleContentFactoryWorkerRequest,
  runContentFactoryTask
} from "../src/runtime/content-factory-worker.mjs";

test("content.factory.generate outputs a full Article Workspace patch", () => {
  const result = runContentFactoryTask({
    taskKind: "content.factory.generate",
    sessionId: "session-test-001",
    topic: "内容工厂工作台",
    audience: "运营团队"
  });

  assert.equal(result.artifactKind, "content_factory.workspace_patch");
  assert.equal(result.patch.appId, "content-factory-app");
  assert.equal(result.patch.sessionId, "session-test-001");
  assert.equal(result.patch.schemaVersion, "article-workspace.v1");
  assert.equal(result.patch.layoutState.activeTabKind, "articleWorkspace");
  assert.deepEqual(result.patch.layoutState.openTabKinds, [
    "articleWorkspace",
    "files",
    "evidence"
  ]);
  assert.equal(result.patch.primaryObjectRef.kind, "articleDraft");
  assert.ok(result.patch.objects.some((object) => object.ref.kind === "contentBrief"));
  assert.ok(result.patch.objects.some((object) => object.ref.kind === "articleDraft"));
  assert.ok(result.patch.objects.some((object) => object.ref.kind === "imageGenerationSet"));
  assert.ok(result.patch.objects.some((object) => object.ref.kind === "videoStoryboard"));
  assert.ok(result.patch.objects.some((object) => object.ref.kind === "deliveryChecklist"));
  assert.ok(Array.isArray(result.patch.workerEvidence[0].researchRounds));
  assert.equal(result.patch.workerEvidence[0].researchRounds.length, 3);
  assert.match(result.patch.workerEvidence[0].researchRounds[0].query, /内容工厂工作台/);
  assert.ok(Array.isArray(result.patch.workerEvidence[0].titleCandidates));
  assert.ok(Array.isArray(result.patch.workerEvidence[0].outline));
  assert.ok(Array.isArray(result.patch.workerEvidence[0].imageSlots));
  assert.ok(Array.isArray(result.patch.workerEvidence[0].searchRequests));
  assert.ok(Array.isArray(result.patch.workerEvidence[0].searchEvidence));
  assert.ok(Array.isArray(result.patch.workerEvidence[0].reviewChecklist));
  assert.equal(result.patch.workerEvidence[0].imagePlan.status, "planned");
  assert.equal(result.patch.workerEvidence[0].titleCandidates.length, 3);
  assert.ok(result.patch.workerEvidence[0].outline.length >= 5);
  assert.equal(result.patch.workerEvidence[0].imageSlots.length, 3);
  assert.equal(result.patch.workerEvidence[0].searchRequests.length, 3);
  assert.equal(result.patch.workerEvidence[0].searchEvidence.length, 3);
  assert.ok(result.patch.workerEvidence[0].reviewChecklist.length >= 3);
  assert.equal(
    result.patch.workerEvidence[0].searchRequests[0].status,
    "ready_for_host_execution"
  );
  assert.ok(
    result.patch.workerEvidence[0].skillRefs.includes("article-writing")
  );
});

test("host worker request returns artifact snapshot response", () => {
  const response = handleContentFactoryWorkerRequest({
    schemaVersion: "content-factory.worker-request.v1",
    appId: "content-factory-app",
    sessionId: "session-host-001",
    workspaceId: "workspace-main",
    turnId: "turn-host-001",
    taskId: "task-host-001",
    taskKind: "content.article.generate",
    prompt: "写一篇关于 golang 学习的公众号文章",
    expectedOutput: {
      artifactKind: "content_factory.workspace_patch"
    },
    runtime: {
      outputArtifactKind: "content_factory.workspace_patch",
      directProviderAccess: false,
      directFilesystemAccess: false
    },
    requestedAt: "2026-06-28T00:00:00.000Z"
  });

  assert.equal(response.schemaVersion, "content-factory.worker-response.v1");
  assert.equal(response.status, "completed");
  assert.equal(response.sessionId, "session-host-001");
  assert.equal(response.taskKind, "content.article.generate");
  assert.equal(response.artifacts[0].kind, "artifact.snapshot");
  assert.equal(response.artifacts[0].path, ".lime/artifacts/content-factory/workspace-patch.json");
  assert.equal(response.artifacts[0].metadata.complete, true);
  assert.equal(response.artifacts[0].metadata.writePhase, "persisted");
  assert.equal(
    response.artifacts[0].metadata.kind,
    "content_factory.workspace_patch"
  );
  const patch = response.artifacts[0].metadata.contentFactoryWorkspacePatch;
  assert.equal(patch.workspaceId, "workspace-main");
  assert.equal(patch.selectedObjectRef.kind, "articleDraft");
  const article = patch.objects.find((object) => object.ref.kind === "articleDraft");
  assert.ok(article);
  assert.equal(Object.hasOwn(article.source, "markdown"), false);
  assert.match(
    article.source.documentText ?? "",
    /Golang 学习路线/
  );
  assert.match(
    article.source.finalMarkdown ?? "",
    /Golang 学习路线/
  );
  assert.match(
    article.source.processMarkdown ?? "",
    /待执行检索/
  );
  assert.equal(article?.source.researchRounds.length, 3);
  assert.equal(article?.source.titleCandidates.length, 3);
  assert.ok(article?.source.outline.length >= 5);
  assert.equal(article?.source.imageSlots.length, 3);
  assert.equal(article?.source.searchRequests.length, 3);
  assert.equal(article?.source.searchEvidence.length, 3);
  assert.ok(article?.source.reviewChecklist.length >= 3);
  assert.equal(article?.source.imagePlan.status, "planned");
  assert.ok(article?.source.citations.length >= 1);
  assert.ok(article?.source.writingPlan.length >= 5);
  assert.match(article?.source.processMarkdown ?? "", /## 检索轮次/);
  assert.match(article?.source.processMarkdown ?? "", /## 编排步骤/);
  assert.match(article?.source.documentText ?? "", /## 第一阶段：打牢基础/);
  assert.match(article?.source.documentText ?? "", /## 第二阶段：用项目建立反馈/);
  assert.match(article?.source.documentText ?? "", /goroutine/);
  assert.doesNotMatch(article?.source.documentText ?? "", /## 待执行检索/);
  assert.doesNotMatch(article?.source.documentText ?? "", /## 编排步骤/);
  assert.doesNotMatch(article?.source.documentText ?? "", /不要只生成一段话/);
  assert.doesNotMatch(article?.source.documentText ?? "", /右侧编辑器/);
  assert.doesNotMatch(article?.source.documentText ?? "", /内容工厂/);
  assert.equal(
    response.artifacts[0].metadata.articleWorkspaceSchema,
    "article-workspace.v1"
  );
});

test("host worker request emits paragraph-level artifact progress events", () => {
  const request = {
    schemaVersion: "content-factory.worker-request.v1",
    appId: "content-factory-app",
    sessionId: "session-host-001",
    workspaceId: "workspace-main",
    turnId: "turn-host-001",
    taskId: "task-host-001",
    taskKind: "content.article.generate",
    prompt: "写一篇关于 golang 学习的公众号文章",
    expectedOutput: {
      artifactKind: "content_factory.workspace_patch"
    },
    runtime: {
      outputArtifactKind: "content_factory.workspace_patch",
      directProviderAccess: false,
      directFilesystemAccess: false
    },
    requestedAt: "2026-06-28T00:00:00.000Z"
  };

  const progressEvents = buildContentFactoryWorkerProgressEvents(request);
  const response = handleContentFactoryWorkerRequest(request);
  const finalPatch = response.artifacts[0].metadata.contentFactoryWorkspacePatch;
  const finalArticle = finalPatch.objects.find(
    (object) => object.ref.kind === "articleDraft"
  );

  assert.ok(progressEvents.length >= 2);
  assert.equal(progressEvents[0].kind, "runtime.event");
  assert.equal(progressEvents[0].eventType, "workflow.connector.requested");
  assert.equal(progressEvents[0].payload.stepId, "research");
  assert.equal(progressEvents[0].payload.connectorRef, "web-research");
  assert.equal(progressEvents[0].payload.toolName, "WebSearch");
  assert.equal(progressEvents[0].payload.auditOnly, true);
  assert.match(progressEvents[0].payload.query, /golang 学习/);
  const artifactProgressEvents = progressEvents.filter(
    (event) => event.eventType === "artifact.snapshot"
  );
  assert.ok(artifactProgressEvents.length >= 2);
  assert.equal(artifactProgressEvents[0].kind, "runtime.event");
  assert.equal(
    artifactProgressEvents[0].payload.artifact.artifactId,
    "task-host-001:workspace-patch"
  );
  assert.equal(
    artifactProgressEvents[0].payload.artifact.metadata.streamSource,
    "worker_delta"
  );
  assert.equal(artifactProgressEvents[0].payload.artifact.metadata.complete, false);
  assert.equal(artifactProgressEvents[0].payload.artifact.metadata.streamSequence, 1);

  const partialLengths = artifactProgressEvents.map((event, index) => {
    assert.equal(event.payload.artifact.metadata.streamSequence, index + 1);
    assert.equal(event.payload.artifact.metadata.writePhase, "streaming");
    assert.equal(
      event.payload.artifact.path,
      ".lime/artifacts/content-factory/workspace-patch.json"
    );
    const patch = event.payload.artifact.metadata.contentFactoryWorkspacePatch;
    const article = patch.objects.find((object) => object.ref.kind === "articleDraft");
    assert.equal(article.status, "generating");
    return article.source.documentText.length;
  });

  assert.ok(partialLengths[0] < partialLengths.at(-1));
  assert.ok(partialLengths.at(-1) < finalArticle.source.documentText.length);
  assert.match(
    artifactProgressEvents[0].payload.artifact.metadata.contentFactoryWorkspacePatch.objects.find(
      (object) => object.ref.kind === "articleDraft"
    ).source.documentText,
    /Golang 学习路线/
  );
});

test("host managed generation output overrides deterministic article draft text", () => {
  const response = handleContentFactoryWorkerRequest({
    schemaVersion: "content-factory.worker-request.v1",
    appId: "content-factory-app",
    sessionId: "session-host-managed-001",
    workspaceId: "workspace-main",
    turnId: "turn-host-managed-001",
    taskId: "task-host-managed-001",
    taskKind: "content.article.generate",
    prompt: "写一篇关于内容工厂的公众号文章",
    expectedOutput: {
      artifactKind: "content_factory.workspace_patch"
    },
    runtime: {
      outputArtifactKind: "content_factory.workspace_patch",
      directProviderAccess: false,
      directFilesystemAccess: false
    },
    hostManagedGeneration: {
      schemaVersion: "lime.agent_app.host_managed_generation.v1",
      source: "app_server_runtime_backend",
      status: "completed",
      provider: "test-provider",
      model: "test-model",
      outputs: [
        {
          id: "article-draft-document",
          kind: "markdown_document",
          targetObjectKind: "articleDraft",
          outputField: "documentText",
          contentType: "text/markdown",
          content: "# 宿主生成标题\n\n导语先说明为什么内容生产链路必须收敛。\n\n## 第一节\n\n这里是宿主托管生成的正文。"
        }
      ]
    },
    requestedAt: "2026-06-28T00:00:00.000Z"
  });

  const patch = response.artifacts[0].metadata.contentFactoryWorkspacePatch;
  const article = patch.objects.find((object) => object.ref.kind === "articleDraft");

  assert.equal(
    article?.source.documentText,
    "# 宿主生成标题\n\n导语先说明为什么内容生产链路必须收敛。\n\n## 第一节\n\n这里是宿主托管生成的正文。"
  );
  assert.equal(article?.source.finalMarkdown, article?.source.documentText);
  assert.equal(article?.source.hostManagedGeneration?.status, "completed");
  assert.equal(article?.source.hostManagedGeneration?.provider, "test-provider");
  assert.equal(article?.source.hostManagedGeneration?.model, "test-model");
  assert.deepEqual(article?.source.hostManagedGeneration?.outputIds, [
    "article-draft-document"
  ]);
});

test("missing host managed generation result falls back to unavailable status", () => {
  const response = handleContentFactoryWorkerRequest({
    schemaVersion: "content-factory.worker-request.v1",
    appId: "content-factory-app",
    sessionId: "session-host-managed-missing-001",
    workspaceId: "workspace-main",
    turnId: "turn-host-managed-missing-001",
    taskId: "task-host-managed-missing-001",
    taskKind: "content.article.generate",
    prompt: "写一篇关于内容工厂插件化写文章的公众号文章",
    expectedOutput: {
      artifactKind: "content_factory.workspace_patch"
    },
    runtime: {
      outputArtifactKind: "content_factory.workspace_patch",
      directProviderAccess: false,
      directFilesystemAccess: false,
      hostManagedGeneration: {
        enabled: true,
        requests: [
          {
            id: "article-draft-document",
            targetObjectKind: "articleDraft",
            outputField: "documentText"
          }
        ]
      }
    },
    requestedAt: "2026-06-28T00:00:00.000Z"
  });

  const patch = response.artifacts[0].metadata.contentFactoryWorkspacePatch;
  const article = patch.objects.find((object) => object.ref.kind === "articleDraft");

  assert.equal(article?.source.hostManagedGeneration?.status, "unavailable");
  assert.equal(
    article?.source.hostManagedGeneration?.reasonCode,
    "host_generation_unavailable"
  );
  assert.deepEqual(article?.source.hostManagedGeneration?.outputIds, []);
  assert.match(article?.source.documentText ?? "", /内容工厂插件化写文章/);
});

test("content.image.generate selects image grid as the primary surface", () => {
  const patch = buildContentFactoryWorkspacePatch({
    taskKind: "content.image.generate",
    sessionId: "session-image-001",
    topic: "发布配图"
  });

  const imageObject = patch.objects.find(
    (object) => object.ref.kind === "imageGenerationSet"
  );
  assert.equal(patch.primaryObjectRef.kind, "imageGenerationSet");
  assert.equal(patch.layoutState.activePaneKind, "imageGrid");
  assert.ok(Array.isArray(imageObject?.source.images));
  assert.equal(imageObject?.source.images.length, 3);
  assert.equal(imageObject?.source.imageSlots.length, 3);
  assert.match(imageObject?.source.images[0]?.prompt ?? "", /发布配图/);
  assert.equal(imageObject?.source.images[0]?.slotId, "image-slot-cover");
  assert.equal(
    imageObject?.source.images[0]?.cache?.executor,
    "content-factory.media-cache.v1"
  );
  assert.equal(imageObject?.source.images[0]?.cache?.status, "pending_executor");
  assert.match(
    imageObject?.source.images[0]?.cache?.relativePath ?? "",
    /\.lime\/agent-apps\/content-factory-app\/sessions\/session-image-001\/tasks\//
  );
  assert.equal(
    imageObject?.source.images[0]?.cachedPath,
    imageObject?.source.images[0]?.cache?.relativePath
  );
});

test("content.video.storyboard.generate declares video cache executor contracts", () => {
  const patch = buildContentFactoryWorkspacePatch({
    taskKind: "content.video.storyboard.generate",
    sessionId: "session-storyboard-001",
    taskId: "task-storyboard-001",
    topic: "视频分镜缓存"
  });

  const storyboardObject = patch.objects.find(
    (object) => object.ref.kind === "videoStoryboard"
  );

  assert.equal(patch.primaryObjectRef.kind, "videoStoryboard");
  assert.ok(Array.isArray(storyboardObject?.source.shots));
  assert.equal(storyboardObject?.source.shots[0]?.cache?.kind, "video");
  assert.equal(
    storyboardObject?.source.shots[0]?.cache?.executor,
    "content-factory.media-cache.v1"
  );
  assert.equal(
    storyboardObject?.source.shots[0]?.cache?.mimeType,
    "video/mp4"
  );
  assert.match(
    storyboardObject?.source.shots[0]?.cache?.manifestPath ?? "",
    /\.mp4\.manifest\.json$/
  );
});

test("unsupported task kind fails closed", () => {
  assert.throws(
    () =>
      buildContentFactoryWorkspacePatch({
        taskKind: "content.legacy.generate"
      }),
    /unsupported taskKind/
  );
});
