import { useMemo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { LoaderCircle, Sparkles, X } from "lucide-react";
import { openResourceManager } from "@/features/resource-manager";
import { cn } from "@/lib/utils";
import { RenderableTaskImage } from "./RenderableTaskImage";
import type { ImageTaskViewerProps } from "./imageWorkbenchTypes";
import type { ImageRuntimeContractSnapshot } from "../types";
import { buildLimeCorePolicyEvaluationMetaItem } from "../workspace/mediaTaskPolicyEvaluation";
import { buildImageTaskResourceSourceContext } from "../workspace/imageWorkbenchResourceManager";

const IMAGE_TASK_PRIMARY_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center rounded-full border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-4 py-2 text-sm font-medium text-white shadow-sm shadow-emerald-950/15 transition hover:opacity-95";

type AgentTranslate = TFunction<"agent", undefined>;

function resolveModeEyebrow(
  mode: string | undefined,
  t: AgentTranslate,
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

function resolveSourceLabel(
  mode: string | undefined,
  t: AgentTranslate,
): string {
  return (mode || "").trim().toLowerCase() === "variation"
    ? t("agentChat.imageTaskViewer.source.reference")
    : t("agentChat.imageTaskViewer.source.source");
}

function resolveFollowUpLabel(
  mode: string | undefined,
  t: AgentTranslate,
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

function resolveLayoutLabel(
  layoutHint: string | null | undefined,
  t: AgentTranslate,
): string | null {
  return layoutHint === "storyboard_3x3"
    ? t("agentChat.imageTaskViewer.layout.storyboard3x3")
    : null;
}

function resolveOutputGridClassName(params: {
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

function resolveOutputTileAspectClass(layoutHint?: string | null): string {
  return layoutHint === "storyboard_3x3" ? "aspect-square" : "aspect-[4/3]";
}

function resolveSelectedOutputLabel(params: {
  selectedIndex: number;
  outputCount: number;
  layoutHint?: string | null;
  t: AgentTranslate;
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

function resolveOutputDisplayIndex(
  outputIndex: number,
  slotIndex?: number | null,
): number {
  return slotIndex && slotIndex > 0 ? slotIndex : outputIndex + 1;
}

function resolveStoryboardSlotLabel(params: {
  layoutHint?: string | null;
  outputIndex: number;
  slotIndex?: number | null;
  slotLabel?: string | null;
  taskSlotLabel?: string | null;
  t: AgentTranslate;
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

function buildFollowUpCommand(params: {
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

function resolveStatusLabel(
  status: string | undefined,
  mode: string | undefined,
  t: AgentTranslate,
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

function resolveStatusTone(status?: string): string {
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

function resolveRuntimeContractBadge(
  runtimeContract: ImageRuntimeContractSnapshot | null | undefined,
  t: AgentTranslate,
): { label: string; tone: string } | null {
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

function resolveRuntimeContractRegistryLabel(
  runtimeContract: ImageRuntimeContractSnapshot | null | undefined,
  t: AgentTranslate,
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

function resolveRuntimeContractPolicyLabel(
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

function resolveEmptyStateDescription(
  status: string | undefined,
  _failureMessage: string | undefined,
  mode: string | undefined,
  t: AgentTranslate,
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

function resolveImageUnavailableTitle(
  status: string | undefined,
  mode: string | undefined,
  t: AgentTranslate,
): string {
  switch ((status || "").trim().toLowerCase()) {
    case "complete":
    case "partial":
      return t("agentChat.imageTaskViewer.unavailable.title");
    default:
      return resolveStatusLabel(status, mode, t);
  }
}

function resolveImageUnavailableDescription(
  mode: string | undefined,
  t: AgentTranslate,
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

function resolveSourcePlaceholderLabel(
  mode: string | undefined,
  reason: "empty" | "error",
  t: AgentTranslate,
) {
  if (reason === "error") {
    return (mode || "").trim().toLowerCase() === "variation"
      ? t("agentChat.imageTaskViewer.source.referenceUnavailable")
      : t("agentChat.imageTaskViewer.source.sourceUnavailable");
  }

  return (mode || "").trim().toLowerCase() === "variation"
    ? t("agentChat.imageTaskViewer.source.referencePending")
    : t("agentChat.imageTaskViewer.source.sourcePending");
}

function orderTaskOutputsByTaskOutputIds(
  task: ImageTaskViewerProps["tasks"][number] | null,
  outputs: ImageTaskViewerProps["outputs"],
): ImageTaskViewerProps["outputs"] {
  if (!task?.outputIds?.length) {
    return outputs;
  }

  const outputById = new Map(outputs.map((output) => [output.id, output]));
  const ordered = task.outputIds
    .map((outputId) => outputById.get(outputId))
    .filter((output): output is ImageTaskViewerProps["outputs"][number] =>
      Boolean(output),
    );
  const orderedIds = new Set(ordered.map((output) => output.id));

  return [
    ...ordered,
    ...outputs.filter((output) => !orderedIds.has(output.id)),
  ];
}

export function ImageTaskViewer({
  tasks,
  outputs,
  selectedTaskId,
  selectedOutputId,
  sourceProjectId,
  sourceContentId,
  sourceThreadId,
  savingToResource,
  onSaveSelectedToLibrary,
  applySelectedOutputLabel,
  onApplySelectedOutput,
  onSeedFollowUpCommand,
  onSelectOutput,
  onClose,
}: ImageTaskViewerProps) {
  const { t } = useTranslation("agent");
  const selectedTaskById = selectedTaskId
    ? (tasks.find((item) => item.id === selectedTaskId) ?? null)
    : null;
  const selectedOutputById = selectedOutputId
    ? (outputs.find((item) => item.id === selectedOutputId) ?? null)
    : null;
  const selectedOutput =
    selectedOutputById &&
    (!selectedTaskById || selectedOutputById.taskId === selectedTaskById.id)
      ? selectedOutputById
      : selectedTaskById
        ? (outputs.find((item) => item.taskId === selectedTaskById.id) ?? null)
        : (selectedOutputById ?? outputs[0] ?? null);
  const selectedTask =
    selectedTaskById ??
    (selectedOutput
      ? tasks.find((item) => item.id === selectedOutput.taskId)
      : null) ??
    tasks[0] ??
    null;
  const selectedTaskOutputs = selectedTask
    ? orderTaskOutputsByTaskOutputIds(
        selectedTask,
        outputs.filter((item) => item.taskId === selectedTask.id),
      )
    : outputs;
  const expectedOutputCount = Math.max(
    selectedTask?.expectedCount ?? 0,
    selectedTaskOutputs.length,
  );
  const outputGridSlots = Array.from(
    { length: expectedOutputCount },
    (_, index) => selectedTaskOutputs[index] ?? null,
  );
  const selectedOutputIndex = selectedOutput
    ? selectedTaskOutputs.findIndex((item) => item.id === selectedOutput.id)
    : -1;
  const selectedStoryboardSlot = useMemo(() => {
    if (!selectedTask || selectedOutputIndex < 0) {
      return null;
    }

    const selectedSlotIndex =
      selectedOutput?.slotIndex ?? selectedOutputIndex + 1;
    const taskSlot = selectedTask.storyboardSlots?.find(
      (slot) => slot.slotIndex === selectedSlotIndex,
    );

    return {
      slotIndex: selectedSlotIndex,
      label: resolveStoryboardSlotLabel({
        layoutHint: selectedTask.layoutHint,
        outputIndex: selectedOutputIndex,
        slotIndex: selectedSlotIndex,
        slotLabel: selectedOutput?.slotLabel,
        taskSlotLabel: taskSlot?.label,
        t,
      }),
      prompt: selectedOutput?.slotPrompt || taskSlot?.prompt || null,
    };
  }, [
    selectedOutput?.slotIndex,
    selectedOutput?.slotLabel,
    selectedOutput?.slotPrompt,
    selectedOutputIndex,
    selectedTask,
    t,
  ]);
  const statusLabel = resolveStatusLabel(
    selectedTask?.status,
    selectedTask?.mode,
    t,
  );
  const runtimeContractBadge = resolveRuntimeContractBadge(
    selectedTask?.runtimeContract,
    t,
  );
  const runtimeContractRegistryLabel = resolveRuntimeContractRegistryLabel(
    selectedTask?.runtimeContract,
    t,
  );
  const runtimeContractPolicyLabel = resolveRuntimeContractPolicyLabel(
    selectedTask?.runtimeContract,
  );
  const layoutLabel = resolveLayoutLabel(selectedTask?.layoutHint, t);
  const selectedOutputLabel = resolveSelectedOutputLabel({
    selectedIndex: selectedOutputIndex,
    outputCount: expectedOutputCount,
    layoutHint: selectedTask?.layoutHint,
    t,
  });
  const prompt =
    selectedOutput?.prompt?.trim() ||
    selectedTask?.prompt?.trim() ||
    t("agentChat.imageTaskViewer.promptFallback");
  const sourceOutputId =
    selectedTask?.targetOutputId ?? selectedOutput?.parentOutputId ?? null;
  const sourceOutput = sourceOutputId
    ? (outputs.find((item) => item.id === sourceOutputId) ?? null)
    : null;
  const sourceImageUrl =
    sourceOutput?.url?.trim() || selectedTask?.sourceImageUrl?.trim() || null;
  const sourceImagePrompt =
    selectedTask?.sourceImagePrompt?.trim() ||
    sourceOutput?.prompt?.trim() ||
    null;
  const sourceImageRef =
    selectedTask?.sourceImageRef?.trim() || sourceOutput?.refId?.trim() || null;
  const sourceImageCount =
    selectedTask?.sourceImageCount ?? (sourceOutput ? 1 : undefined);
  const showSourcePanel = Boolean(
    selectedTask?.mode === "edit" ||
    selectedTask?.mode === "variation" ||
    sourceImageUrl ||
    sourceImagePrompt ||
    sourceImageRef ||
    sourceImageCount,
  );
  const sourceSummary = sourceImagePrompt
    ? sourceImagePrompt
    : sourceImageRef
      ? t("agentChat.imageTaskViewer.source.refSummary", {
          ref: sourceImageRef,
        })
      : selectedTask?.mode === "variation"
        ? t("agentChat.imageTaskViewer.source.variationSummary")
        : t("agentChat.imageTaskViewer.source.editSummary");
  const followUpCommand = buildFollowUpCommand({
    mode: selectedTask?.mode,
    outputRef: selectedOutput?.refId,
    prompt: selectedTask?.prompt,
  });
  const canContinueEdit = Boolean(followUpCommand && onSeedFollowUpCommand);
  const handleOpenSelectedImagePreview = () => {
    if (!selectedOutput) {
      return;
    }

    void openResourceManager({
      sourceLabel: resolveModeEyebrow(selectedTask?.mode, t),
      sourceContext: buildImageTaskResourceSourceContext({
        taskId: selectedTask?.id ?? selectedOutput.taskId,
        outputId: selectedOutput.id,
        projectId: sourceProjectId,
        contentId: sourceContentId,
        threadId: sourceThreadId,
        sourcePage: "image-task-viewer",
      }),
      initialIndex: selectedOutputIndex >= 0 ? selectedOutputIndex : 0,
      items: selectedTaskOutputs.map((output, index) => {
        const taskSlotLabel = selectedTask?.storyboardSlots?.find(
          (slot) =>
            slot.slotIndex ===
            resolveOutputDisplayIndex(index, output.slotIndex),
        )?.label;
        const slotLabel = resolveStoryboardSlotLabel({
          layoutHint: selectedTask?.layoutHint,
          outputIndex: index,
          slotIndex: output.slotIndex,
          slotLabel: output.slotLabel,
          taskSlotLabel,
          t,
        });

        return {
          id: output.id,
          kind: "image" as const,
          src: output.url,
          title: slotLabel || output.prompt || prompt,
          description: output.slotPrompt || output.prompt || prompt,
          metadata: {
            prompt: output.slotPrompt || output.prompt || prompt,
            slotLabel,
            size: output.size,
            providerName: output.providerName,
            modelName: output.modelName,
          },
          sourceContext: buildImageTaskResourceSourceContext({
            taskId: output.taskId || selectedTask?.id,
            outputId: output.id,
            projectId: sourceProjectId,
            contentId: sourceContentId,
            threadId: sourceThreadId,
            sourcePage: "image-task-viewer",
          }),
        };
      }),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
      <div className="border-b border-slate-200 px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {resolveModeEyebrow(selectedTask?.mode, t)}
            </div>
            <div className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-900">
              {prompt}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                resolveStatusTone(selectedTask?.status),
              )}
            >
              {selectedTask?.status === "running" ||
              selectedTask?.status === "routing" ||
              selectedTask?.status === "queued" ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {statusLabel}
            </span>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
                aria-label={t("agentChat.imageTaskViewer.action.close")}
                data-testid="image-task-viewer-close"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5">
        <div
          data-testid="image-task-viewer-stage"
          className="flex-1 overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50"
        >
          <div className="h-full w-full p-4 pt-5">
            {selectedOutput ? (
              <RenderableTaskImage
                src={selectedOutput.url}
                alt={
                  selectedOutput.prompt ||
                  t("agentChat.imageTaskViewer.media.resultAlt")
                }
                className="h-full w-full object-contain"
                renderImage={(imageProps) => (
                  <button
                    type="button"
                    className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-[18px] border border-slate-200/80 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_42%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.98))] p-4"
                    onClick={handleOpenSelectedImagePreview}
                    data-testid="image-task-viewer-open-image"
                  >
                    <img
                      {...imageProps}
                      className={cn(
                        "h-full w-full rounded-[14px] object-contain",
                        imageProps.className,
                      )}
                    />
                    <span className="pointer-events-none absolute inset-x-4 bottom-4 rounded-[14px] bg-slate-950/66 px-3 py-2 text-left text-xs leading-5 text-white backdrop-blur-[1px]">
                      <span className="font-medium">
                        {selectedStoryboardSlot?.label ||
                          t("agentChat.imageTaskViewer.media.openSingle")}
                      </span>
                      {selectedStoryboardSlot?.prompt ? (
                        <span className="mt-0.5 line-clamp-2 block text-white/80">
                          {selectedStoryboardSlot.prompt}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )}
                renderFallback={(reason) => (
                  <div className="flex h-full min-h-[320px] items-center justify-center px-6 text-center">
                    <div className="max-w-sm space-y-3">
                      {reason === "empty" &&
                      (selectedTask?.status === "running" ||
                        selectedTask?.status === "routing" ||
                        selectedTask?.status === "queued") ? (
                        <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-sky-500" />
                      ) : (
                        <Sparkles className="mx-auto h-8 w-8 text-slate-400" />
                      )}
                      <div className="text-sm font-semibold text-slate-900">
                        {reason === "error"
                          ? resolveImageUnavailableTitle(
                              selectedTask?.status,
                              selectedTask?.mode,
                              t,
                            )
                          : statusLabel}
                      </div>
                      <div className="text-sm leading-6 text-slate-500">
                        {reason === "error"
                          ? resolveImageUnavailableDescription(
                              selectedTask?.mode,
                              t,
                            )
                          : resolveEmptyStateDescription(
                              selectedTask?.status,
                              selectedTask?.failureMessage,
                              selectedTask?.mode,
                              t,
                            )}
                      </div>
                    </div>
                  </div>
                )}
              />
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center px-6 text-center">
                <div className="max-w-sm space-y-3">
                  {selectedTask?.status === "running" ||
                  selectedTask?.status === "routing" ||
                  selectedTask?.status === "queued" ? (
                    <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-sky-500" />
                  ) : (
                    <Sparkles className="mx-auto h-8 w-8 text-slate-400" />
                  )}
                  <div className="text-sm font-semibold text-slate-900">
                    {statusLabel}
                  </div>
                  <div className="text-sm leading-6 text-slate-500">
                    {resolveEmptyStateDescription(
                      selectedTask?.status,
                      selectedTask?.failureMessage,
                      selectedTask?.mode,
                      t,
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {showSourcePanel ? (
          <div
            data-testid="image-task-viewer-source"
            className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 p-4"
          >
            <div className="text-[11px] font-medium text-slate-500">
              {resolveSourceLabel(selectedTask?.mode, t)}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-white">
                <RenderableTaskImage
                  src={sourceImageUrl}
                  data-testid="image-task-viewer-source-image"
                  alt={
                    sourceImagePrompt ||
                    resolveSourceLabel(selectedTask?.mode, t)
                  }
                  className="h-full w-full object-cover"
                  renderFallback={(reason) => (
                    <span className="px-2 text-center text-[11px] font-medium text-slate-400">
                      {resolveSourcePlaceholderLabel(
                        selectedTask?.mode,
                        reason,
                        t,
                      )}
                    </span>
                  )}
                />
              </div>
              <div className="min-w-0">
                <div className="line-clamp-2 text-sm font-medium leading-6 text-slate-800">
                  {sourceSummary}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  {sourceImageRef ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                      {sourceImageRef}
                    </span>
                  ) : null}
                  {sourceImageCount && sourceImageCount > 0 ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                      {t("agentChat.imageTaskViewer.source.imageCount", {
                        count: sourceImageCount,
                      })}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {runtimeContractBadge ? (
            <span
              data-testid="image-task-viewer-runtime-contract"
              className={cn(
                "rounded-full border px-2.5 py-1 font-medium",
                runtimeContractBadge.tone,
              )}
            >
              {runtimeContractBadge.label}
            </span>
          ) : null}
          {runtimeContractRegistryLabel ? (
            <span
              data-testid="image-task-viewer-runtime-contract-registry"
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600"
            >
              {runtimeContractRegistryLabel}
            </span>
          ) : null}
          {runtimeContractPolicyLabel ? (
            <span
              data-testid="image-task-viewer-runtime-contract-policy"
              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-800"
            >
              {runtimeContractPolicyLabel}
            </span>
          ) : null}
          {layoutLabel ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-medium text-sky-700">
              {layoutLabel}
            </span>
          ) : null}
          {selectedOutputLabel ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              {selectedOutputLabel}
            </span>
          ) : null}
          {selectedStoryboardSlot?.label ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-medium text-violet-700">
              {selectedStoryboardSlot.label}
            </span>
          ) : null}
          {selectedOutput?.providerName ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              {selectedOutput.providerName}
            </span>
          ) : null}
          {selectedOutput?.modelName ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              {selectedOutput.modelName}
            </span>
          ) : null}
          {selectedOutput?.size ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              {selectedOutput.size}
            </span>
          ) : null}
          {expectedOutputCount > 0 ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              {expectedOutputCount > selectedTaskOutputs.length
                ? t("agentChat.imageTaskViewer.resultCount.partial", {
                    current: selectedTaskOutputs.length,
                    total: expectedOutputCount,
                  })
                : t("agentChat.imageTaskViewer.resultCount.complete", {
                    count: selectedTaskOutputs.length,
                  })}
            </span>
          ) : null}
        </div>

        {canContinueEdit ||
        (selectedOutput && onSaveSelectedToLibrary) ||
        (selectedOutput && onApplySelectedOutput) ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canContinueEdit ? (
              <button
                type="button"
                data-testid="image-task-viewer-action-follow-up"
                onClick={() => {
                  if (!followUpCommand) {
                    return;
                  }
                  onSeedFollowUpCommand?.(followUpCommand);
                }}
                className={IMAGE_TASK_PRIMARY_BUTTON_CLASSNAME}
              >
                {resolveFollowUpLabel(selectedTask?.mode, t)}
              </button>
            ) : null}
            {selectedOutput && onSaveSelectedToLibrary ? (
              <button
                type="button"
                data-testid="image-task-viewer-action-save"
                onClick={() => onSaveSelectedToLibrary()}
                disabled={Boolean(
                  selectedOutput?.resourceSaved || savingToResource,
                )}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                  selectedOutput?.resourceSaved
                    ? "cursor-default border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900",
                  savingToResource && !selectedOutput?.resourceSaved
                    ? "cursor-wait"
                    : null,
                )}
              >
                {savingToResource && !selectedOutput?.resourceSaved ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                {selectedOutput?.resourceSaved
                  ? t("agentChat.imageTaskViewer.action.savedToLibrary")
                  : t("agentChat.imageTaskViewer.action.saveToLibrary")}
              </button>
            ) : null}
            {selectedOutput &&
            onApplySelectedOutput &&
            applySelectedOutputLabel ? (
              <button
                type="button"
                data-testid="image-task-viewer-action-apply"
                onClick={() => onApplySelectedOutput()}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
              >
                {applySelectedOutputLabel}
              </button>
            ) : null}
          </div>
        ) : null}

        {expectedOutputCount > 1 ? (
          <div
            data-testid="image-task-viewer-output-grid"
            className={cn(
              "mt-4 grid max-h-[min(34vh,280px)] gap-3 overflow-y-auto pb-1 pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]",
              resolveOutputGridClassName({
                layoutHint: selectedTask?.layoutHint,
                outputCount: expectedOutputCount,
              }),
            )}
          >
            {outputGridSlots.map((output, index) => {
              const active = output?.id === selectedOutput?.id;
              const taskSlotLabel = selectedTask?.storyboardSlots?.find(
                (slot) =>
                  slot.slotIndex ===
                  resolveOutputDisplayIndex(index, output?.slotIndex),
              )?.label;
              const storyboardSlotLabel = resolveStoryboardSlotLabel({
                layoutHint: selectedTask?.layoutHint,
                outputIndex: index,
                slotIndex: output?.slotIndex,
                slotLabel: output?.slotLabel,
                taskSlotLabel,
                t,
              });
              return (
                <button
                  key={output?.id || `image-output-placeholder-${index + 1}`}
                  type="button"
                  disabled={!output}
                  onClick={() => {
                    if (!output) {
                      return;
                    }
                    onSelectOutput(output.id);
                  }}
                  className={cn(
                    "group overflow-hidden rounded-2xl border bg-white transition",
                    active
                      ? "border-sky-300 shadow-sm shadow-sky-500/10"
                      : output
                        ? "border-slate-200 hover:border-slate-300"
                        : "cursor-default border-dashed border-slate-200 bg-slate-50/80",
                  )}
                >
                  <div className="relative">
                    {output ? (
                      <RenderableTaskImage
                        src={output.url}
                        alt={
                          output.prompt ||
                          t("agentChat.imageTaskViewer.media.thumbAlt")
                        }
                        className={cn(
                          "w-full object-cover",
                          resolveOutputTileAspectClass(
                            selectedTask?.layoutHint,
                          ),
                        )}
                        renderFallback={() => (
                          <div
                            className={cn(
                              "flex w-full items-center justify-center bg-slate-50 px-3 text-center text-[11px] font-medium text-slate-400",
                              resolveOutputTileAspectClass(
                                selectedTask?.layoutHint,
                              ),
                            )}
                          >
                            {t("agentChat.imageTaskViewer.media.previewFailed")}
                          </div>
                        )}
                      />
                    ) : (
                      <div
                        className={cn(
                          "flex w-full flex-col items-center justify-center gap-2 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.98))] px-3 text-center",
                          resolveOutputTileAspectClass(
                            selectedTask?.layoutHint,
                          ),
                        )}
                      >
                        {selectedTask?.status === "queued" ||
                        selectedTask?.status === "routing" ||
                        selectedTask?.status === "running" ? (
                          <LoaderCircle className="h-5 w-5 animate-spin text-sky-500" />
                        ) : (
                          <Sparkles className="h-5 w-5 text-slate-300" />
                        )}
                        <span className="text-[11px] font-medium text-slate-400">
                          {selectedTask?.status === "error"
                            ? t("agentChat.imageTaskViewer.slot.failed")
                            : selectedTask?.status === "cancelled"
                              ? t("agentChat.imageTaskViewer.slot.cancelled")
                              : t("agentChat.imageTaskViewer.slot.pending")}
                        </span>
                      </div>
                    )}
                    {expectedOutputCount > 1 ? (
                      <span
                        className={cn(
                          "absolute left-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold shadow-sm shadow-slate-950/5",
                          layoutLabel || active
                            ? "border-slate-200/80 bg-white/95 text-slate-700"
                            : "border-slate-200 bg-slate-50/95 text-slate-600",
                        )}
                      >
                        {resolveOutputDisplayIndex(index, output?.slotIndex)}
                      </span>
                    ) : null}
                    {storyboardSlotLabel ? (
                      <span className="pointer-events-none absolute inset-x-2 bottom-2 line-clamp-2 rounded-[12px] bg-slate-950/66 px-2 py-1 text-left text-[10px] font-medium leading-4 text-white backdrop-blur-[1px]">
                        {storyboardSlotLabel}
                      </span>
                    ) : null}
                    {active && output ? (
                      <span className="absolute right-2 top-2 rounded-full bg-slate-950/68 px-2.5 py-1 text-[11px] font-medium text-white">
                        {t("agentChat.imageTaskViewer.selected.current")}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
