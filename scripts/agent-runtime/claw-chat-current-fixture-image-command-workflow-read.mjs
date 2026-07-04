import {
  APP_SERVER_METHOD_WORKFLOW_READ,
  SESSION_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import { invokeAppServerFromPage } from "./claw-chat-current-fixture-rpc.mjs";
import { sanitizeJson } from "./claw-chat-current-fixture-utils.mjs";

const IMAGE_COMMAND_WORKFLOW_KEY = "image_command_workflow";
const IMAGE_COMMAND_WORKFLOW_STEP_IDS = [
  "intent",
  "route",
  "create_tasks",
  "generate",
  "persist_outputs",
];

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function readArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function readString(...values) {
  for (const value of values) {
    if (typeof value === "string") {
      return value;
    }
  }
  return "";
}

function stepStatus(step) {
  return readString(step?.status);
}

function stepId(step) {
  return readString(step?.stepId, step?.step_id);
}

function runId(run) {
  return readString(run?.workflowRunId, run?.workflow_run_id);
}

function summarizeImageCommandWorkflowRead(result, { turnId, taskId }) {
  const workflow = asRecord(result?.workflow) ?? {};
  const workflowRuns = readArray(
    result?.workflowRuns,
    result?.workflow_runs,
    workflow.workflowRuns,
    workflow.workflow_runs,
  );
  const workflowSteps = readArray(
    result?.workflowSteps,
    result?.workflow_steps,
    workflow.workflowSteps,
    workflow.workflow_steps,
  );
  const expectedRunId =
    typeof turnId === "string" && turnId.trim()
      ? `image-command-run-${turnId}`
      : "";
  const matchedRun =
    workflowRuns.find((run) => runId(run) === expectedRunId) ??
    workflowRuns.find(
      (run) =>
        readString(run?.workflowKey, run?.workflow_key) ===
        IMAGE_COMMAND_WORKFLOW_KEY,
    ) ??
    null;
  const matchedRunId = runId(matchedRun);
  const matchedSteps = workflowSteps.filter(
    (step) =>
      readString(step?.workflowRunId, step?.workflow_run_id) === matchedRunId,
  );
  const stepIds = matchedSteps.map(stepId).filter(Boolean);
  const createTasksStep =
    matchedSteps.find((step) => stepId(step) === "create_tasks") ?? null;
  const runStepCounts =
    asRecord(matchedRun?.stepCounts) ?? asRecord(matchedRun?.step_counts);
  const serialized = JSON.stringify(result ?? {});

  return sanitizeJson({
    sessionId: readString(result?.sessionId, result?.session_id),
    activeWorkflowRunId: readString(
      workflow.activeWorkflowRunId,
      workflow.active_workflow_run_id,
    ),
    runCount: workflowRuns.length,
    stepCount: workflowSteps.length,
    expectedRunId,
    matchedRun: matchedRun
      ? {
          workflowRunId: matchedRunId,
          workflowKey: readString(
            matchedRun.workflowKey,
            matchedRun.workflow_key,
          ),
          status: readString(matchedRun.status),
          taskId: readString(matchedRun.taskId, matchedRun.task_id),
          turnId: readString(matchedRun.turnId, matchedRun.turn_id),
          stepCounts: runStepCounts,
        }
      : null,
    matchedStepIds: stepIds,
    expectedStepIds: IMAGE_COMMAND_WORKFLOW_STEP_IDS,
    hasExpectedSteps: IMAGE_COMMAND_WORKFLOW_STEP_IDS.every((id) =>
      stepIds.includes(id),
    ),
    completedStepIds: matchedSteps
      .filter((step) => stepStatus(step) === "completed")
      .map(stepId)
      .filter(Boolean),
    createTasksStep: createTasksStep
      ? {
          stepId: stepId(createTasksStep),
          status: stepStatus(createTasksStep),
          toolCallIds: readArray(
            createTasksStep.toolCallIds,
            createTasksStep.tool_call_ids,
          ),
          artifactRefs: readArray(
            createTasksStep.artifactRefs,
            createTasksStep.artifact_refs,
          ),
        }
      : null,
    containsPrompt:
      serialized.includes("@配图") || serialized.includes("画一张"),
    containsTaskPath: serialized.includes(".lime/tasks/image_generate"),
    taskIdMatches:
      typeof taskId === "string" &&
      taskId.length > 0 &&
      readString(matchedRun?.taskId, matchedRun?.task_id) === taskId,
  });
}

export async function readImageCommandWorkflowAudit({
  page,
  appServerRequests,
  turnId,
  taskId,
}) {
  const workflowRead = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_WORKFLOW_READ,
    {
      sessionId: SESSION_ID,
    },
    appServerRequests,
  );

  return summarizeImageCommandWorkflowRead(workflowRead.result, {
    turnId,
    taskId,
  });
}
