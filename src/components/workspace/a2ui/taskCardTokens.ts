export const A2UI_TASK_CARD_TOKENS = {
  shell:
    "overflow-hidden rounded-[20px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] shadow-sm shadow-slate-950/5",
  shellEmbedded:
    "overflow-visible rounded-none border-0 bg-transparent shadow-none",
  shellCompactPadding: "p-3",
  shellDefaultPadding: "my-2 p-4",
  shellEmbeddedPadding: "p-0",
  statusBadge:
    "flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--lime-text-muted)] shadow-sm shadow-slate-950/5",
  contentPanel:
    "mt-3 rounded-[16px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)]",
  contentPanelEmbedded:
    "mt-2.5 rounded-[16px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)]",
  contentPanelCompactPadding: "p-3",
  contentPanelDefaultPadding: "p-4",
  contentPanelEmbeddedCompactPadding: "p-2.5",
  contentPanelEmbeddedDefaultPadding: "p-3",
  loadingPanel:
    "mt-3 flex items-center gap-2.5 rounded-[16px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] text-[color:var(--lime-text-muted)]",
  loadingPanelCompactPadding: "px-3 py-2.5 text-xs",
  loadingPanelDefaultPadding: "px-4 py-3 text-sm",
  workspaceOverlay:
    "pointer-events-auto w-full max-w-[760px] rounded-[24px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-5 shadow-[0_18px_54px_rgba(15,23,42,0.14)]",
  workspaceSection:
    "mt-4 rounded-[20px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4",
  workspaceDock:
    "flex w-full max-w-[560px] items-center justify-between gap-3 rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-4 py-3 text-left shadow-sm shadow-slate-950/5 transition hover:border-[color:var(--lime-surface-border-strong)] hover:bg-[color:var(--lime-surface-hover)]",
} as const;

export default A2UI_TASK_CARD_TOKENS;
