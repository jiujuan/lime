import type { TFunction } from "i18next";

import type {
  ImageRuntimeContractSnapshot,
  ImageStoryboardSlot,
} from "../types";
import { buildLimeCorePolicyEvaluationMetaItem } from "../workspace/mediaTaskPolicyEvaluation";
import type {
  ImageWorkbenchOutputView,
  ImageWorkbenchTaskView,
} from "./imageWorkbenchTypes";

export type ImageTaskViewerTranslate = TFunction<"agent", undefined>;

export interface ImageTaskViewerRuntimeContractBadge {
  label: string;
  tone: string;
}

export interface ImageTaskViewerStoryboardSelection {
  slotIndex: number;
  label: string | null;
  prompt: string | null;
}

function resolveOutputDisplayIndex(
  outputIndex: number,
  slotIndex?: number | null,
): number {
  return slotIndex && slotIndex > 0 ? slotIndex : outputIndex + 1;
}

export function resolveOutputDisplayIndexForLabel(
  outputIndex: number,
  slotIndex?: number | null,
): number {
  return resolveOutputDisplayIndex(outputIndex, slotIndex);
}

export function resolveModeEyebrow(
  mode: string | undefined,
  t: ImageTaskViewerTranslate,
): string {
  switch ((mode || "").trim().toLowerCase()) {
    case "edit":
      return t("agentChat.imageWorkbenchPreview.tool.editing");
    case "variation":
      return t("agentChat.imageWorkbenchPreview.tool.redraw");
    case "generate":
    default:
      return t("agentChat.imageWorkbenchPreview.tool.generation");
  }
}

export function resolveSourceLabel(
  mode: string | undefined,
  t: ImageTaskViewerTranslate,
): string {
  return (mode || "").trim().toLowerCase() === "variation"
    ? t("agentChat.imageTaskViewer.source.reference")
    : t("agentChat.imageTaskViewer.source.source");
}

export function resolveFollowUpLabel(
  mode: string | undefined,
  t: ImageTaskViewerTranslate,
): string {
  const normalizedMode = (mode || "").trim().toLowerCase();
  if (normalizedMode === "edit") {
    return t("agentChat.imageTaskViewer.action.continueEdit");
  }
  if (normalizedMode === "variation") {
    return t("agentChat.imageTaskViewer.action.continueVariation");
  }
  return t("agentChat.imageTaskViewer.action.redrawFromImage");
}

export function resolveLayoutLabel(
  layoutHint: string | null | undefined,
  t: ImageTaskViewerTranslate,
): string | null {
  return layoutHint === "storyboard_3x3"
    ? t("agentChat.imageTaskViewer.layout.storyboard3x3")
    : null;
}

export function resolveOutputGridClassName(params: {
  layoutHint?: string | null;
  outputCount: number;
}): string {
  if (params.layoutHint === "storyboard_3x3") {
    return "grid-cols-3";
  }
  if (params.outputCount <= 4) {
    return "grid-cols-2";
  }
  if (params.outputCount <= 9) {
    return "grid-cols-2 sm:grid-cols-3";
  }
  return "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4";
}

export function resolveOutputTileAspectClass(
  layoutHint?: string | null,
): string {
  return layoutHint === "storyboard_3x3" ? "aspect-square" : "aspect-[4/3]";
}

export function resolveSelectedOutputLabel(params: {
  selectedIndex: number;
  outputCount: number;
  layoutHint?: string | null;
  t: ImageTaskViewerTranslate;
}): string | null {
  if (params.selectedIndex < 0 || params.outputCount <= 1) {
    return null;
  }

  return params.layoutHint === "storyboard_3x3"
    ? params.t("agentChat.imageTaskViewer.selected.storyboardSlot", {
        index: params.selectedIndex + 1,
      })
    : params.t("agentChat.imageTaskViewer.selected.image", {
        index: params.selectedIndex + 1,
      });
}

export function resolveStoryboardSlotLabel(params: {
  layoutHint?: string | null;
  outputIndex: number;
  slotIndex?: number | null;
  slotLabel?: string | null;
  taskSlotLabel?: string | null;
  t: ImageTaskViewerTranslate;
}): string | null {
  if (params.layoutHint !== "storyboard_3x3") {
    return null;
  }

  return (
    params.slotLabel?.trim() ||
    params.taskSlotLabel?.trim() ||
    params.t("agentChat.imageTaskViewer.storyboard.slotFallback", {
      index: resolveOutputDisplayIndex(params.outputIndex, params.slotIndex),
    })
  );
}

export function buildFollowUpCommand(params: {
  mode?: string;
  outputRef?: string | null;
  prompt?: string | null;
}): string | null {
  const normalizedRef = params.outputRef?.trim();
  if (!normalizedRef) {
    return null;
  }

  const referenceToken = normalizedRef.startsWith("#")
    ? normalizedRef
    : `#${normalizedRef}`;
  const normalizedPrompt = params.prompt?.trim();
  const normalizedMode = (params.mode || "").trim().toLowerCase();
  if (normalizedMode === "edit" && normalizedPrompt) {
    return `@修图 ${referenceToken} ${normalizedPrompt}`;
  }
  if (normalizedMode === "variation" && normalizedPrompt) {
    return `@重绘 ${referenceToken} ${normalizedPrompt}`;
  }
  return `@重绘 ${referenceToken} `;
}

export function resolveStatusLabel(
  status: string | undefined,
  mode: string | undefined,
  t: ImageTaskViewerTranslate,
): string {
  const normalizedMode = (mode || "").trim().toLowerCase();
  switch ((status || "").trim().toLowerCase()) {
    case "complete":
      switch (normalizedMode) {
        case "edit":
          return t("agentChat.imageTaskViewer.status.complete.edit");
        case "variation":
          return t("agentChat.imageTaskViewer.status.complete.variation");
        case "generate":
        default:
          return t("agentChat.imageTaskViewer.status.complete.generate");
      }
    case "partial":
      return t("agentChat.imageTaskViewer.status.partial");
    case "cancelled":
      return t("agentChat.imageTaskViewer.status.cancelled");
    case "error":
      switch (normalizedMode) {
        case "edit":
          return t("agentChat.imageTaskViewer.status.error.edit");
        case "variation":
          return t("agentChat.imageTaskViewer.status.error.variation");
        case "generate":
        default:
          return t("agentChat.imageTaskViewer.status.error.generate");
      }
    case "queued":
      return t("agentChat.imageTaskViewer.status.queued");
    case "running":
    case "routing":
      switch (normalizedMode) {
        case "edit":
          return t("agentChat.imageTaskViewer.status.running.edit");
        case "variation":
          return t("agentChat.imageTaskViewer.status.running.variation");
        case "generate":
        default:
          return t("agentChat.imageTaskViewer.status.running.generate");
      }
    default:
      return t("agentChat.imageTaskViewer.status.preparing");
  }
}

export function resolveStatusTone(status?: string): string {
  switch ((status || "").trim().toLowerCase()) {
    case "complete":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "partial":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "cancelled":
      return "border-slate-200 bg-slate-100 text-slate-600";
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "queued":
    case "running":
    case "routing":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

export function resolveRuntimeContractBadge(
  runtimeContract: ImageRuntimeContractSnapshot | null | undefined,
  t: ImageTaskViewerTranslate,
): ImageTaskViewerRuntimeContractBadge | null {
  if (!runtimeContract) {
    return null;
  }

  const contractKey = runtimeContract.contractKey?.trim() || "image_generation";
  const outcome = (runtimeContract.routingOutcome || "").trim().toLowerCase();
  if (outcome === "blocked") {
    return {
      label: t("agentChat.imageTaskViewer.runtimeContract.blocked", {
        reason: runtimeContract.failureCode?.trim() || contractKey,
      }),
      tone: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  if (outcome === "failed") {
    return {
      label: t("agentChat.imageTaskViewer.runtimeContract.failed", {
        reason: runtimeContract.failureCode?.trim() || contractKey,
      }),
      tone: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  return {
    label: t("agentChat.imageTaskViewer.runtimeContract.accepted", {
      contractKey,
    }),
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

export function resolveRuntimeContractRegistryLabel(
  runtimeContract: ImageRuntimeContractSnapshot | null | undefined,
  t: ImageTaskViewerTranslate,
): string | null {
  if (runtimeContract?.modelCapabilityAssessmentSource !== "model_registry") {
    return null;
  }
  if (runtimeContract.modelSupportsImageGeneration === false) {
    return t("agentChat.imageTaskViewer.runtimeContract.registry.unsupported");
  }
  if (runtimeContract.modelSupportsImageGeneration === true) {
    return t("agentChat.imageTaskViewer.runtimeContract.registry.supported");
  }
  return t("agentChat.imageTaskViewer.runtimeContract.registry.unknown");
}

export function resolveRuntimeContractPolicyLabel(
  runtimeContract?: ImageRuntimeContractSnapshot | null,
): string | null {
  if (!runtimeContract) {
    return null;
  }

  return buildLimeCorePolicyEvaluationMetaItem({
    evaluationStatus: runtimeContract.limecorePolicyEvaluationStatus,
    evaluationDecision: runtimeContract.limecorePolicyEvaluationDecision,
    blockingRefs: runtimeContract.limecorePolicyEvaluationBlockingRefs,
    askRefs: runtimeContract.limecorePolicyEvaluationAskRefs,
    pendingRefs: runtimeContract.limecorePolicyEvaluationPendingRefs,
    missingInputs: runtimeContract.limecorePolicyMissingInputs,
    pendingHitRefs: runtimeContract.limecorePolicyPendingHitRefs,
  });
}

export function resolveEmptyStateDescription(
  status: string | undefined,
  _failureMessage: string | undefined,
  mode: string | undefined,
  t: ImageTaskViewerTranslate,
): string {
  switch ((status || "").trim().toLowerCase()) {
    case "cancelled":
      return t("agentChat.imageTaskViewer.empty.cancelled");
    case "error":
      return t("agentChat.imageTaskViewer.empty.error");
    case "queued":
      return t("agentChat.imageTaskViewer.empty.queued");
    case "running":
    case "routing":
      switch ((mode || "").trim().toLowerCase()) {
        case "edit":
          return t("agentChat.imageTaskViewer.empty.running.edit");
        case "variation":
          return t("agentChat.imageTaskViewer.empty.running.variation");
        case "generate":
        default:
          return t("agentChat.imageTaskViewer.empty.running.generate");
      }
    default:
      return t("agentChat.imageTaskViewer.empty.preparing");
  }
}

export function resolveImageUnavailableTitle(
  status: string | undefined,
  mode: string | undefined,
  t: ImageTaskViewerTranslate,
): string {
  switch ((status || "").trim().toLowerCase()) {
    case "complete":
    case "partial":
      return t("agentChat.imageTaskViewer.unavailable.title");
    default:
      return resolveStatusLabel(status, mode, t);
  }
}

export function resolveImageUnavailableDescription(
  mode: string | undefined,
  t: ImageTaskViewerTranslate,
): string {
  switch ((mode || "").trim().toLowerCase()) {
    case "edit":
      return t("agentChat.imageTaskViewer.unavailable.edit");
    case "variation":
      return t("agentChat.imageTaskViewer.unavailable.variation");
    case "generate":
    default:
      return t("agentChat.imageTaskViewer.unavailable.generate");
  }
}

export function resolveSourcePlaceholderLabel(
  mode: string | undefined,
  reason: "empty" | "error",
  t: ImageTaskViewerTranslate,
): string {
  if (reason === "error") {
    return (mode || "").trim().toLowerCase() === "variation"
      ? t("agentChat.imageTaskViewer.source.referenceUnavailable")
      : t("agentChat.imageTaskViewer.source.sourceUnavailable");
  }

  return (mode || "").trim().toLowerCase() === "variation"
    ? t("agentChat.imageTaskViewer.source.referencePending")
    : t("agentChat.imageTaskViewer.source.sourcePending");
}

export function orderTaskOutputsByTaskOutputIds(
  task: Pick<ImageWorkbenchTaskView, "outputIds"> | null,
  outputs: ImageWorkbenchOutputView[],
): ImageWorkbenchOutputView[] {
  if (!task?.outputIds?.length) {
    return outputs;
  }

  const outputById = new Map(outputs.map((output) => [output.id, output]));
  const ordered = task.outputIds
    .map((outputId) => outputById.get(outputId))
    .filter((output): output is ImageWorkbenchOutputView => Boolean(output));
  const orderedIds = new Set(ordered.map((output) => output.id));

  return [
    ...ordered,
    ...outputs.filter((output) => !orderedIds.has(output.id)),
  ];
}

export function resolveSelectedStoryboardSlot(params: {
  task: ImageWorkbenchTaskView | null;
  output: ImageWorkbenchOutputView | null;
  outputIndex: number;
  t: ImageTaskViewerTranslate;
}): ImageTaskViewerStoryboardSelection | null {
  if (!params.task || params.outputIndex < 0) {
    return null;
  }

  const selectedSlotIndex =
    params.output?.slotIndex ?? params.outputIndex + 1;
  const taskSlot = params.task.storyboardSlots?.find(
    (slot: ImageStoryboardSlot) => slot.slotIndex === selectedSlotIndex,
  );

  return {
    slotIndex: selectedSlotIndex,
    label: resolveStoryboardSlotLabel({
      layoutHint: params.task.layoutHint,
      outputIndex: params.outputIndex,
      slotIndex: selectedSlotIndex,
      slotLabel: params.output?.slotLabel,
      taskSlotLabel: taskSlot?.label,
      t: params.t,
    }),
    prompt: params.output?.slotPrompt || taskSlot?.prompt || null,
  };
}
