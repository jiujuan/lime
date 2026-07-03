import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import contentFactoryFixture from "./fixtures/content-factory-app.json";
import seededAgentApps from "./fixtures/seeded-agent-apps.json";
import type { AppManifest } from "../types";

type ContentFactoryWorkflow = {
  key: string;
  taskKind: string;
  steps: Array<{
    id: string;
    subagent: string;
    skillRefs: string[];
  }>;
};

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const fixtureRoot = resolve(
  repoRoot,
  "src/features/agent-app/testing/fixtures",
);
const packageRoot = resolve(fixtureRoot, "package-root");

function readFixtureText(relativePath: string): string {
  return readFileSync(resolve(fixtureRoot, relativePath), "utf8");
}

function readPackageYaml<T>(relativePath: string): T {
  return parseYaml(
    readFileSync(resolve(packageRoot, relativePath), "utf8"),
  ) as T;
}

function readSkillFrontmatter(skillId: string): {
  name: string;
  description: string;
} {
  const source = readFileSync(
    resolve(packageRoot, "skills", skillId, "SKILL.md"),
    "utf8",
  );
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) {
    throw new Error(`missing frontmatter for skill ${skillId}`);
  }
  return parseYaml(frontmatter[1]) as { name: string; description: string };
}

describe("contentFactoryFixtureSync", () => {
  it("content-factory-app.json 应与 package-root 的 workflow/workbench/skills 主事实源保持一致", () => {
    const manifest = contentFactoryFixture as AppManifest;
    const runtime = readPackageYaml<{
      agentRuntime: {
        worker: {
          entrypoint: string;
          sampleRequest: string;
          outputArtifactKind: string;
        };
        workflows: Array<{
          key: string;
          taskKind: string;
          steps: Array<{
            id: string;
            subagent: string;
            skillRefs: string[];
          }>;
        }>;
      };
    }>("app.runtime.yaml");
    const runtimeAgentRuntime = runtime.agentRuntime as {
      workflows: ContentFactoryWorkflow[];
    };
    const manifestAgentRuntime = manifest.agentRuntime as
      | {
          workflows?: ContentFactoryWorkflow[];
        }
      | undefined;
    const workbench = readPackageYaml<{
      workbench: {
        workbenchTasks: Array<{
          kind: string;
          skillRefs?: string[];
        }>;
      };
    }>("app.workbench.yaml");

    const runtimeWorkflow = runtimeAgentRuntime.workflows.find(
      (workflow) => workflow.key === "content_article_workflow",
    );
    expect(runtimeWorkflow).toBeTruthy();
    const manifestWorkflow = manifestAgentRuntime?.workflows?.find(
      (workflow) => workflow.key === "content_article_workflow",
    );
    expect(manifestWorkflow).toBeTruthy();

    const expectedWorkflowSkills =
      runtimeWorkflow?.steps.map((step) => ({
        id: step.id,
        subagent: step.subagent,
        skillRefs: step.skillRefs,
      })) ?? [];
    expect(
      manifestWorkflow?.steps.map((step) => ({
        id: step.id,
        subagent: step.subagent,
        skillRefs: step.skillRefs,
      })),
    ).toEqual(expectedWorkflowSkills);

    const expectedSkillIds = expectedWorkflowSkills.flatMap(
      (step) => step.skillRefs,
    );
    expect(manifest.skillRefs?.map((skill) => skill.id)).toEqual(
      expectedSkillIds,
    );
    expect(
      manifest.skillRefs?.map((skill) => ({
        id: skill.id,
        description: skill.description,
      })),
    ).toEqual(
      expectedSkillIds.map((skillId) => {
        const frontmatter = readSkillFrontmatter(skillId);
        return {
          id: frontmatter.name,
          description: frontmatter.description,
        };
      }),
    );

    expect(
      manifest.subagents?.map((subagent) => ({
        id: subagent.id,
        skills: subagent.skills,
      })),
    ).toEqual(
      expectedWorkflowSkills.map((step) => ({
        id: step.subagent,
        skills: step.skillRefs,
      })),
    );

    const runtimeWorkbenchTask = workbench.workbench.workbenchTasks.find(
      (task) => task.kind === "content.article.generate",
    );
    const manifestWorkbenchTask = manifest.workbench?.workbenchTasks?.find(
      (task) => task.kind === "content.article.generate",
    );
    expect(manifestWorkbenchTask?.skillRefs).toEqual(
      runtimeWorkbenchTask?.skillRefs ?? [],
    );
    expect(manifest.runtimePackage?.worker?.entrypoint).toBe(
      runtime.agentRuntime.worker.entrypoint,
    );
    expect(manifest.runtimePackage?.worker?.sampleRequest).toBe(
      runtime.agentRuntime.worker.sampleRequest,
    );
    expect(manifest.runtimePackage?.worker?.outputArtifactKind).toBe(
      runtime.agentRuntime.worker.outputArtifactKind,
    );
  });

  it("package-root skills 目录应只包含 workflow 当前引用的 article-* skills", () => {
    const skillIds = readdirSync(resolve(packageRoot, "skills")).sort();
    expect(skillIds).toEqual([
      "article-editing",
      "article-image-plan",
      "article-research",
      "article-strategy",
      "article-writing",
    ]);
  });

  it("根 fixture runtime 文件应委托或同步到 package-root current worker 事实源", () => {
    const rootRuntime = parseYaml(readFixtureText("app.runtime.yaml"));
    const packageRuntime = parseYaml(
      readFileSync(resolve(packageRoot, "app.runtime.yaml"), "utf8"),
    );
    const rootSampleRequest = JSON.parse(
      readFixtureText("examples/runtime-request.sample.json"),
    );
    const packageSampleRequest = JSON.parse(
      readFileSync(
        resolve(packageRoot, "examples/runtime-request.sample.json"),
        "utf8",
      ),
    );
    const rootWorkerSource = readFixtureText(
      "src/runtime/content-factory-worker.mjs",
    );
    const rootArticlePlanningSource = readFixtureText(
      "src/runtime/article-planning.mjs",
    );
    const packageArticlePlanningSource = readFileSync(
      resolve(packageRoot, "src/runtime/article-planning.mjs"),
      "utf8",
    );

    expect(rootRuntime).toEqual(packageRuntime);
    expect(rootSampleRequest).toEqual(packageSampleRequest);
    expect(rootArticlePlanningSource).toBe(packageArticlePlanningSource);
    expect(rootWorkerSource).toContain(
      "../../package-root/src/runtime/content-factory-worker.mjs",
    );
    expect(rootWorkerSource).toContain(
      "buildContentFactoryWorkerProgressEvents",
    );
    expect(rootWorkerSource).toContain("handleContentFactoryWorkerRequest");
  });

  it("package-root 应携带可审计的 release 签名工具链", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(packageRoot, "package.json"), "utf8"),
    );
    const pluginJson = JSON.parse(
      readFileSync(resolve(packageRoot, "plugin.json"), "utf8"),
    );
    const validateApp = readFileSync(
      resolve(packageRoot, "scripts/validate-app.mjs"),
      "utf8",
    );
    const signRelease = readFileSync(
      resolve(packageRoot, "scripts/sign-release.mjs"),
      "utf8",
    );
    const signReleaseTest = readFileSync(
      resolve(packageRoot, "tests/sign-release.test.mjs"),
      "utf8",
    );
    const releaseDoc = readFileSync(
      resolve(packageRoot, "docs/release.md"),
      "utf8",
    );

    expect(pluginJson.version).toBe(packageJson.version);
    expect(packageJson.scripts["release:sign"]).toBe(
      "node scripts/sign-release.mjs",
    );
    expect(existsSync(resolve(packageRoot, "scripts/sign-release.mjs"))).toBe(
      true,
    );
    expect(
      existsSync(resolve(packageRoot, "tests/sign-release.test.mjs")),
    ).toBe(true);
    expect(validateApp).toContain('"scripts/sign-release.mjs"');
    expect(signRelease).toContain(
      "agent-app-cloud-release-signature-payload/v2",
    );
    expect(signRelease).toContain("AGENT_APP_SIGNING_PRIVATE_KEY_PEM");
    expect(signReleaseTest).toContain("host-verifiable canonical proof");
    expect(releaseDoc).toContain("signatureProof");
    expect(releaseDoc).toContain("agentAppSignatureTrustRoots");
  });

  it("seeded descriptor 应与 package-root 当前版本保持一致", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(packageRoot, "package.json"), "utf8"),
    );
    const pluginJson = JSON.parse(
      readFileSync(resolve(packageRoot, "plugin.json"), "utf8"),
    );
    const manifest = contentFactoryFixture as AppManifest;
    const seededApp = seededAgentApps.apps.find(
      (app) => app.appId === "content-factory-app",
    );

    expect(seededApp).toBeTruthy();
    expect(pluginJson.version).toBe(packageJson.version);
    expect(manifest.version).toBe(packageJson.version);
    expect(seededApp?.version).toBe(packageJson.version);
    expect(seededApp?.packageUrl).toContain(packageJson.version);
    expect(seededApp?.packageSourceUri).toContain(packageJson.version);
    expect(seededApp?.releaseId).toContain(packageJson.version);
    expect(seededApp?.packageHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(seededApp?.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
