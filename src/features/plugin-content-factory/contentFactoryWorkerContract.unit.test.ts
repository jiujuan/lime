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
  CONTENT_FACTORY_PRODUCT_WORKSPACE_SCHEMA,
  CONTENT_FACTORY_WORKER_REQUEST_SCHEMA,
  CONTENT_FACTORY_WORKER_RUNTIME_SCHEMA,
} from "./contentFactoryWorkerContract";
import { buildContentFactoryWorkspacePatchProfile } from "./contentFactoryWorkspacePatch";
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
        productWorkspaceSchema: CONTENT_FACTORY_PRODUCT_WORKSPACE_SCHEMA,
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
        productWorkspace: {
          schemaVersion: CONTENT_FACTORY_PRODUCT_WORKSPACE_SCHEMA,
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

  it("worker skeleton 应输出可被 Product Profile 解析的 artifact snapshot", () => {
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
    const profile = buildContentFactoryWorkspacePatchProfile({ artifact });
    expect(profile).toMatchObject({
      appId: CONTENT_FACTORY_PLUGIN_ID,
      sessionId: "session-content-factory",
      selectedObjectRef: {
        kind: "imageGenerationSet",
        id: "image-set-1",
      },
      layoutState: {
        activePaneKind: "imageGrid",
      },
    });
    expect(profile?.objects.map((object) => object.ref.kind)).toEqual([
      "contentBrief",
      "articleDraft",
      "imageGenerationSet",
      "videoScript",
      "videoStoryboard",
      "deliveryChecklist",
    ]);
    expect(
      profile?.objects.find(
        (object) => object.ref.kind === "imageGenerationSet",
      ),
    ).toMatchObject({
      status: "ready",
      summary: "Regenerated 2 image candidates.",
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
