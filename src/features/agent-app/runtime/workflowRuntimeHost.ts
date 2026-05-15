import type {
  AgentAppArtifactRecord,
  AgentAppEvidenceRecord,
  AgentAppHostFlags,
  AgentAppKnowledgeSearchResult,
  AgentAppProvenance,
  AgentAppStorageEntry,
  AgentAppTaskRecord,
  ProjectedEntry,
} from "../types";
import { AgentAppCapabilityError } from "../sdk/capabilityErrors";
import type { CapabilityHost, LimeAppSdk } from "../sdk/CapabilityHost";
import { resolveAgentAppHostFlags } from "../featureFlag";
import {
  defaultAgentAppWorkflowRuntimePolicy,
  isAgentAppWorkflowStepKind,
  resolveAgentAppWorkflowRuntimePolicy,
  type AgentAppWorkflowRuntimePolicy,
  type AgentAppWorkflowStepKind,
} from "./runtimePolicy";

export type AgentAppWorkflowRunStatus =
  | "running"
  | "succeeded"
  | "cancelled"
  | "failed";

export type AgentAppWorkflowTraceEventStatus =
  | "started"
  | "succeeded"
  | "cancelled"
  | "failed";

export interface AgentAppWorkflowTraceEvent {
  at: string;
  status: AgentAppWorkflowTraceEventStatus;
  message: string;
  stepId?: string;
  stepKind?: AgentAppWorkflowStepKind;
  refs?: string[];
}

export interface AgentAppWorkflowExecutionContext {
  appId: string;
  entry: ProjectedEntry;
  runId: string;
  workflowKey: string;
  values: Record<string, unknown>;
  storageKeys: string[];
  artifactIds: string[];
  evidenceIds: string[];
  taskIds: string[];
  knowledgeQueries: string[];
}

type Resolvable<T> = T | ((context: AgentAppWorkflowExecutionContext) => T | Promise<T>);

interface AgentAppWorkflowStepBase {
  id: string;
  label?: string;
  assignTo?: string;
}

export interface AgentAppWorkflowStorageSetStep extends AgentAppWorkflowStepBase {
  kind: "storage.set";
  key: Resolvable<string>;
  value: Resolvable<unknown>;
}

export interface AgentAppWorkflowKnowledgeSearchStep extends AgentAppWorkflowStepBase {
  kind: "knowledge.search";
  query: Resolvable<string>;
  limit?: Resolvable<number | undefined>;
}

export interface AgentAppWorkflowAgentTaskStep extends AgentAppWorkflowStepBase {
  kind: "agent.startTask";
  taskTitle: Resolvable<string>;
  prompt: Resolvable<string>;
  taskKind?: Resolvable<string | undefined>;
  idempotencyKey?: Resolvable<string | undefined>;
  input?: Resolvable<unknown>;
  expectedOutput?: Resolvable<unknown>;
  tools?: Resolvable<string[] | undefined>;
  humanReview?: Resolvable<boolean | undefined>;
}

export interface AgentAppWorkflowArtifactCreateStep extends AgentAppWorkflowStepBase {
  kind: "artifacts.create";
  artifactKind: Resolvable<string>;
  title: Resolvable<string>;
  content: Resolvable<unknown>;
}

export interface AgentAppWorkflowEvidenceRecordStep extends AgentAppWorkflowStepBase {
  kind: "evidence.record";
  evidenceKind: Resolvable<string>;
  message: Resolvable<string>;
  refs?: Resolvable<string[] | undefined>;
}

export type AgentAppWorkflowStep =
  | AgentAppWorkflowStorageSetStep
  | AgentAppWorkflowKnowledgeSearchStep
  | AgentAppWorkflowAgentTaskStep
  | AgentAppWorkflowArtifactCreateStep
  | AgentAppWorkflowEvidenceRecordStep;

export interface AgentAppWorkflowDefinition {
  workflowKey: string;
  entryKey: string;
  title: string;
  steps: AgentAppWorkflowStep[];
  initialValues?: Record<string, unknown>;
}

export interface AgentAppWorkflowRuntimeRunRecord {
  runId: string;
  appId: string;
  entryKey: string;
  workflowKey: string;
  title: string;
  status: AgentAppWorkflowRunStatus;
  startedAt: string;
  finishedAt?: string;
  cancelledAt?: string;
  failedAt?: string;
  storageKeys: string[];
  artifactIds: string[];
  evidenceIds: string[];
  taskIds: string[];
  knowledgeQueries: string[];
  trace: AgentAppWorkflowTraceEvent[];
  policy: AgentAppWorkflowRuntimePolicy;
  provenance: AgentAppProvenance;
}

export interface AgentAppWorkflowRuntimeRunResult {
  run: AgentAppWorkflowRuntimeRunRecord;
  outputs: Record<string, unknown>;
  storageEntries: AgentAppStorageEntry[];
  artifacts: AgentAppArtifactRecord[];
  evidence: AgentAppEvidenceRecord[];
  tasks: AgentAppTaskRecord[];
  knowledge: AgentAppKnowledgeSearchResult[];
}

export interface AgentAppWorkflowRuntimeControl {
  runId: string;
  cancel(): void;
}

interface WorkflowRuntimeHostOptions {
  host: CapabilityHost;
  flags?: Partial<AgentAppHostFlags>;
  policy?: Partial<AgentAppWorkflowRuntimePolicy>;
  now?: () => string;
}

interface WorkflowRunOptions {
  runId?: string;
  onTrace?: (
    event: AgentAppWorkflowTraceEvent,
    control: AgentAppWorkflowRuntimeControl,
  ) => void;
}

interface StepExecutionResult {
  output: unknown;
  refs: string[];
  storageEntry?: AgentAppStorageEntry;
  artifact?: AgentAppArtifactRecord;
  evidence?: AgentAppEvidenceRecord;
  task?: AgentAppTaskRecord;
  knowledge?: AgentAppKnowledgeSearchResult;
}

export class WorkflowRuntimeHost {
  private readonly host: CapabilityHost;
  private readonly flags: AgentAppHostFlags;
  private readonly policy: AgentAppWorkflowRuntimePolicy;
  private readonly now: () => string;
  private readonly cancelledRunIds = new Set<string>();
  private runCounter = 0;

  constructor(options: WorkflowRuntimeHostOptions) {
    this.host = options.host;
    this.flags = resolveAgentAppHostFlags(options.flags);
    this.policy = resolveAgentAppWorkflowRuntimePolicy(options.policy);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  cancelWorkflowRun(runId: string): void {
    this.cancelledRunIds.add(runId);
  }

  async runWorkflow(
    definition: AgentAppWorkflowDefinition,
    options: WorkflowRunOptions = {},
  ): Promise<AgentAppWorkflowRuntimeRunResult> {
    this.assertEnabled(definition.entryKey);
    this.assertPolicy(definition);

    const runId = options.runId ?? this.nextRunId(definition.entryKey);
    const sdk = this.host.createSdkContext(definition.entryKey, runId);
    this.assertWorkflowEntry(sdk.entry);

    const context: AgentAppWorkflowExecutionContext = {
      appId: sdk.appId,
      entry: sdk.entry,
      runId,
      workflowKey: definition.workflowKey,
      values: { ...(definition.initialValues ?? {}) },
      storageKeys: [],
      artifactIds: [],
      evidenceIds: [],
      taskIds: [],
      knowledgeQueries: [],
    };
    const run: AgentAppWorkflowRuntimeRunRecord = {
      runId,
      appId: sdk.appId,
      entryKey: definition.entryKey,
      workflowKey: definition.workflowKey,
      title: definition.title,
      status: "running",
      startedAt: this.now(),
      storageKeys: context.storageKeys,
      artifactIds: context.artifactIds,
      evidenceIds: context.evidenceIds,
      taskIds: context.taskIds,
      knowledgeQueries: context.knowledgeQueries,
      trace: [],
      policy: this.policy,
      provenance: {
        ...sdk.entry.provenance,
        workflowRunId: runId,
      },
    };
    const storageEntries: AgentAppStorageEntry[] = [];
    const artifacts: AgentAppArtifactRecord[] = [];
    const evidence: AgentAppEvidenceRecord[] = [];
    const tasks: AgentAppTaskRecord[] = [];
    const knowledge: AgentAppKnowledgeSearchResult[] = [];
    const control: AgentAppWorkflowRuntimeControl = {
      runId,
      cancel: () => this.cancelWorkflowRun(runId),
    };

    this.emitTrace(
      run,
      {
        at: this.now(),
        status: "started",
        message: `Workflow ${definition.workflowKey} started.`,
      },
      options.onTrace,
      control,
    );

    try {
      for (const step of definition.steps) {
        if (this.isCancelled(runId)) {
          return this.finishCancelled(
            run,
            context,
            {
              storageEntries,
              artifacts,
              evidence,
              tasks,
              knowledge,
            },
            options.onTrace,
            control,
          );
        }

        this.emitTrace(
          run,
          {
            at: this.now(),
            status: "started",
            stepId: step.id,
            stepKind: step.kind,
            message: `${step.label ?? step.id} started.`,
          },
          options.onTrace,
          control,
        );

        const result = await this.executeStep(step, sdk, context);
        const outputKey = step.assignTo ?? step.id;
        context.values[outputKey] = result.output;
        if (result.storageEntry) {
          storageEntries.push(result.storageEntry);
        }
        if (result.artifact) {
          artifacts.push(result.artifact);
        }
        if (result.evidence) {
          evidence.push(result.evidence);
        }
        if (result.task) {
          tasks.push(result.task);
        }
        if (result.knowledge) {
          knowledge.push(result.knowledge);
        }

        this.emitTrace(
          run,
          {
            at: this.now(),
            status: "succeeded",
            stepId: step.id,
            stepKind: step.kind,
            refs: result.refs,
            message: `${step.label ?? step.id} succeeded.`,
          },
          options.onTrace,
          control,
        );
        await Promise.resolve();
      }

      if (this.isCancelled(runId)) {
        return this.finishCancelled(
          run,
          context,
          {
            storageEntries,
            artifacts,
            evidence,
            tasks,
            knowledge,
          },
          options.onTrace,
          control,
        );
      }

      run.status = "succeeded";
      run.finishedAt = this.now();
      this.emitTrace(
        run,
        {
          at: this.now(),
          status: "succeeded",
          message: `Workflow ${definition.workflowKey} succeeded.`,
          refs: [...context.artifactIds, ...context.evidenceIds, ...context.taskIds],
        },
        options.onTrace,
        control,
      );
      this.cancelledRunIds.delete(runId);

      return {
        run,
        outputs: context.values,
        storageEntries,
        artifacts,
        evidence,
        tasks,
        knowledge,
      };
    } catch (error) {
      run.status = "failed";
      run.failedAt = this.now();
      run.finishedAt = run.failedAt;
      this.emitTrace(
        run,
        {
          at: this.now(),
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        },
        options.onTrace,
        control,
      );
      this.cancelledRunIds.delete(runId);
      throw error;
    }
  }

  private async executeStep(
    step: AgentAppWorkflowStep,
    sdk: LimeAppSdk,
    context: AgentAppWorkflowExecutionContext,
  ): Promise<StepExecutionResult> {
    if (step.kind === "storage.set") {
      const key = await this.resolveRequiredValue(step.key, context);
      const value = await this.resolveValue(step.value, context);
      const entry = await sdk.storage.set(key, value);
      context.storageKeys.push(entry.key);
      return {
        output: entry,
        refs: [`storage:${entry.key}`],
        storageEntry: entry,
      };
    }

    if (step.kind === "knowledge.search") {
      const query = await this.resolveRequiredValue(step.query, context);
      const limit = await this.resolveValue(step.limit, context);
      const result = await sdk.knowledge.search({ query, limit });
      context.knowledgeQueries.push(result.query);
      return {
        output: result,
        refs: result.records.map((record) => record.id),
        knowledge: result,
      };
    }

    if (step.kind === "agent.startTask") {
      const task = await sdk.agent.startTask({
        title: await this.resolveRequiredValue(step.taskTitle, context),
        prompt: await this.resolveRequiredValue(step.prompt, context),
        taskKind: await this.resolveValue(step.taskKind, context),
        idempotencyKey: await this.resolveValue(step.idempotencyKey, context),
        input: await this.resolveValue(step.input, context),
        expectedOutput: await this.resolveValue(step.expectedOutput, context),
        tools: await this.resolveValue(step.tools, context),
        humanReview: await this.resolveValue(step.humanReview, context),
      });
      context.taskIds.push(task.taskId);
      return {
        output: task,
        refs: [task.taskId],
        task,
      };
    }

    if (step.kind === "artifacts.create") {
      const artifact = await sdk.artifacts.create({
        kind: await this.resolveRequiredValue(step.artifactKind, context),
        title: await this.resolveRequiredValue(step.title, context),
        content: await this.resolveValue(step.content, context),
      });
      context.artifactIds.push(artifact.id);
      return {
        output: artifact,
        refs: [artifact.id],
        artifact,
      };
    }

    const evidence = await sdk.evidence.record({
      kind: await this.resolveRequiredValue(step.evidenceKind, context),
      message: await this.resolveRequiredValue(step.message, context),
      refs: await this.resolveValue(step.refs, context),
    });
    context.evidenceIds.push(evidence.id);
    return {
      output: evidence,
      refs: [evidence.id, ...evidence.refs],
      evidence,
    };
  }

  private async resolveValue<T>(
    value: Resolvable<T> | undefined,
    context: AgentAppWorkflowExecutionContext,
  ): Promise<T | undefined> {
    if (typeof value === "function") {
      return (value as (context: AgentAppWorkflowExecutionContext) => T | Promise<T>)(
        context,
      );
    }
    return value;
  }

  private async resolveRequiredValue<T>(
    value: Resolvable<T>,
    context: AgentAppWorkflowExecutionContext,
  ): Promise<T> {
    return this.resolveValue(value, context) as Promise<T>;
  }

  private finishCancelled(
    run: AgentAppWorkflowRuntimeRunRecord,
    context: AgentAppWorkflowExecutionContext,
    result: Omit<AgentAppWorkflowRuntimeRunResult, "run" | "outputs">,
    onTrace: WorkflowRunOptions["onTrace"],
    control: AgentAppWorkflowRuntimeControl,
  ): AgentAppWorkflowRuntimeRunResult {
    run.status = "cancelled";
    run.cancelledAt = this.now();
    run.finishedAt = run.cancelledAt;
    this.emitTrace(
      run,
      {
        at: this.now(),
        status: "cancelled",
        message: `Workflow ${run.workflowKey} cancelled.`,
        refs: [...context.storageKeys, ...context.artifactIds, ...context.evidenceIds],
      },
      onTrace,
      control,
    );
    this.cancelledRunIds.delete(run.runId);

    return {
      run,
      outputs: context.values,
      ...result,
    };
  }

  private emitTrace(
    run: AgentAppWorkflowRuntimeRunRecord,
    event: AgentAppWorkflowTraceEvent,
    onTrace: WorkflowRunOptions["onTrace"],
    control: AgentAppWorkflowRuntimeControl,
  ): void {
    if (run.trace.length >= this.policy.maxTraceEvents) {
      throw new AgentAppCapabilityError({
        code: "WORKFLOW_POLICY_VIOLATION",
        message: `Workflow trace exceeds ${this.policy.maxTraceEvents} events.`,
        appId: run.appId,
        entryKey: run.entryKey,
      });
    }
    run.trace.push(event);
    onTrace?.(event, control);
  }

  private assertEnabled(entryKey: string): void {
    if (this.flags.workerRuntimeEnabled) {
      return;
    }
    throw new AgentAppCapabilityError({
      code: "WORKFLOW_RUNTIME_DISABLED",
      message: "Agent App workflow runtime is disabled.",
      entryKey,
    });
  }

  private assertPolicy(definition: AgentAppWorkflowDefinition): void {
    if (definition.steps.length > this.policy.maxSteps) {
      throw new AgentAppCapabilityError({
        code: "WORKFLOW_POLICY_VIOLATION",
        message: `Workflow ${definition.workflowKey} declares ${definition.steps.length} steps, but the policy allows ${this.policy.maxSteps}.`,
        entryKey: definition.entryKey,
      });
    }

    const stepIds = new Set<string>();
    definition.steps.forEach((step) => {
      if (stepIds.has(step.id)) {
        throw new AgentAppCapabilityError({
          code: "WORKFLOW_POLICY_VIOLATION",
          message: `Workflow ${definition.workflowKey} declares duplicate step ${step.id}.`,
          entryKey: definition.entryKey,
        });
      }
      stepIds.add(step.id);

      if (!isAgentAppWorkflowStepKind(step.kind)) {
        throw new AgentAppCapabilityError({
          code: "WORKFLOW_POLICY_VIOLATION",
          message: `Workflow step ${step.id} uses unsupported kind ${String(step.kind)}.`,
          entryKey: definition.entryKey,
        });
      }

      if (!this.policy.allowedStepKinds.includes(step.kind)) {
        throw new AgentAppCapabilityError({
          code: "WORKFLOW_POLICY_VIOLATION",
          message: `Workflow step kind ${step.kind} is not allowed by policy.`,
          entryKey: definition.entryKey,
        });
      }
    });
  }

  private assertWorkflowEntry(entry: ProjectedEntry): void {
    if (entry.kind === "workflow" || entry.kind === "background-task") {
      return;
    }
    throw new AgentAppCapabilityError({
      code: "WORKFLOW_POLICY_VIOLATION",
      message: `Entry ${entry.key} is ${entry.kind}, not a workflow runtime entry.`,
      appId: entry.appId,
      entryKey: entry.key,
    });
  }

  private isCancelled(runId: string): boolean {
    return this.cancelledRunIds.has(runId);
  }

  private nextRunId(entryKey: string): string {
    this.runCounter += 1;
    return `${entryKey}-workflow-runtime-${this.runCounter}`;
  }
}

export { defaultAgentAppWorkflowRuntimePolicy };
export type { AgentAppWorkflowRuntimePolicy, AgentAppWorkflowStepKind };
