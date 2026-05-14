import type {
  Message,
  MessageImageWorkbenchPreview,
  MessageImageWorkbenchPreviewSelection,
} from "../types";
import type {
  ImageWorkbenchOutput,
  ImageWorkbenchTask,
  SessionImageWorkbenchState,
} from "./imageWorkbenchHelpers";
import {
  buildSessionImageWorkbenchStateFromMessages,
  isSessionImageWorkbenchStateMeaningful,
} from "./imageWorkbenchStateCache";

function normalizeSelectionIndex(
  selection?: MessageImageWorkbenchPreviewSelection,
): number | null {
  const value = selection?.imageIndex;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null;
}

function resolveOrderedTaskOutputs(
  task: ImageWorkbenchTask | null,
  outputs: ImageWorkbenchOutput[],
): ImageWorkbenchOutput[] {
  if (!task) {
    return outputs;
  }

  const ordered = task.outputIds
    .map((outputId) => outputs.find((output) => output.id === outputId))
    .filter((output): output is ImageWorkbenchOutput => Boolean(output));
  const orderedIds = new Set(ordered.map((output) => output.id));
  return [
    ...ordered,
    ...outputs.filter((output) => !orderedIds.has(output.id)),
  ];
}

function hasSelectionUrlInCurrentState(params: {
  current: SessionImageWorkbenchState;
  taskId: string | null;
  selectionUrl: string | null;
}): boolean {
  if (!params.selectionUrl || !params.taskId) {
    return true;
  }

  return params.current.outputs.some(
    (output) =>
      output.taskId === params.taskId &&
      output.url.trim() === params.selectionUrl,
  );
}

function taskStatusMatchesPreviewStatus(
  task: ImageWorkbenchTask | null,
  preview: MessageImageWorkbenchPreview,
): boolean {
  if (!task) {
    return false;
  }

  switch (preview.status) {
    case "complete":
      return task.status === "complete";
    case "partial":
      return task.status === "partial";
    case "failed":
      return task.status === "error";
    case "cancelled":
      return task.status === "cancelled";
    case "running":
    default:
      return ["queued", "routing", "running"].includes(task.status);
  }
}

export function resolveImageWorkbenchStateForPreviewSelection(params: {
  current: SessionImageWorkbenchState;
  messages: Message[];
  preview: MessageImageWorkbenchPreview;
  selection?: MessageImageWorkbenchPreviewSelection;
}): SessionImageWorkbenchState {
  const taskId = params.preview.taskId?.trim() || null;
  const selectionUrl = params.selection?.imageUrl?.trim() || null;
  const selectionIndex = normalizeSelectionIndex(params.selection);
  const currentTask = taskId
    ? (params.current.tasks.find((task) => task.id === taskId) ?? null)
    : null;
  const shouldUseMessageDerivedState =
    taskId &&
    (!currentTask ||
      !taskStatusMatchesPreviewStatus(currentTask, params.preview) ||
      !hasSelectionUrlInCurrentState({
        current: params.current,
        taskId,
        selectionUrl,
      }));
  const messageDerivedState = shouldUseMessageDerivedState
    ? buildSessionImageWorkbenchStateFromMessages(params.messages)
    : null;
  const baseState =
    messageDerivedState?.tasks.some((task) => task.id === taskId)
      ? messageDerivedState
      : isSessionImageWorkbenchStateMeaningful(params.current)
        ? params.current
        : messageDerivedState || params.current;
  const selectedTask = taskId
    ? (baseState.tasks.find((task) => task.id === taskId) ?? null)
    : null;
  const orderedTaskOutputs = resolveOrderedTaskOutputs(
    selectedTask,
    taskId
      ? baseState.outputs.filter((output) => output.taskId === taskId)
      : [],
  );
  const selectedOutput =
    (selectionUrl
      ? orderedTaskOutputs.find(
          (output) => output.url.trim() === selectionUrl,
        )
      : null) ||
    (selectionIndex !== null
      ? (orderedTaskOutputs[selectionIndex] ?? null)
      : null) ||
    orderedTaskOutputs[0] ||
    null;

  return {
    ...baseState,
    active: true,
    selectedTaskId: taskId ?? baseState.selectedTaskId ?? null,
    selectedOutputId: selectedOutput
      ? selectedOutput.id
      : taskId
        ? null
        : baseState.selectedOutputId,
  };
}
