import type {
  AgentAppArtifactRecord,
  AgentAppEvidenceRecord,
  AgentAppKnowledgeSearchResult,
  AgentAppRunResult,
  AgentAppStorageEntry,
  AgentAppTaskRecord,
} from "../types";
import type { CapabilityHost } from "../sdk/CapabilityHost";
import type {
  AgentAppWorkflowExecutionContext,
  AgentAppWorkflowRuntimeRunRecord,
  WorkflowRuntimeHost,
} from "./workflowRuntimeHost";

export interface ContentFactoryProjectInput {
  projectName: string;
  industry: string;
  targetPlatforms: string[];
  audience: string;
  requiresIpKnowledge: boolean;
  contentGoal: string;
}

export interface ContentFactoryProjectRecord extends ContentFactoryProjectInput {
  projectId: string;
  status: "draft" | "ready";
  createdAt: string;
}

export interface ContentFactoryScenarioRecord {
  scenarioId: string;
  dimension: string;
  painPoint: string;
  solution: string;
  decisionStage: "awareness" | "consideration" | "decision";
  tags: string[];
  knowledgeRecordId?: string;
}

export interface ContentFactoryAssetRecord {
  assetId: string;
  scenarioId: string;
  platform: string;
  format: "article" | "short_video_script" | "image_prompt";
  title: string;
  body: string;
  grade: "A" | "B" | "C";
  aiFlavorScore: number;
}

export interface ContentFactoryDemoResult {
  run: AgentAppRunResult;
  project: ContentFactoryProjectRecord;
  knowledge: AgentAppKnowledgeSearchResult;
  scenarios: ContentFactoryScenarioRecord[];
  contentAssets: ContentFactoryAssetRecord[];
  storageEntries: AgentAppStorageEntry[];
  artifact: AgentAppArtifactRecord;
  evidence: AgentAppEvidenceRecord;
  tasks: AgentAppTaskRecord[];
  workflowRun?: AgentAppWorkflowRuntimeRunRecord;
}

export const defaultContentFactoryProjectInput: ContentFactoryProjectInput = {
  projectName: "内容工厂样板项目",
  industry: "内容运营",
  targetPlatforms: ["公众号", "小红书"],
  audience: "个人 IP / 内容运营团队",
  requiresIpKnowledge: true,
  contentGoal: "基于三层知识库生成内容场景表和内容资产。",
};

function slugifyProjectId(projectName: string): string {
  const normalized = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "content-factory-project";
}

function buildScenarios(params: {
  project: ContentFactoryProjectRecord;
  knowledge: AgentAppKnowledgeSearchResult;
}): ContentFactoryScenarioRecord[] {
  const records = params.knowledge.records.length
    ? params.knowledge.records
    : [
      {
        id: "knowledge:fallback",
        bindingKey: "project_knowledge",
        title: "project_knowledge",
      },
    ];
  const stages: ContentFactoryScenarioRecord["decisionStage"][] = [
    "awareness",
    "consideration",
    "decision",
  ];

  return records.slice(0, 3).map((record, index) => ({
    scenarioId: `${params.project.projectId}-scenario-${index + 1}`,
    dimension: record.bindingKey === "ip_knowledge" ? "IP 表达" : "项目卖点",
    painPoint:
      index === 0
        ? "团队每次产出内容都要重新解释项目背景。"
        : "内容生产缺少可复用的场景和素材结构。",
    solution:
      index === 0
        ? "把个人 IP、产品事实和内容方法论拆成可检索知识块。"
        : "用内容场景规划表把痛点、解决方案和内容切口结构化。",
    decisionStage: stages[index % stages.length],
    tags: [params.project.industry, record.bindingKey],
    knowledgeRecordId: record.id,
  }));
}

function buildContentAssets(params: {
  project: ContentFactoryProjectRecord;
  scenarios: ContentFactoryScenarioRecord[];
}): ContentFactoryAssetRecord[] {
  return params.scenarios.flatMap((scenario, scenarioIndex) =>
    params.project.targetPlatforms.slice(0, 2).map((platform, platformIndex) => ({
      assetId: `${scenario.scenarioId}-asset-${platformIndex + 1}`,
      scenarioId: scenario.scenarioId,
      platform,
      format: platformIndex === 0 ? "article" : "short_video_script",
      title: `${platform}｜${scenario.dimension}内容切口 ${scenarioIndex + 1}`,
      body: `${scenario.painPoint} ${scenario.solution}`,
      grade: scenarioIndex === 0 ? "A" : "B",
      aiFlavorScore: 18 + scenarioIndex * 7 + platformIndex * 3,
    })),
  );
}

function buildKnowledgeBindingValue(params: {
  project: ContentFactoryProjectRecord;
  knowledge: AgentAppKnowledgeSearchResult;
}) {
  return {
    projectId: params.project.projectId,
    records: params.knowledge.records.map((record) => ({
      id: record.id,
      bindingKey: record.bindingKey,
      type: record.type,
      standard: record.standard,
    })),
    searchedAt: params.knowledge.searchedAt,
  };
}

function buildArtifactContent(params: {
  project: ContentFactoryProjectRecord;
  scenarios: ContentFactoryScenarioRecord[];
  contentAssets: ContentFactoryAssetRecord[];
  run: AgentAppRunResult;
}) {
  return {
    project: params.project,
    scenarios: params.scenarios,
    contentAssets: params.contentAssets,
    sourceRunId: params.run.run.runId,
    sourceArtifactIds: params.run.artifacts.map((item) => item.id),
    sourceTaskIds: params.run.run.taskIds,
  };
}

function buildEvidenceRefs(params: {
  artifact: AgentAppArtifactRecord;
  run: AgentAppRunResult;
}): string[] {
  return [
    params.artifact.id,
    ...params.run.artifacts.map((item) => item.id),
    ...params.run.evidence.map((item) => item.id),
    ...params.run.run.taskIds,
  ];
}

export async function runContentFactoryDemo(params: {
  host: CapabilityHost;
  workflowRuntime?: WorkflowRuntimeHost;
  input?: Partial<ContentFactoryProjectInput>;
  entryKey?: string;
  now?: () => string;
}): Promise<ContentFactoryDemoResult> {
  const entryKey = params.entryKey ?? "content_scenario_planning";
  const now = params.now ?? (() => new Date().toISOString());
  const input: ContentFactoryProjectInput = {
    ...defaultContentFactoryProjectInput,
    ...params.input,
  };
  const run = await params.host.runEntry(entryKey);
  const sdk = params.host.createSdkContext(entryKey, run.run.runId);
  const project: ContentFactoryProjectRecord = {
    ...input,
    projectId: slugifyProjectId(input.projectName),
    status: "ready",
    createdAt: now(),
  };

  if (params.workflowRuntime) {
    const workflow = await params.workflowRuntime.runWorkflow(
      {
        workflowKey: "content_factory_demo",
        entryKey,
        title: `${project.projectName} · workflow runtime`,
        initialValues: {
          project,
          sourceRun: run,
        },
        steps: [
          {
            id: "store-project",
            kind: "storage.set",
            label: "Store project",
            key: `projects/${project.projectId}`,
            value: project,
            assignTo: "projectStorage",
          },
          {
            id: "search-knowledge",
            kind: "knowledge.search",
            label: "Search project knowledge",
            query: `${project.projectName} ${project.industry}`,
            limit: 3,
            assignTo: "knowledge",
          },
          {
            id: "store-knowledge-binding",
            kind: "storage.set",
            label: "Store knowledge binding",
            key: `knowledge-bindings/${project.projectId}`,
            value: (context: AgentAppWorkflowExecutionContext) =>
              buildKnowledgeBindingValue({
                project,
                knowledge: context.values.knowledge as AgentAppKnowledgeSearchResult,
              }),
            assignTo: "knowledgeStorage",
          },
          {
            id: "store-content-scenarios",
            kind: "storage.set",
            label: "Store content scenarios",
            key: `content_scenarios/${project.projectId}`,
            value: (context: AgentAppWorkflowExecutionContext) =>
              buildScenarios({
                project,
                knowledge: context.values.knowledge as AgentAppKnowledgeSearchResult,
              }),
            assignTo: "scenariosStorage",
          },
          {
            id: "store-content-assets",
            kind: "storage.set",
            label: "Store content assets",
            key: `content-assets/${project.projectId}`,
            value: (context: AgentAppWorkflowExecutionContext) =>
              buildContentAssets({
                project,
                scenarios: (context.values.scenariosStorage as AgentAppStorageEntry)
                  .value as ContentFactoryScenarioRecord[],
              }),
            assignTo: "contentAssetsStorage",
          },
          {
            id: "create-content-table",
            kind: "artifacts.create",
            title: `${project.projectName} · 内容表`,
            artifactKind: "content_table",
            content: (context: AgentAppWorkflowExecutionContext) =>
              buildArtifactContent({
                project,
                scenarios: (context.values.scenariosStorage as AgentAppStorageEntry)
                  .value as ContentFactoryScenarioRecord[],
                contentAssets: (
                  context.values.contentAssetsStorage as AgentAppStorageEntry
                ).value as ContentFactoryAssetRecord[],
                run,
              }),
            assignTo: "contentArtifact",
          },
          {
            id: "record-content-evidence",
            kind: "evidence.record",
            label: "Record content factory evidence",
            evidenceKind: "content_factory_demo",
            message: (context: AgentAppWorkflowExecutionContext) => {
              const scenarios = (context.values.scenariosStorage as AgentAppStorageEntry)
                .value as ContentFactoryScenarioRecord[];
              const contentAssets = (
                context.values.contentAssetsStorage as AgentAppStorageEntry
              ).value as ContentFactoryAssetRecord[];
              return `Content factory demo generated ${contentAssets.length} assets from ${scenarios.length} scenarios.`;
            },
            refs: (context: AgentAppWorkflowExecutionContext) =>
              buildEvidenceRefs({
                artifact: context.values.contentArtifact as AgentAppArtifactRecord,
                run,
              }),
            assignTo: "contentEvidence",
          },
        ],
      },
      { runId: run.run.runId },
    );
    const knowledge = workflow.outputs.knowledge as AgentAppKnowledgeSearchResult;
    const scenarios = (workflow.outputs.scenariosStorage as AgentAppStorageEntry)
      .value as ContentFactoryScenarioRecord[];
    const contentAssets = (
      workflow.outputs.contentAssetsStorage as AgentAppStorageEntry
    ).value as ContentFactoryAssetRecord[];

    return {
      run,
      project,
      knowledge,
      scenarios,
      contentAssets,
      storageEntries: workflow.storageEntries,
      artifact: workflow.outputs.contentArtifact as AgentAppArtifactRecord,
      evidence: workflow.outputs.contentEvidence as AgentAppEvidenceRecord,
      tasks: [...run.tasks, ...workflow.tasks],
      workflowRun: workflow.run,
    };
  }

  const knowledge = await sdk.knowledge.search({
    query: `${project.projectName} ${project.industry}`,
    limit: 3,
  });
  const scenarios = buildScenarios({ project, knowledge });
  const contentAssets = buildContentAssets({ project, scenarios });
  const storageEntries = [
    await sdk.storage.set(`projects/${project.projectId}`, project),
    await sdk.storage.set(
      `knowledge-bindings/${project.projectId}`,
      buildKnowledgeBindingValue({ project, knowledge }),
    ),
    await sdk.storage.set(`content_scenarios/${project.projectId}`, scenarios),
    await sdk.storage.set(`content-assets/${project.projectId}`, contentAssets),
  ];
  const artifact = await sdk.artifacts.create({
    kind: "content_table",
    title: `${project.projectName} · 内容表`,
    content: buildArtifactContent({ project, scenarios, contentAssets, run }),
  });
  const evidence = await sdk.evidence.record({
    kind: "content_factory_demo",
    message: `Content factory demo generated ${contentAssets.length} assets from ${scenarios.length} scenarios.`,
    refs: buildEvidenceRefs({ artifact, run }),
  });

  return {
    run,
    project,
    knowledge,
    scenarios,
    contentAssets,
    storageEntries,
    artifact,
    evidence,
    tasks: run.tasks,
  };
}
