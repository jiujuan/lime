#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function requiredAssetPaths() {
  return [
    "plugin.json",
    "app.runtime.yaml",
    "app.workbench.yaml",
    "subagents/content-researcher/prompt.md",
    "subagents/content-strategist/prompt.md",
    "subagents/article-writer/prompt.md",
    "subagents/copy-editor/prompt.md",
    "subagents/image-planner/prompt.md",
    "skills/article-research/SKILL.md",
    "skills/article-strategy/SKILL.md",
    "skills/article-writing/SKILL.md",
    "skills/article-editing/SKILL.md",
    "skills/article-image-plan/SKILL.md",
    "clis/clis.json",
    "connectors/connectors.json",
    "hooks/prompt-submit.mjs",
    "hooks/task-complete.mjs",
    "resources/i18n.json",
    "resources/recommend.json",
    "resources/icons/icon.svg",
    "workflows/content-article.workflow.md",
    "src/runtime/article-planning.mjs",
    "src/runtime/content-factory-worker.mjs"
  ];
}

async function runSample() {
  const { handleContentFactoryWorkerRequest } = await import(
    pathToFileURL(path.join(root, "src/runtime/content-factory-worker.mjs")).href
  );
  const response = handleContentFactoryWorkerRequest(
    readJson("examples/runtime-request.sample.json")
  );
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  if (response.status !== "completed") {
    process.exitCode = 1;
  }
}

function inspectPackage() {
  const missing = requiredAssetPaths().filter(
    (relativePath) => !existsSync(path.join(root, relativePath))
  );
  const payload = {
    appId: "content-factory-app",
    root,
    assets: {
      subagents: 5,
      skills: 5,
      workflows: 1,
      connectors: 3,
      hooks: 2,
      cli: "cli/content-factory.mjs",
      worker: "src/runtime/content-factory-worker.mjs"
    },
    missing
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (missing.length > 0) {
    process.exitCode = 1;
  }
}

async function validatePackage() {
  const validatePath = path.join(root, "scripts/validate-app.mjs");
  if (!existsSync(validatePath)) {
    throw new Error("missing scripts/validate-app.mjs");
  }
  await import(pathToFileURL(validatePath).href);
}

const command = process.argv[2] ?? "inspect";

switch (command) {
  case "inspect":
    inspectPackage();
    break;
  case "run":
    await runSample();
    break;
  case "validate":
    await validatePackage();
    break;
  default:
    process.stderr.write(
      "Usage: content-factory <inspect|run|validate>\n"
    );
    process.exitCode = 2;
}
