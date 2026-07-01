import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import contentFactoryFixture from "@/features/agent-app/fixtures/content-factory-app.json";
import {
  buildContentFactoryWorkerRequest,
  buildContentFactoryWorkerRuntimeContract,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_SCHEMA,
  CONTENT_FACTORY_WORKER_REQUEST_SCHEMA,
  CONTENT_FACTORY_WORKER_RUNTIME_SCHEMA,
} from "./contentFactoryWorkerContract";
import { buildContentFactoryWorkspacePatchArticleWorkspace } from "./contentFactoryWorkspacePatch";
import {
  CONTENT_FACTORY_PLUGIN_ID,
  CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
} from "./index";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureRoot = resolve(repoRoot, "src/features/agent-app/fixtures");

function resolveFixturePath(relativePath: string | null): string {
  if (!relativePath) {
    throw new Error("fixture path is required");
  }
  return resolve(fixtureRoot, relativePath.replace(/^\.\//, ""));
}

describe("contentFactoryWorkerContract", () => {
  it("应从内容工厂 manifest 投影 worker runtime 契约", () => {
    const contract = buildContentFactoryWorkerRuntimeContract();

    expect(contract).toEqual({
      schemaVersion: CONTENT_FACTORY_WORKER_RUNTIME_SCHEMA,
      appId: CONTENT_FACTORY_PLUGIN_ID,
      enabled: true,
      workerEntrypoint: "./src/runtime/content-factory-worker.mjs",
      contractPath: "./app.runtime.yaml",
      sampleRequestPath: "./examples/runtime-request.sample.json",
      outputArtifactKind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
      taskKinds: [
        "content.factory.generate",
        "content.article.generate",
        "content.image.generate",
        "content.video.script.generate",
        "content.video.storyboard.generate",
        "content.delivery.review",
      ],
      directProviderAccess: false,
      directFilesystemAccess: false,
      expectedOutput: {
        artifactKind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
        articleWorkspaceSchema: CONTENT_FACTORY_ARTICLE_WORKSPACE_SCHEMA,
        objectKinds: [
          "contentBrief",
          "articleDraft",
          "imageGenerationSet",
          "videoScript",
          "videoStoryboard",
          "deliveryChecklist",
        ],
        requiredObjectKinds: [
          "articleDraft",
          "imageGenerationSet",
          "videoStoryboard",
          "deliveryChecklist",
        ],
      },
      blockerCodes: [],
    });
  });

  it("应生成 action executor 可消费的 worker 请求骨架", () => {
    const request = buildContentFactoryWorkerRequest({
      sessionId: "session-content-factory",
      workspaceId: "workspace-main",
      turnId: "turn-action-1",
      taskId: "image_regenerate_job_1",
      taskKind: "content.image.generate",
      prompt: "重新生成配图组",
      actionKey: "regenerate",
      sourceObjectRef: {
        appId: CONTENT_FACTORY_PLUGIN_ID,
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-content-factory",
      },
      requestedAt: "2026-06-26T00:00:00.000Z",
    });

    expect(request).toMatchObject({
      schemaVersion: CONTENT_FACTORY_WORKER_REQUEST_SCHEMA,
      appId: CONTENT_FACTORY_PLUGIN_ID,
      sessionId: "session-content-factory",
      workspaceId: "workspace-main",
      turnId: "turn-action-1",
      taskId: "image_regenerate_job_1",
      taskKind: "content.image.generate",
      prompt: "重新生成配图组",
      actionKey: "regenerate",
      sourceObjectRef: {
        kind: "imageGenerationSet",
        id: "image-set-1",
      },
      runtime: {
        workerEntrypoint: "./src/runtime/content-factory-worker.mjs",
        outputArtifactKind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
        directProviderAccess: false,
        directFilesystemAccess: false,
      },
      requestedAt: "2026-06-26T00:00:00.000Z",
    });
    expect(request?.expectedOutput.requiredObjectKinds).toContain(
      "imageGenerationSet",
    );
  });

  it("manifest 声明的 worker 包文件应真实落盘并与 runtime contract 对齐", () => {
    const contract = buildContentFactoryWorkerRuntimeContract();
    const runtimeContractPath = resolveFixturePath(contract.contractPath);
    const sampleRequestPath = resolveFixturePath(contract.sampleRequestPath);
    const workerEntrypointPath = resolveFixturePath(contract.workerEntrypoint);
    const runtimeContract = parseYaml(
      readFileSync(runtimeContractPath, "utf8"),
    ) as Record<string, unknown>;
    const sampleRequest = JSON.parse(
      readFileSync(sampleRequestPath, "utf8"),
    ) as ReturnType<typeof buildContentFactoryWorkerRequest>;

    expect(existsSync(workerEntrypointPath)).toBe(true);
    expect(runtimeContract).toMatchObject({
      schemaVersion: CONTENT_FACTORY_WORKER_RUNTIME_SCHEMA,
      appId: CONTENT_FACTORY_PLUGIN_ID,
      worker: {
        entrypoint: contentFactoryFixture.runtimePackage.worker.entrypoint,
        directProviderAccess: false,
        directFilesystemAccess: false,
        outputArtifactKind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
      },
      outputs: {
        artifactKind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
        articleWorkspace: {
          schemaVersion: CONTENT_FACTORY_ARTICLE_WORKSPACE_SCHEMA,
        },
      },
    });
    expect(sampleRequest).toEqual(
      buildContentFactoryWorkerRequest({
        sessionId: "session-content-factory",
        workspaceId: "workspace-main",
        turnId: "turn-action-1",
        taskId: "task-image-regenerate-1",
        taskKind: "content.image.generate",
        prompt: "Regenerate the image set with two candidate images.",
        actionKey: "regenerate",
        sourceObjectRef: {
          appId: CONTENT_FACTORY_PLUGIN_ID,
          kind: "imageGenerationSet",
          id: "image-set-1",
          sessionId: "session-content-factory",
          artifactIds: ["artifact-image-set-1"],
        },
        requestedAt: "2026-06-26T00:00:00.000Z",
      }),
    );
  });

  it("worker 应输出可被 Article Workspace 解析的 artifact snapshot", () => {
    const contract = buildContentFactoryWorkerRuntimeContract();
    const workerEntrypointPath = resolveFixturePath(contract.workerEntrypoint);
    const sampleRequest = readFileSync(
      resolveFixturePath(contract.sampleRequestPath),
      "utf8",
    );
    const response = JSON.parse(
      execFileSync("node", [workerEntrypointPath], {
        input: sampleRequest,
        encoding: "utf8",
      }),
    ) as Record<string, unknown>;
    const artifact = Array.isArray(response.artifacts)
      ? (response.artifacts[0] as Record<string, unknown> | undefined)
      : undefined;

    expect(response).toMatchObject({
      schemaVersion: "content-factory.worker-response.v1",
      appId: CONTENT_FACTORY_PLUGIN_ID,
      status: "completed",
      artifacts: [
        {
          kind: "artifact.snapshot",
          metadata: {
            kind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
          },
        },
      ],
    });
    const profile = buildContentFactoryWorkspacePatchArticleWorkspace({
      artifact,
    });
    expect(profile).toMatchObject({
      appId: CONTENT_FACTORY_PLUGIN_ID,
      sessionId: "session-content-factory",
      selectedObjectRef: {
        kind: "imageGenerationSet",
      },
      layoutState: {
        activePaneKind: "imageGrid",
      },
    });
    expect(profile?.objects.map((object) => object.ref.kind)).toEqual([
      "articleDraft",
      "imageGenerationSet",
      "deliveryChecklist",
    ]);
    expect(
      profile?.objects.find(
        (object) => object.ref.kind === "imageGenerationSet",
      ),
    ).toMatchObject({
      status: "draft",
      source: {
        images: expect.arrayContaining([
          expect.objectContaining({
            prompt: expect.stringContaining("Regenerate the image set"),
            cache: expect.objectContaining({
              executor: "content-factory.media-cache.v1",
            }),
          }),
        ]),
        imageSlots: expect.arrayContaining([
          expect.objectContaining({ id: "image-slot-cover" }),
        ]),
      },
    });
    const article = profile?.objects.find(
      (object) => object.ref.kind === "articleDraft",
    );
    expect(article).toMatchObject({
      title: expect.stringContaining("学习路线"),
      summary: expect.not.stringContaining("轮资料检索"),
      source: {
        processMarkdown: expect.stringContaining("## 检索轮次"),
        documentText: expect.stringContaining("## 第一阶段：打牢基础"),
        finalMarkdown: expect.stringContaining("## 第一阶段：打牢基础"),
        researchRounds: expect.arrayContaining([
          expect.objectContaining({
            title: "主题和用户目标检索",
          }),
        ]),
        titleCandidates: expect.arrayContaining([
          expect.objectContaining({
            title: expect.stringContaining("学习路线"),
          }),
        ]),
        outline: expect.arrayContaining([
          expect.objectContaining({
            title: "实践：用项目把知识连成闭环",
          }),
        ]),
        imageSlots: expect.arrayContaining([
          expect.objectContaining({
            prompt: expect.stringContaining("学习路线图"),
          }),
        ]),
        searchRequests: expect.arrayContaining([
          expect.objectContaining({
            tool: "search_query",
            status: "ready_for_host_execution",
          }),
        ]),
        searchEvidence: expect.arrayContaining([
          expect.objectContaining({
            status: "pending_host_execution",
          }),
        ]),
        reviewChecklist: expect.arrayContaining([
          expect.objectContaining({
            owner: "copy-editor",
          }),
        ]),
        imagePlan: expect.objectContaining({
          status: "planned",
          connectorRef: "media-generation",
        }),
        citations: expect.arrayContaining([
          expect.objectContaining({
            title: expect.stringContaining("Claw 中间保持对话"),
          }),
        ]),
        writingPlan: expect.arrayContaining([
          expect.objectContaining({
            owner: "article-writer",
            skillRef: "article-writing",
          }),
        ]),
        reviewNotes: expect.arrayContaining([
          expect.stringContaining("确认标题是否符合真实表达"),
        ]),
      },
    });
    expect(String(article?.source?.processMarkdown ?? "")).toContain(
      "## 检索轮次",
    );
    expect(String(article?.source?.processMarkdown ?? "")).toContain(
      "## 待执行检索",
    );
    expect(String(article?.source?.documentText ?? "")).toContain(
      "## 第一阶段：打牢基础",
    );
    expect(String(article?.source?.documentText ?? "")).toContain(
      "## 第二阶段：用项目建立反馈",
    );
    expect(String(article?.source?.documentText ?? "")).not.toContain(
      "不要只生成一段话",
    );
    expect(String(article?.source?.documentText ?? "")).not.toContain(
      "右侧编辑器",
    );
    expect(String(article?.source?.documentText ?? "")).not.toContain(
      "## 待执行检索",
    );
    expect(String(article?.source?.finalMarkdown ?? "")).toBe(
      article?.source?.documentText,
    );
  });

  it("写文章 worker 请求应输出完整文章结构", () => {
    const contract = buildContentFactoryWorkerRuntimeContract();
    const workerEntrypointPath = resolveFixturePath(contract.workerEntrypoint);
    const request = buildContentFactoryWorkerRequest({
      sessionId: "session-content-factory-article",
      workspaceId: "workspace-main",
      turnId: "turn-article-1",
      taskId: "task-article-1",
      taskKind: "content.article.generate",
      prompt: "写一篇关于 golang 学习的公众号文章",
      requestedAt: "2026-06-28T00:00:00.000Z",
    });
    const response = JSON.parse(
      execFileSync("node", [workerEntrypointPath], {
        input: JSON.stringify(request),
        encoding: "utf8",
      }),
    ) as Record<string, unknown>;
    const artifact = Array.isArray(response.artifacts)
      ? (response.artifacts[0] as Record<string, unknown> | undefined)
      : undefined;
    const profile = buildContentFactoryWorkspacePatchArticleWorkspace({
      artifact,
    });
    const article = profile?.objects.find(
      (object) => object.ref.kind === "articleDraft",
    );

    expect(response).toMatchObject({
      status: "completed",
      taskKind: "content.article.generate",
    });
    expect(profile).toMatchObject({
      selectedObjectRef: {
        kind: "articleDraft",
      },
      layoutState: {
        activePaneKind: "documentCanvas",
      },
    });
    expect(profile?.objects.map((object) => object.ref.kind)).toEqual([
      "contentBrief",
      "articleDraft",
      "deliveryChecklist",
    ]);
    expect(profile?.workerEvidence).toEqual([
      expect.objectContaining({
        taskKind: "content.article.generate",
        workflowKey: "content_article_workflow",
        subagents: expect.arrayContaining([
          "content-researcher",
          "article-writer",
          "image-planner",
        ]),
        skillRefs: expect.arrayContaining([
          "article-writing",
          "article-image-plan",
        ]),
        cliRefs: expect.arrayContaining(["content-factory"]),
        connectorRefs: expect.arrayContaining([
          "lime-knowledge",
          "web-research",
          "media-generation",
        ]),
        hookPolicy: {
          prompt: ["prompt-submit"],
          task: ["task-complete"],
        },
        orchestration: expect.arrayContaining([
          expect.objectContaining({
            subagent: "article-writer",
            skillRefs: ["article-writing"],
          }),
        ]),
      }),
    ]);
    expect(article?.source?.documentText).toEqual(
      expect.stringContaining("# "),
    );
    expect(article?.source?.documentText).toEqual(
      expect.stringContaining("Golang 学习路线"),
    );
    expect(article?.source?.documentText).toEqual(
      expect.stringContaining("## 第一阶段：打牢基础"),
    );
    expect(article?.source?.documentText).toEqual(
      expect.stringContaining("## 第二阶段：用项目建立反馈"),
    );
    expect(article?.source?.documentText).toEqual(
      expect.stringContaining("## 第三阶段：补齐工程化能力"),
    );
    expect(article?.source?.documentText).not.toEqual(
      expect.stringContaining("不要只生成一段话"),
    );
    expect(article?.source?.documentText).not.toEqual(
      expect.stringContaining("右侧 Article Editor"),
    );
    expect(article?.source?.documentText).not.toEqual(
      expect.stringContaining("## 检索入口"),
    );
    expect(article?.source?.documentText).not.toEqual(
      expect.stringContaining("内容工厂"),
    );
    expect(article?.source?.finalMarkdown).toEqual(
      article?.source?.documentText,
    );
    expect(article?.source).toMatchObject({
      researchRounds: expect.arrayContaining([
        expect.objectContaining({ title: "主题和用户目标检索" }),
      ]),
      titleCandidates: expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining("学习路线"),
        }),
      ]),
      outline: expect.arrayContaining([
        expect.objectContaining({
          title: "实践：用项目把知识连成闭环",
        }),
      ]),
      keyTakeaways: expect.arrayContaining([
        expect.stringContaining("学习要先建立清晰主线"),
      ]),
      imageSlots: expect.arrayContaining([
        expect.objectContaining({
          title: "学习路线封面图",
          prompt: expect.stringContaining("学习路线图"),
        }),
      ]),
      searchRequests: expect.arrayContaining([
        expect.objectContaining({
          connectorRef: "web-research",
          tool: "search_query",
        }),
      ]),
      searchEvidence: expect.arrayContaining([
        expect.objectContaining({
          confidence: expect.any(String),
        }),
      ]),
      reviewChecklist: expect.arrayContaining([
        expect.objectContaining({
          title: "结构完整",
        }),
      ]),
      imagePlan: expect.objectContaining({
        status: "planned",
      }),
      citations: expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining("Claw 中间保持对话"),
        }),
      ]),
      writingPlan: expect.arrayContaining([
        expect.objectContaining({
          owner: "article-writer",
          skillRef: "article-writing",
          done: true,
        }),
      ]),
      reviewNotes: expect.arrayContaining([
        expect.stringContaining("确认标题是否符合真实表达"),
      ]),
    });
  });

  it("缺少必填字段、未知任务或 runtime blocker 时应 fail closed", () => {
    expect(
      buildContentFactoryWorkerRequest({
        sessionId: "session-content-factory",
        turnId: "turn-1",
        taskId: "task-1",
        taskKind: "content.unknown",
        prompt: "生成内容",
      }),
    ).toBeNull();
    expect(
      buildContentFactoryWorkerRequest({
        sessionId: " ",
        turnId: "turn-1",
        taskId: "task-1",
        taskKind: "content.article.generate",
        prompt: "生成内容",
      }),
    ).toBeNull();
    expect(
      buildContentFactoryWorkerRequest({
        sessionId: "session-content-factory",
        turnId: "turn-1",
        taskId: "task-1",
        taskKind: "content.article.generate",
        prompt: "生成内容",
        runtimeContract: {
          ...buildContentFactoryWorkerRuntimeContract(),
          blockerCodes: ["TASK_RUNTIME_DIRECT_PROVIDER_ACCESS_UNSUPPORTED"],
        },
      }),
    ).toBeNull();
  });
});
