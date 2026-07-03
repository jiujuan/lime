import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();

const agentSkillIds = [
  "article-research",
  "article-strategy",
  "article-writing",
  "article-editing",
  "article-image-plan"
];
const agentSkillPaths = agentSkillIds.map((skillId) => `skills/${skillId}/SKILL.md`);
const legacySkillPaths = [
  "skills/article_research",
  "skills/article_strategy",
  "skills/article_writing",
  "skills/article_editing",
  "skills/article_image_plan"
];

const requiredFiles = [
  "plugin.json",
  "app.workbench.yaml",
  "app.runtime.yaml",
  "app.operations.yaml",
  "app.requirements.yaml",
  "app.boundary.yaml",
  "app.install.yaml",
  "workflows/content-article.workflow.md",
  "subagents/content-researcher/prompt.md",
  "subagents/content-strategist/prompt.md",
  "subagents/article-writer/prompt.md",
  "subagents/copy-editor/prompt.md",
  "subagents/image-planner/prompt.md",
  ...agentSkillPaths,
  "clis/clis.json",
  "connectors/connectors.json",
  "hooks/prompt-submit.mjs",
  "hooks/task-complete.mjs",
  "resources/i18n.json",
  "resources/recommend.json",
  "resources/icons/icon.svg",
  "cli/content-factory.mjs",
  "src/runtime/article-planning.mjs",
  "src/runtime/content-factory-worker.mjs",
  "scripts/sign-release.mjs",
  "artifacts/content-factory-workspace-patch.schema.json",
  "examples/workspace-patch.sample.json",
  "examples/runtime-request.sample.json",
  "docs/development.md",
  "docs/release.md",
  "src/ui/dev-server.mjs",
  "locales/zh-CN.json",
  "locales/zh-TW.json",
  "locales/en-US.json",
  "locales/ja-JP.json",
  "locales/ko-KR.json"
];

const requiredWorkbenchTokens = [
  "profile: production",
  "articleWorkspace:",
  "kind: articleDraft",
  "kind: imageGenerationSet",
  "kind: videoScript",
  "kind: videoStoryboard",
  "surfaceKind: documentCanvas",
  "surfaceKind: imageGrid",
  "surfaceKind: storyboard",
  "defaultSurface: selectedObject",
  "fallback: artifactPreview"
];

const forbiddenLegacyTokens = [
  "APP.md",
  "app.md",
  "productProfile",
  "Product Profile",
  "productWorkspace",
  "Product Workspace",
  "product-profile",
  "product_workspace",
  "右侧 Profile",
  "产物 Profile"
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseSkillFrontmatter(content, relativePath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert(match, `${relativePath} missing YAML frontmatter`);
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (field) {
      fields[field[1]] = field[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return fields;
}

for (const file of requiredFiles) {
  assert(existsSync(path.join(root, file)), `missing required file: ${file}`);
}

for (const legacyPath of legacySkillPaths) {
  assert(
    !existsSync(path.join(root, legacyPath)),
    `legacy Agent Skill path must not exist: ${legacyPath}`
  );
}

for (const skillId of agentSkillIds) {
  const relativePath = `skills/${skillId}/SKILL.md`;
  const content = await readFile(path.join(root, relativePath), "utf8");
  const frontmatter = parseSkillFrontmatter(content, relativePath);
  assert(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillId),
    `Agent Skill directory name is invalid: ${skillId}`
  );
  assert(
    frontmatter.name === skillId,
    `${relativePath} name must match parent directory`
  );
  assert(
    typeof frontmatter.description === "string" &&
      frontmatter.description.length > 0 &&
      frontmatter.description.length <= 1024,
    `${relativePath} must declare a non-empty description`
  );
}

const pluginManifest = JSON.parse(
  await readFile(path.join(root, "plugin.json"), "utf8")
);
assert(
  pluginManifest.schemaVersion === "lime.plugin.package.v1",
  "plugin.json schemaVersion mismatch"
);
assert(pluginManifest.id === "content-factory-app", "plugin.json id mismatch");
assert(pluginManifest.version === "2.2.2", "plugin.json version mismatch");
assert(
  pluginManifest.contributions?.runtime === "./app.runtime.yaml",
  "plugin.json must point to runtime contract"
);
assert(
  pluginManifest.contributions?.workbench === "./app.workbench.yaml",
  "plugin.json must point to workbench contract"
);
for (const [key, contributionPath] of Object.entries(
  pluginManifest.contributions ?? {}
)) {
  assert(
    typeof contributionPath === "string" && contributionPath.startsWith("./"),
    `plugin contribution must be relative: ${key}`
  );
  assert(
    existsSync(path.join(root, contributionPath)),
    `plugin contribution path missing: ${key} -> ${contributionPath}`
  );
}
assert(
  Array.isArray(pluginManifest.interface?.defaultPrompt) &&
    pluginManifest.interface.defaultPrompt.some((prompt) =>
      String(prompt).includes("@写文章")
    ),
  "plugin.json must declare @写文章 default prompt"
);

const workbench = await readFile(path.join(root, "app.workbench.yaml"), "utf8");
for (const token of requiredWorkbenchTokens) {
  assert(workbench.includes(token), `app.workbench.yaml missing token: ${token}`);
}

const runtime = await readFile(path.join(root, "app.runtime.yaml"), "utf8");
for (const token of [
  "entrypoint: ./src/runtime/content-factory-worker.mjs",
  "activationEntries:",
  "@写文章",
  "@写作",
  "@内容工厂",
  "rightSurface: articleWorkspace",
  "workflows:",
  "key: content_article_workflow",
  "hostManagedGeneration:",
  "enabled: true",
  "article-draft-document",
  "outputField: documentText",
  "subagent: content-researcher",
  "subagent: article-writer",
  "skillRefs:",
  "article-research",
  "article-writing",
  "article-image-plan",
  "cliRefs:",
  "connectorRefs:",
  "hookPolicy:",
  "cli:",
  "registry: ./clis/clis.json",
  "entrypoint: ./cli/content-factory.mjs",
  "connectors:",
  "registry: ./connectors/connectors.json",
  "hooks:",
  "prompt-submit",
  "task-complete",
  "kind: content.factory.generate",
  "kind: content.article.generate",
  "kind: content.image.generate",
  "kind: content.video.script.generate",
  "kind: content.video.storyboard.generate",
  "kind: content.delivery.review"
]) {
  assert(runtime.includes(token), `app.runtime.yaml missing token: ${token}`);
}

for (const file of [
  "plugin.json",
  "app.workbench.yaml",
  "app.runtime.yaml",
  "app.operations.yaml",
  "app.requirements.yaml",
  "workflows/content-article.workflow.md",
  "skills/article-writing/SKILL.md",
  "subagents/article-writer/prompt.md",
  "src/runtime/content-factory-worker.mjs",
  "src/ui/dev-server.mjs",
  "examples/workspace-patch.sample.json",
  "examples/runtime-request.sample.json",
  "artifacts/content-factory-workspace-patch.schema.json",
  "README.md",
  "docs/development.md",
  "locales/zh-CN.json",
  "locales/zh-TW.json",
  "locales/en-US.json",
  "locales/ja-JP.json",
  "locales/ko-KR.json"
]) {
  const content = await readFile(path.join(root, file), "utf8");
  for (const token of forbiddenLegacyTokens) {
    assert(
      !content.includes(token),
      `${file} must not contain legacy token: ${token}`
    );
  }
}

const cliRegistry = JSON.parse(
  await readFile(path.join(root, "clis/clis.json"), "utf8")
);
assert(
  cliRegistry.tools?.some(
    (tool) =>
      tool.id === "content-factory" &&
      tool.source?.bin === "./cli/content-factory.mjs" &&
      Array.isArray(tool.verifyArgs) &&
      tool.verifyArgs.includes("validate")
  ),
  "clis/clis.json must declare content-factory validate tool"
);

const connectorRegistry = JSON.parse(
  await readFile(path.join(root, "connectors/connectors.json"), "utf8")
);
for (const connectorId of ["lime-knowledge", "web-research", "media-generation"]) {
  assert(
    connectorRegistry.connectors?.some((connector) => connector.id === connectorId),
    `connectors/connectors.json missing connector: ${connectorId}`
  );
  assert(
    runtime.includes(connectorId),
    `app.runtime.yaml must reference connector: ${connectorId}`
  );
}

const resources = JSON.parse(
  await readFile(path.join(root, "resources/recommend.json"), "utf8")
);
assert(
  resources.entries?.some((entry) => entry.activationKey === "content_article_generate"),
  "resources/recommend.json must include article activation recommendation"
);

const schema = JSON.parse(
  await readFile(
    path.join(root, "artifacts/content-factory-workspace-patch.schema.json"),
    "utf8"
  )
);
assert(schema.properties?.appId?.const === "content-factory-app", "schema appId const mismatch");
assert(
  schema.properties?.layoutState?.properties?.openTabKinds,
  "schema must declare layoutState.openTabKinds"
);
assert(schema.$defs?.imagePreview, "schema must declare imagePreview");
assert(schema.$defs?.storyboardShot, "schema must declare storyboardShot");
assert(schema.$defs?.researchRound, "schema must declare researchRound");
assert(schema.$defs?.titleCandidate, "schema must declare titleCandidate");
assert(schema.$defs?.outlineSection, "schema must declare outlineSection");
assert(schema.$defs?.imageSlot, "schema must declare imageSlot");
assert(schema.$defs?.citation, "schema must declare citation");
assert(schema.$defs?.writingPlanStep, "schema must declare writingPlanStep");
const sourceProperties =
  schema.$defs?.productObject?.properties?.source?.properties ?? {};
for (const key of ["processMarkdown", "documentText", "finalMarkdown"]) {
  assert(
    sourceProperties[key]?.type === "string",
    `schema source must declare ${key}`
  );
}

const samplePatch = JSON.parse(
  await readFile(path.join(root, "examples/workspace-patch.sample.json"), "utf8")
);
assert(samplePatch.appId === "content-factory-app", "sample patch appId mismatch");
assert(
  Array.isArray(samplePatch.objects) && samplePatch.objects.length >= 2,
  "sample patch must include at least two workspace objects"
);
const sampleArticle = samplePatch.objects.find(
  (object) => object?.ref?.kind === "articleDraft"
);
assert(sampleArticle, "sample patch must include articleDraft");
assert(
  !Object.hasOwn(sampleArticle.source ?? {}, "markdown"),
  "sample articleDraft source must not use legacy markdown"
);
for (const key of ["processMarkdown", "documentText", "finalMarkdown"]) {
  assert(
    typeof sampleArticle.source?.[key] === "string" &&
      sampleArticle.source[key].trim(),
    `sample articleDraft source must include ${key}`
  );
}
assert(
  samplePatch.schemaVersion === "article-workspace.v1",
  "sample patch schemaVersion mismatch"
);
assert(
  samplePatch.layoutState?.activeTabKind === "articleWorkspace",
  "sample patch must open articleWorkspace"
);
assert(
  samplePatch.objects.some((object) => typeof object.source?.documentText === "string"),
  "sample patch must include document text preview"
);
assert(
  samplePatch.objects.some((object) => Array.isArray(object.source?.images)),
  "sample patch must include image preview items"
);

const runtimeRequest = JSON.parse(
  await readFile(path.join(root, "examples/runtime-request.sample.json"), "utf8")
);
const {
  buildContentFactoryWorkerProgressEvents,
  handleContentFactoryWorkerRequest,
  runContentFactoryTask
} = await import(
  pathToFileURL(path.join(root, "src/runtime/content-factory-worker.mjs")).href
);

const fullRuntimeResult = runContentFactoryTask({
  taskKind: "content.factory.generate",
  sessionId: "session-validate-full",
  taskId: "task-validate-full",
  topic: "内容工厂校验",
  audience: "运营团队"
});
assert(
  fullRuntimeResult.artifactKind === "content_factory.workspace_patch",
  "full runtime must output content_factory.workspace_patch"
);
for (const kind of [
  "contentBrief",
  "articleDraft",
  "imageGenerationSet",
  "videoStoryboard",
  "deliveryChecklist"
]) {
  assert(
    fullRuntimeResult.patch.objects.some((object) => object.ref?.kind === kind),
    `full runtime patch missing workspace object: ${kind}`
  );
}

assert(
  runtimeRequest.schemaVersion === "content-factory.worker-request.v1",
  "runtime sample must be a host worker request"
);
const runtimeProgressEvents = buildContentFactoryWorkerProgressEvents(runtimeRequest);
assert(
  runtimeProgressEvents.length >= 2,
  "runtime sample must emit paragraph-level artifact progress events"
);
const connectorAuditEvents = runtimeProgressEvents.filter(
  (event) => event.eventType === "workflow.connector.requested"
);
assert(
  connectorAuditEvents.length >= 1,
  "runtime sample must emit workflow connector audit events"
);
connectorAuditEvents.forEach((event) => {
  assert(event.kind === "runtime.event", "worker audit progress must use runtime.event envelope");
  assert(event.payload?.stepId === "research", "connector audit event must bind research step");
  assert(event.payload?.connectorRef === "web-research", "connector audit event must bind web-research connector");
  assert(event.payload?.toolName === "WebSearch", "connector audit event must name WebSearch");
  assert(event.payload?.auditOnly === true, "connector audit event must be audit-only");
});
const artifactProgressEvents = runtimeProgressEvents.filter(
  (event) => event.eventType === "artifact.snapshot"
);
assert(
  artifactProgressEvents.length >= 2,
  "runtime sample must emit paragraph-level artifact snapshots"
);
artifactProgressEvents.forEach((event, index) => {
  assert(event.kind === "runtime.event", "worker progress must use runtime.event envelope");
  assert(
    event.payload?.artifact?.metadata?.streamSource === "worker_delta",
    "worker progress must be marked as worker_delta"
  );
  assert(
    event.payload?.artifact?.metadata?.streamSequence === index + 1,
    "worker progress streamSequence must be incremental"
  );
  assert(
    event.payload?.artifact?.metadata?.complete === false,
    "worker progress artifact must not be complete"
  );
});

const runtimeResponse = handleContentFactoryWorkerRequest(runtimeRequest);
assert(
  runtimeResponse.schemaVersion === "content-factory.worker-response.v1",
  "runtime response schemaVersion mismatch"
);
assert(
  runtimeResponse.status === "completed",
  "runtime response must complete"
);
const runtimeArtifact = runtimeResponse.artifacts?.[0];
assert(
  runtimeArtifact?.metadata?.kind === "content_factory.workspace_patch",
  "runtime response must output content_factory.workspace_patch"
);
assert(
  runtimeArtifact?.metadata?.complete === true,
  "runtime response final artifact must be complete"
);
assert(
  runtimeArtifact?.metadata?.writePhase === "persisted",
  "runtime response final artifact must be persisted"
);
const runtimePatch = runtimeArtifact.metadata.contentFactoryWorkspacePatch;
assert(
  runtimePatch?.appId === "content-factory-app",
  "runtime patch appId mismatch"
);
assert(
  runtimePatch?.schemaVersion === "article-workspace.v1",
  "runtime patch schemaVersion mismatch"
);
assert(
  runtimePatch?.layoutState?.activeTabKind === "articleWorkspace",
  "runtime patch must open articleWorkspace"
);
assert(
  runtimePatch?.workerEvidence?.some(
    (entry) =>
      entry.workflowKey === "content_article_workflow" &&
      Array.isArray(entry.orchestration) &&
      entry.orchestration.some((step) => step.subagent === "article-writer")
  ),
  "runtime patch must include writing workflow orchestration evidence"
);
assert(
  runtimePatch?.workerEvidence?.some(
    (entry) =>
      Array.isArray(entry.researchRounds) &&
      entry.researchRounds.length === 3 &&
      Array.isArray(entry.outline) &&
      entry.outline.length >= 5 &&
      Array.isArray(entry.imageSlots) &&
      entry.imageSlots.length >= 3
  ),
  "runtime patch must include complete article writing evidence"
);
for (const kind of ["contentBrief", "articleDraft", "deliveryChecklist"]) {
  assert(
    runtimePatch.objects.some((object) => object.ref?.kind === kind),
    `runtime patch missing workspace object: ${kind}`
  );
}

const article = runtimePatch.objects.find(
  (object) => object.ref?.kind === "articleDraft"
);
assert(article, "runtime patch missing articleDraft");
assert(
  Array.isArray(article.source?.researchRounds) &&
    article.source.researchRounds.length === 3,
  "articleDraft must include three research rounds"
);
assert(
  Array.isArray(article.source?.titleCandidates) &&
    article.source.titleCandidates.length >= 3,
  "articleDraft must include title candidates"
);
assert(
  Array.isArray(article.source?.outline) && article.source.outline.length >= 5,
  "articleDraft must include outline"
);
assert(
  Array.isArray(article.source?.imageSlots) &&
    article.source.imageSlots.length >= 3,
  "articleDraft must include image slots"
);
assert(
  Array.isArray(article.source?.citations) &&
    article.source.citations.length >= 1,
  "articleDraft must include citations"
);
assert(
  !Object.hasOwn(article.source ?? {}, "markdown"),
  "articleDraft source must not use legacy markdown"
);
assert(
  String(article.source?.processMarkdown ?? "").includes("## 检索轮次") &&
    String(article.source?.processMarkdown ?? "").includes("## 编排步骤"),
  "articleDraft processMarkdown must include research and orchestration sections"
);
assert(
  String(article.source?.documentText ?? "").includes("人才选聘不能只看简历关键词") &&
    String(article.source?.documentText ?? "").includes("## 用任务验证真实能力") &&
    !String(article.source?.documentText ?? "").includes("## 待执行检索") &&
    !String(article.source?.documentText ?? "").includes("## 编排步骤") &&
    !String(article.source?.documentText ?? "").includes("从基础语法到工程实战") &&
    !String(article.source?.documentText ?? "").includes("不要只生成一段话"),
  "articleDraft documentText must come from host generation without process or template sections"
);

for (const locale of ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"]) {
  const content = JSON.parse(
    await readFile(path.join(root, "locales", `${locale}.json`), "utf8")
  );
  assert(content["app.displayName"], `locale ${locale} missing app.displayName`);
  assert(
    content["app.shortDescription"],
    `locale ${locale} missing app.shortDescription`
  );
  for (const key of [
    "ui.runtime.summary",
    "ui.runtime.center",
    "ui.runtime.centerValue",
    "ui.runtime.right",
    "ui.runtime.rightValue",
    "ui.runtime.status",
    "ui.runtime.ready"
  ]) {
    assert(content[key], `locale ${locale} missing ${key}`);
  }
}

console.log("[content-factory-app] Lime Plugin Package v1 and runtime OK");
