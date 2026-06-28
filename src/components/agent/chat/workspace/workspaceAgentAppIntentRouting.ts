import type {
  NormalizedAppEntry,
  NormalizedAppManifest,
} from "@/features/agent-app/types";

export interface WorkspaceAgentAppIntentSource {
  appId: string;
  appName?: string;
  manifest: NormalizedAppManifest;
  disabled?: boolean;
}

export interface WorkspaceAgentAppIntentMatch {
  appId: string;
  appName: string;
  manifest: NormalizedAppManifest;
  intentKey: string;
  taskKind?: string;
  outputArtifactKind?: string;
  rightSurface?: string;
  expectedObjects: string[];
  matchedPhrase: string;
  source: "agent_app_manifest_intent" | "agent_app_manifest_default";
}

interface AgentRuntimeIntentDeclaration {
  key: string;
  source: WorkspaceAgentAppIntentMatch["source"];
  mode?: string;
  taskKind?: string;
  workflowKey?: string;
  outputArtifactKind?: string;
  rightSurface?: string;
  triggerPhrases: string[];
  expectedObjects: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => readTrimmedString(item))
    .filter((item): item is string => Boolean(item));
}

function readLocalizedStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return readStringArray(value);
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.values(value).flatMap(readStringArray);
}

function normalizeMatchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

function readRuntimeWorkerOutputArtifactKind(
  manifest: NormalizedAppManifest,
): string | undefined {
  const runtimeWorker = isRecord(manifest.agentRuntime)
    ? isRecord(manifest.agentRuntime.worker)
      ? manifest.agentRuntime.worker
      : undefined
    : undefined;
  return (
    readTrimmedString(manifest.runtimePackage.worker?.outputArtifactKind) ??
    readTrimmedString(runtimeWorker?.outputArtifactKind) ??
    readTrimmedString(runtimeWorker?.output_artifact_kind)
  );
}

function readFirstRuntimeTaskKind(
  manifest: NormalizedAppManifest,
): string | undefined {
  const agentRuntime = isRecord(manifest.agentRuntime)
    ? manifest.agentRuntime
    : undefined;
  const tasks = Array.isArray(agentRuntime?.tasks) ? agentRuntime.tasks : [];
  for (const task of tasks) {
    const taskKind = readTrimmedString(isRecord(task) ? task.kind : undefined);
    if (taskKind) {
      return taskKind;
    }
  }
  return undefined;
}

function findRuntimeWorkflow(
  manifest: NormalizedAppManifest,
  params: {
    intentKey?: string;
    taskKind?: string;
    workflowKey?: string;
  },
) {
  return manifest.workflows.find((workflow) => {
    if (params.workflowKey && workflow.key === params.workflowKey) {
      return true;
    }
    if (
      params.intentKey &&
      (workflow.key === params.intentKey ||
        workflow.triggerIntents?.includes(params.intentKey))
    ) {
      return true;
    }
    return Boolean(params.taskKind && workflow.taskKind === params.taskKind);
  });
}

function readPrimaryObjectKinds(manifest: NormalizedAppManifest): string[] {
  const productWorkspace = isRecord(manifest.workbench?.productWorkspace)
    ? manifest.workbench.productWorkspace
    : undefined;
  return readStringArray(productWorkspace?.primaryObjectKinds);
}

function expectedObjectsForIntent(
  manifest: NormalizedAppManifest,
  params: {
    explicitExpectedObjects?: string[];
    defaultObjectKind?: string;
    intentKey?: string;
    taskKind?: string;
    workflowKey?: string;
  },
): string[] {
  const explicit = params.explicitExpectedObjects ?? [];
  if (explicit.length > 0) {
    return explicit;
  }
  if (params.defaultObjectKind) {
    return [params.defaultObjectKind];
  }
  const workflow = findRuntimeWorkflow(manifest, params);
  const fromWorkflow = workflow?.steps
    ?.map((step) =>
      isRecord(step) ? readTrimmedString(step.expectedOutput) : undefined,
    )
    .filter((value): value is string => Boolean(value))
    .filter((value) => readPrimaryObjectKinds(manifest).includes(value));
  if (fromWorkflow?.length) {
    return Array.from(new Set(fromWorkflow));
  }
  return readPrimaryObjectKinds(manifest);
}

function inferDefaultRightSurface(
  manifest: NormalizedAppManifest,
): string | undefined {
  const historyRestoreDefault = readTrimmedString(
    manifest.workbench?.historyRestore?.defaultSurface,
  );
  if (historyRestoreDefault) {
    return historyRestoreDefault;
  }
  if (
    manifest.workbench?.profile === "production" ||
    manifest.workbench?.productWorkspace
  ) {
    return "productProfile";
  }
  return undefined;
}

function buildFallbackIntentDeclaration(
  manifest: NormalizedAppManifest,
): AgentRuntimeIntentDeclaration | null {
  const taskKind = readFirstRuntimeTaskKind(manifest);
  const outputArtifactKind = readRuntimeWorkerOutputArtifactKind(manifest);
  if (!taskKind && !outputArtifactKind) {
    return null;
  }
  const triggerPhrases = [
    manifest.displayName,
    manifest.appId,
    ...entryPhrases(manifest.entries),
  ].flatMap((phrase) => {
    const normalized = readTrimmedString(phrase);
    return normalized ? [normalized] : [];
  });
  if (triggerPhrases.length === 0) {
    return null;
  }
  return {
    key: "default",
    source: "agent_app_manifest_default",
    mode: "natural_language",
    taskKind,
    outputArtifactKind,
    rightSurface: inferDefaultRightSurface(manifest),
    triggerPhrases,
    expectedObjects: readPrimaryObjectKinds(manifest),
  };
}

function readIntentDeclarations(
  manifest: NormalizedAppManifest,
): AgentRuntimeIntentDeclaration[] {
  const agentRuntime = isRecord(manifest.agentRuntime)
    ? manifest.agentRuntime
    : undefined;
  const rawIntents = Array.isArray(agentRuntime?.intents)
    ? agentRuntime.intents
    : [];
  const rawActivationEntries = Array.isArray(agentRuntime?.activationEntries)
    ? agentRuntime.activationEntries
    : [];
  const fallbackOutputArtifactKind =
    readRuntimeWorkerOutputArtifactKind(manifest);
  const fallbackTaskKind = readFirstRuntimeTaskKind(manifest);

  const activationEntryIntents = rawActivationEntries
    .map((item): AgentRuntimeIntentDeclaration | null => {
      const entry = isRecord(item) ? item : undefined;
      const key = readTrimmedString(entry?.key);
      if (!key) {
        return null;
      }
      const aliases = readStringArray(entry?.aliases);
      const title = readTrimmedString(entry?.title);
      const taskKind =
        readTrimmedString(entry?.taskKind) ??
        readTrimmedString(entry?.task_kind) ??
        fallbackTaskKind;
      const workflowKey =
        readTrimmedString(entry?.workflow) ??
        readTrimmedString(entry?.workflowKey) ??
        readTrimmedString(entry?.workflow_key);
      const workflow = findRuntimeWorkflow(manifest, {
        intentKey: key,
        taskKind,
        workflowKey,
      });
      const triggerPhrases = [
        key,
        title,
        ...aliases,
        ...readLocalizedStringArray(entry?.triggerPhrases),
        ...readLocalizedStringArray(entry?.trigger_phrases),
      ].filter((value): value is string => Boolean(value));
      return {
        key,
        source: "agent_app_manifest_intent",
        mode: readTrimmedString(entry?.mode) ?? "at_command",
        taskKind,
        workflowKey,
        outputArtifactKind:
          readTrimmedString(entry?.outputArtifactKind) ??
          readTrimmedString(entry?.output_artifact_kind) ??
          workflow?.outputArtifactKind ??
          fallbackOutputArtifactKind,
        rightSurface:
          readTrimmedString(entry?.rightSurface) ??
          readTrimmedString(entry?.right_surface) ??
          inferDefaultRightSurface(manifest),
        triggerPhrases,
        expectedObjects: expectedObjectsForIntent(manifest, {
          defaultObjectKind: readTrimmedString(entry?.defaultObjectKind),
          intentKey: key,
          taskKind,
          workflowKey,
        }),
      };
    })
    .filter((intent): intent is AgentRuntimeIntentDeclaration =>
      Boolean(intent && intent.triggerPhrases.length > 0),
    );

  const explicitIntents = rawIntents
    .map((item): AgentRuntimeIntentDeclaration | null => {
      const intent = isRecord(item) ? item : undefined;
      const key = readTrimmedString(intent?.key);
      if (!key) {
        return null;
      }
      const triggerPhrases = readLocalizedStringArray(intent?.triggerPhrases);
      const taskKind =
        readTrimmedString(intent?.taskKind) ??
        readTrimmedString(intent?.task_kind) ??
        fallbackTaskKind;
      const workflowKey =
        readTrimmedString(intent?.workflow) ??
        readTrimmedString(intent?.workflowKey) ??
        readTrimmedString(intent?.workflow_key);
      const workflow = findRuntimeWorkflow(manifest, {
        intentKey: key,
        taskKind,
        workflowKey,
      });
      return {
        key,
        source: "agent_app_manifest_intent",
        mode: readTrimmedString(intent?.mode),
        taskKind,
        workflowKey,
        outputArtifactKind:
          readTrimmedString(intent?.outputArtifactKind) ??
          readTrimmedString(intent?.output_artifact_kind) ??
          workflow?.outputArtifactKind ??
          fallbackOutputArtifactKind,
        rightSurface:
          readTrimmedString(intent?.rightSurface) ??
          readTrimmedString(intent?.right_surface),
        triggerPhrases,
        expectedObjects: expectedObjectsForIntent(manifest, {
          explicitExpectedObjects: [
            ...readStringArray(intent?.expectedObjects),
            ...readStringArray(intent?.expected_objects),
          ],
          intentKey: key,
          taskKind,
          workflowKey,
        }),
      };
    })
    .filter((intent): intent is AgentRuntimeIntentDeclaration =>
      Boolean(intent && intent.triggerPhrases.length > 0),
    );
  if (activationEntryIntents.length > 0 || explicitIntents.length > 0) {
    return [...activationEntryIntents, ...explicitIntents];
  }
  const fallbackIntent = buildFallbackIntentDeclaration(manifest);
  return fallbackIntent ? [fallbackIntent] : [];
}

function entryPhrases(entries: NormalizedAppEntry[]): string[] {
  return entries
    .flatMap((entry) => [entry.title, entry.description])
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function buildCandidatePhrases(
  manifest: NormalizedAppManifest,
  intent: AgentRuntimeIntentDeclaration,
): string[] {
  return [
    intent.key,
    ...intent.triggerPhrases,
    manifest.displayName,
    manifest.appId,
    ...entryPhrases(manifest.entries),
  ]
    .flatMap((phrase) => {
      const normalized = readTrimmedString(phrase);
      return normalized ? [normalized] : [];
    })
    .filter((phrase, index, phrases) => {
      const normalized = normalizeMatchText(phrase);
      return (
        normalized.length >= 2 &&
        phrases.findIndex(
          (candidate) => normalizeMatchText(candidate) === normalized,
        ) === index
      );
    });
}

function scorePhraseMatch(sourceText: string, phrase: string): number {
  const normalizedSource = normalizeMatchText(sourceText);
  const normalizedPhrase = normalizeMatchText(phrase);
  if (!normalizedSource || !normalizedPhrase) {
    return 0;
  }
  if (normalizedSource === normalizedPhrase) {
    return 1000 + normalizedPhrase.length;
  }
  if (normalizedSource.includes(normalizedPhrase)) {
    return 500 + normalizedPhrase.length;
  }
  return 0;
}

export function resolveWorkspaceAgentAppIntent(
  sourceText: string,
  sources: readonly WorkspaceAgentAppIntentSource[],
): WorkspaceAgentAppIntentMatch | null {
  const normalizedSourceText = sourceText.trim();
  if (!normalizedSourceText) {
    return null;
  }

  let bestMatch: (WorkspaceAgentAppIntentMatch & { score: number }) | null =
    null;
  for (const source of sources) {
    if (source.disabled) {
      continue;
    }
    const manifest = source.manifest;
    for (const intent of readIntentDeclarations(manifest)) {
      for (const phrase of buildCandidatePhrases(manifest, intent)) {
        const score = scorePhraseMatch(normalizedSourceText, phrase);
        if (score <= 0 || (bestMatch && bestMatch.score >= score)) {
          continue;
        }
        bestMatch = {
          appId: source.appId || manifest.appId,
          appName: source.appName || manifest.displayName || manifest.appId,
          manifest,
          intentKey: intent.key,
          taskKind: intent.taskKind,
          outputArtifactKind: intent.outputArtifactKind,
          rightSurface: intent.rightSurface,
          expectedObjects: intent.expectedObjects,
          matchedPhrase: phrase,
          source: intent.source,
          score,
        };
      }
    }
  }

  if (!bestMatch) {
    return null;
  }
  const { score: _score, ...match } = bestMatch;
  return match;
}

export function buildAgentAppIntentRequestMetadata(
  match: WorkspaceAgentAppIntentMatch,
): Record<string, unknown> {
  const agentAppIntent: Record<string, unknown> = {
    source: match.source,
    app_id: match.appId,
    app_name: match.appName,
    intent_key: match.intentKey,
    expected_objects: match.expectedObjects,
    matched_phrase: match.matchedPhrase,
  };
  if (match.taskKind) {
    agentAppIntent.task_kind = match.taskKind;
  }
  if (match.outputArtifactKind) {
    agentAppIntent.output_artifact_kind = match.outputArtifactKind;
  }
  if (match.rightSurface) {
    agentAppIntent.right_surface = match.rightSurface;
  }

  return {
    agent_app_intent: agentAppIntent,
    ...(match.rightSurface
      ? {
          right_surface: {
            surface_kind: match.rightSurface,
            target: match.rightSurface,
            source: match.source,
            app_id: match.appId,
            intent_key: match.intentKey,
          },
        }
      : {}),
  };
}

export function buildAgentAppIntentSystemPrompt(
  match: WorkspaceAgentAppIntentMatch,
): string {
  const expectedObjects = match.expectedObjects.length
    ? match.expectedObjects.join(", ")
    : "manifest 声明的业务对象";
  return [
    "本轮请求已命中 Agent App manifest intent。",
    `Agent App: ${match.appName} (${match.appId})`,
    `Intent: ${match.intentKey}`,
    match.taskKind ? `Task kind: ${match.taskKind}` : null,
    match.outputArtifactKind
      ? `Output artifact kind: ${match.outputArtifactKind}`
      : null,
    match.rightSurface ? `Right surface: ${match.rightSurface}` : null,
    `Expected objects: ${expectedObjects}`,
    "必须按该 Agent App intent 执行业务，不要调用 skill_search、SkillTool 或其他 Skill 搜索/执行链路来替代这个 App。",
    "中间对话继续说明过程与关键决策；结构化产物必须进入 artifact.snapshot，payload 或 metadata 中包含可投影到 Product Workspace / right surface 的 workspace patch。",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
