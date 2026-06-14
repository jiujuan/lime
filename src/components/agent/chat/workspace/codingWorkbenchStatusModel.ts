export type CodingStatusTone = "running" | "failed" | "completed" | "default";
export type CodingStatusLabelKey =
  | "agentChat.canvasWorkbench.coding.outputs.status.blocked"
  | "agentChat.canvasWorkbench.coding.outputs.status.completed"
  | "agentChat.canvasWorkbench.coding.outputs.status.default"
  | "agentChat.canvasWorkbench.coding.outputs.status.failed"
  | "agentChat.canvasWorkbench.coding.outputs.status.running";

export function statusTone(status?: string | null): CodingStatusTone {
  if (status === "running" || status === "pending") return "running";
  if (status === "failed" || status === "canceled" || status === "blocked") {
    return "failed";
  }
  if (status === "completed") return "completed";
  return "default";
}

export function statusLabelKey(status?: string | null): CodingStatusLabelKey {
  if (status === "running" || status === "pending") {
    return "agentChat.canvasWorkbench.coding.outputs.status.running";
  }
  if (status === "failed" || status === "canceled") {
    return "agentChat.canvasWorkbench.coding.outputs.status.failed";
  }
  if (status === "blocked") {
    return "agentChat.canvasWorkbench.coding.outputs.status.blocked";
  }
  if (status === "completed") {
    return "agentChat.canvasWorkbench.coding.outputs.status.completed";
  }
  return "agentChat.canvasWorkbench.coding.outputs.status.default";
}

export function toneClassName(tone: CodingStatusTone): string {
  if (tone === "running") return "border-sky-200 bg-sky-50 text-sky-700";
  if (tone === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}
