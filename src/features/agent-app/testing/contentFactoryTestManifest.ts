import contentFactoryFixture from "./fixtures/content-factory-app.json";
import type { AgentAppSetupState, AppManifest } from "../types";

const contentFactoryBaseManifest = contentFactoryFixture as AppManifest;

export function buildContentFactoryUiRuntimeTestManifest(): AppManifest {
  return {
    ...contentFactoryBaseManifest,
    version: "0.3.0",
    requires: {
      sdk: "@lime/app-sdk@^0.3.0",
      capabilities: [
        "lime.agent",
        "lime.artifacts",
        "lime.evidence",
        "lime.knowledge",
        "lime.storage",
        "lime.ui",
      ],
    },
    runtimePackage: {
      ...contentFactoryBaseManifest.runtimePackage,
      ui: {
        path: "./dist/ui",
      },
    },
    entries: [
      {
        key: "dashboard",
        kind: "page",
        title: "项目首页",
        route: "/dashboard",
        requiredCapabilities: ["lime.ui", "lime.agent", "lime.storage"],
      },
      {
        key: "knowledge",
        kind: "panel",
        title: "知识面板",
        route: "/knowledge",
        requiredCapabilities: ["lime.ui", "lime.knowledge", "lime.storage"],
      },
      {
        key: "content_factory",
        kind: "page",
        title: "内容工厂",
        route: "/content-factory",
        requiredCapabilities: ["lime.ui", "lime.agent", "lime.storage"],
      },
      {
        key: "content_scenario_planning",
        kind: "workflow",
        title: "内容场景规划",
        description: "基于项目知识生成内容场景表。",
        requiredCapabilities: [
          "lime.agent",
          "lime.artifacts",
          "lime.evidence",
          "lime.knowledge",
        ],
      },
    ],
    knowledgeTemplates: [
      {
        key: "project_knowledge",
        type: "project",
        required: true,
      },
    ],
    artifacts: [
      ...(contentFactoryBaseManifest.artifacts ?? []).map((artifact) => ({
        ...artifact,
      })),
      { key: "content_table", type: "content_table", required: true },
      { key: "scene_table", type: "scene_table", required: true },
      { key: "content_batch", type: "content_batch", required: true },
      { key: "script_batch", type: "script_batch", required: true },
    ],
    workflows: [
      ...(contentFactoryBaseManifest.workflows ?? []).map((workflow) => ({
        ...workflow,
      })),
      {
        key: "content_scenario_planning",
        required: true,
      },
    ],
    skillRefs: [
      ...(contentFactoryBaseManifest.skillRefs ?? []).map((skill) => ({
        ...skill,
      })),
      {
        id: "article-writer",
        required: true,
      },
    ],
    toolRefs: [
      ...(contentFactoryBaseManifest.toolRefs ?? []).map((tool) => ({
        ...tool,
      })),
      {
        key: "creative_capability_search",
        capabilities: [
          "lime.capability.image.generate",
          "lime.capability.research.search",
        ],
      },
      {
        key: "document_parser",
        required: true,
      },
    ],
    evals: [
      ...(contentFactoryBaseManifest.evals ?? []).map((evalRule) => ({
        ...evalRule,
      })),
      {
        key: "fact_grounding",
        kind: "fact_grounding",
        required: true,
      },
      {
        key: "publish_readiness",
        kind: "publish_readiness",
      },
    ],
    services: [
      ...(contentFactoryBaseManifest.services ?? []).map((service) => ({
        ...service,
      })),
      {
        key: "content_worker",
        kind: "worker",
        required: true,
      },
    ],
    secrets: [
      ...(contentFactoryBaseManifest.secrets ?? []).map((secret) => ({
        ...secret,
      })),
      {
        key: "publish_api_key",
        provider: "host-secret",
      },
    ],
    overlayTemplates: [
      ...(contentFactoryBaseManifest.overlayTemplates ?? []).map((overlay) => ({
        ...overlay,
      })),
      {
        key: "content_review_overlay",
        scope: "entry",
      },
    ],
  };
}

export function buildContentFactoryUiRuntimeResolvedSetup(): AgentAppSetupState {
  return {
    knowledgeBindings: { project_knowledge: true },
    skills: { "article-writer": true },
    tools: { document_parser: true },
    artifactTypes: {
      content_table: true,
      scene_table: true,
      content_batch: true,
      script_batch: true,
    },
    evals: { fact_grounding: true },
    services: { content_worker: true },
    workflows: { content_scenario_planning: true },
  };
}
