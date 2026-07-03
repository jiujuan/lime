import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import contentFactoryFixture from "@/features/plugin/testing/fixtures/content-factory-app.json";
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
const fixtureRoot = resolve(
  repoRoot,
  "src/features/plugin/testing/fixtures",
);
const HOST_GENERATED_MARKDOWN = [
  "# 宿主生成标题",
  "",
  "导语先说明为什么文章正文必须来自宿主托管生成。",
  "",
  "## 第一节",
  "",
  "这里是宿主托管生成的正文。",
].join("\n");

function buildFixtureWorkerRuntimeContract() {
  return buildContentFactoryWorkerRuntimeContract({
    manifest: contentFactoryFixture,
  });
}

function resolveFixturePath(relativePath: string | null): string {
  if (!relativePath) {
    throw new Error("fixture path is required");
  }
  return resolve(fixtureRoot, relativePath.replace(/^\.\//, ""));
}

function parseWorkerStdout(stdout: string): {
  events: Array<Record<string, unknown>>;
  response: Record<string, unknown>;
} {
  const values = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const response = values.at(-1);
  if (!response) {
    throw new Error("worker stdout is empty");
  }
  return {
    events: values.slice(0, -1),
    response,
  };
}

function withHostManagedGeneration<T extends Record<string, unknown>>(
  request: T,
): T & { hostManagedGeneration: Record<string, unknown> } {
  return {
    ...request,
    hostManagedGeneration: {
      schemaVersion: "lime.plugin.host_managed_generation.v1",
      source: "test-host-generation",
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
          content: HOST_GENERATED_MARKDOWN,
        },
      ],
    },
  };
}

describe("contentFactoryWorkerContract", () => {
  it("应从内容工厂 manifest 投影 worker runtime 契约", () => {
    const contract = buildFixtureWorkerRuntimeContract();

    expect(contract).toMatchObject({
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
      workflowContexts: [
        {
          taskKind: "content.article.generate",
          workflowKey: "content_article_workflow",
          subagents: [
            "content-researcher",
            "content-strategist",
            "article-writer",
            "copy-editor",
            "image-planner",
          ],
          skillRefs: [
            "article-research",
            "article-strategy",
            "article-writing",
            "article-editing",
            "article-image-plan",
          ],
          cliRefs: ["content-factory"],
          connectorRefs: ["lime-knowledge", "web-research", "media-generation"],
          hookPolicy: {
            prompt: ["prompt-submit"],
            task: ["task-complete"],
          },
        },
      ],
      blockerCodes: [],
    });
  });

  it("应生成 action executor 可消费的 worker 请求骨架", () => {
    const contract = buildFixtureWorkerRuntimeContract();
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
      runtimeContract: contract,
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
    const contract = buildFixtureWorkerRuntimeContract();
    const runtimeContractPath = resolveFixturePath(contract.contractPath);
    const sampleRequestPath = resolveFixturePath(contract.sampleRequestPath);
    const workerEntrypointPath = resolveFixturePath(contract.workerEntrypoint);
    const runtimeContract = parseYaml(
      readFileSync(runtimeContractPath, "utf8"),
    ) as Record<string, unknown>;
    const sampleRequest = JSON.parse(
      readFileSync(sampleRequestPath, "utf8"),
    ) as Record<string, unknown>;

    expect(existsSync(workerEntrypointPath)).toBe(true);
    expect(runtimeContract).toMatchObject({
      agentRuntime: {
        worker: {
          entrypoint: contentFactoryFixture.runtimePackage.worker.entrypoint,
          sampleRequest:
            contentFactoryFixture.runtimePackage.worker.sampleRequest,
          directProviderAccess: false,
          directFilesystemAccess: false,
          outputArtifactKind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
        },
        workflows: expect.arrayContaining([
          expect.objectContaining({
            key: "content_article_workflow",
            taskKind: "content.article.generate",
          }),
        ]),
        tasks: expect.arrayContaining([
          expect.objectContaining({
            kind: "content.article.generate",
          }),
        ]),
      },
    });
    expect(sampleRequest).toMatchObject({
      schemaVersion: CONTENT_FACTORY_WORKER_REQUEST_SCHEMA,
      appId: CONTENT_FACTORY_PLUGIN_ID,
      sessionId: "session-content-factory-demo",
      workspaceId: "workspace-main",
      turnId: "turn-demo-runtime-001",
      taskId: "task-demo-runtime-001",
      taskKind: "content.article.generate",
      prompt: expect.stringContaining("人才选聘"),
      expectedOutput: {
        artifactKind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
      },
      runtime: {
        outputArtifactKind: CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
        directProviderAccess: false,
        directFilesystemAccess: false,
      },
      requestedAt: "2026-07-02T00:00:00.000Z",
    });
  });

  it("worker 应输出可被 Article Workspace 解析的 artifact snapshot", () => {
    const contract = buildFixtureWorkerRuntimeContract();
    const workerEntrypointPath = resolveFixturePath(contract.workerEntrypoint);
    const sampleRequest = readFileSync(
      resolveFixturePath(contract.sampleRequestPath),
      "utf8",
    );
    const { events, response } = parseWorkerStdout(
      execFileSync("node", [workerEntrypointPath], {
        input: sampleRequest,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "runtime.event",
          eventType: "artifact.snapshot",
        }),
      ]),
    );
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
      sessionId: "session-content-factory-demo",
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
    const article = profile?.objects.find(
      (object) => object.ref.kind === "articleDraft",
    );
    expect(article).toMatchObject({
      title: "人才选聘不能只看简历关键词",
      summary: expect.not.stringContaining("轮资料检索"),
      source: {
        processMarkdown: expect.stringContaining("## 检索轮次"),
        documentText: expect.stringContaining("## 先定义岗位要解决的问题"),
        finalMarkdown: expect.stringContaining("## 先定义岗位要解决的问题"),
        researchRounds: expect.arrayContaining([
          expect.objectContaining({
            title: "主题和用户目标检索",
          }),
        ]),
        titleCandidates: expect.arrayContaining([
          expect.objectContaining({
            title: expect.stringContaining("先把问题说清楚"),
          }),
        ]),
        outline: expect.arrayContaining([
          expect.objectContaining({
            title: "展开：把观点拆成可验证的段落",
          }),
        ]),
        imageSlots: expect.arrayContaining([
          expect.objectContaining({
            prompt: expect.stringContaining("主题封面图"),
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
        hostManagedGeneration: expect.objectContaining({
          status: "completed",
          provider: "sample-provider",
          outputIds: ["article-draft-document"],
        }),
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
      "## 用任务验证真实能力",
    );
    expect(String(article?.source?.documentText ?? "")).toContain(
      "## 保留复盘证据",
    );
    expect(String(article?.source?.documentText ?? "")).not.toContain(
      "学习路线：从基础语法到工程实战",
    );
    expect(String(article?.source?.documentText ?? "")).not.toContain(
      "## 第一阶段：打牢基础",
    );
    expect(String(article?.source?.processMarkdown ?? "")).not.toContain(
      "学习路线：从基础语法到工程实战",
    );
    expect(String(article?.source?.processMarkdown ?? "")).not.toContain(
      "## 第一阶段：打牢基础",
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

  it("写文章 worker 请求必须使用宿主托管生成结果", () => {
    const contract = buildFixtureWorkerRuntimeContract();
    const workerEntrypointPath = resolveFixturePath(contract.workerEntrypoint);
    const request = buildContentFactoryWorkerRequest({
      sessionId: "session-content-factory-article",
      workspaceId: "workspace-main",
      turnId: "turn-article-1",
      taskId: "task-article-1",
      taskKind: "content.article.generate",
      prompt: "写一篇关于人才选聘的公众号文章",
      requestedAt: "2026-06-28T00:00:00.000Z",
      runtimeContract: contract,
    });
    expect(request).not.toBeNull();
    const { events, response } = parseWorkerStdout(
      execFileSync("node", [workerEntrypointPath], {
        input: JSON.stringify(
          withHostManagedGeneration(request as Record<string, unknown>),
        ),
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      }),
    );
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
      artifacts: [
        {
          metadata: {
            articleWorkspaceSchema: CONTENT_FACTORY_ARTICLE_WORKSPACE_SCHEMA,
            contentFactoryWorkspacePatch: expect.objectContaining({
              appId: CONTENT_FACTORY_PLUGIN_ID,
            }),
          },
        },
      ],
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "runtime.event",
          eventType: "artifact.snapshot",
        }),
      ]),
    );
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
      expect.stringContaining("宿主生成标题"),
    );
    expect(article?.source?.documentText).toEqual(
      expect.stringContaining("这里是宿主托管生成的正文"),
    );
    expect(article?.source?.documentText).not.toEqual(
      expect.stringContaining("学习路线：从基础语法到工程实战"),
    );
    expect(article?.source?.documentText).not.toEqual(
      expect.stringContaining("## 第一阶段：打牢基础"),
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
          title: expect.stringContaining("先把问题说清楚"),
        }),
      ]),
      outline: expect.arrayContaining([
        expect.objectContaining({
          title: "展开：把观点拆成可验证的段落",
        }),
      ]),
      keyTakeaways: expect.arrayContaining([
        expect.stringContaining("这篇文章要先回答"),
      ]),
      imageSlots: expect.arrayContaining([
        expect.objectContaining({
          title: "主题封面图",
          prompt: expect.stringContaining("主题封面图"),
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
      hostManagedGeneration: expect.objectContaining({
        status: "completed",
        provider: "test-provider",
        outputIds: ["article-draft-document"],
      }),
      reviewNotes: expect.arrayContaining([
        expect.stringContaining("确认标题是否符合真实表达"),
      ]),
    });
  });

  it("写文章 worker 请求缺少宿主托管生成结果时应 fail closed", () => {
    const contract = buildFixtureWorkerRuntimeContract();
    const workerEntrypointPath = resolveFixturePath(contract.workerEntrypoint);
    const request = buildContentFactoryWorkerRequest({
      sessionId: "session-content-factory-article",
      workspaceId: "workspace-main",
      turnId: "turn-article-1",
      taskId: "task-article-1",
      taskKind: "content.article.generate",
      prompt: "写一篇关于人才选聘的公众号文章",
      requestedAt: "2026-06-28T00:00:00.000Z",
      runtimeContract: contract,
    });
    expect(request).not.toBeNull();

    const result = spawnSync("node", [workerEntrypointPath], {
      input: JSON.stringify(request),
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    expect(result.status).toBe(1);
    const { events, response } = parseWorkerStdout(result.stdout);

    expect(events).toEqual([]);
    expect(response).toMatchObject({
      schemaVersion: "content-factory.worker-response.v1",
      appId: CONTENT_FACTORY_PLUGIN_ID,
      status: "failed",
      error: {
        code: "HOST_MANAGED_GENERATION_REQUIRED",
      },
      artifacts: [],
    });
  });

  it("缺少必填字段、未知任务或 runtime blocker 时应 fail closed", () => {
    const contract = buildFixtureWorkerRuntimeContract();
    expect(
      buildContentFactoryWorkerRequest({
        sessionId: "session-content-factory",
        turnId: "turn-1",
        taskId: "task-1",
        taskKind: "content.unknown",
        prompt: "生成内容",
        runtimeContract: contract,
      }),
    ).toBeNull();
    expect(
      buildContentFactoryWorkerRequest({
        sessionId: " ",
        turnId: "turn-1",
        taskId: "task-1",
        taskKind: "content.article.generate",
        prompt: "生成内容",
        runtimeContract: contract,
      }),
    ).toBeNull();
    expect(
      buildContentFactoryWorkerRequest({
        sessionId: "session-content-factory",
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
          ...buildFixtureWorkerRuntimeContract(),
          blockerCodes: ["TASK_RUNTIME_DIRECT_PROVIDER_ACCESS_UNSUPPORTED"],
        },
      }),
    ).toBeNull();
  });
});
