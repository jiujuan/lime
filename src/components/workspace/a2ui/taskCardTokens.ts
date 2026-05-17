export const A2UI_TASK_CARD_TOKENS = {
  shell:
    "overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-none",
  shellEmbedded:
    "overflow-visible rounded-none border-0 bg-transparent shadow-none",
  shellCompactPadding: "p-3",
  shellDefaultPadding: "my-2 p-3.5",
  shellEmbeddedPadding: "p-0",
  statusBadge:
    "flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium leading-4 text-[color:var(--lime-text-muted)] shadow-none",
  contentPanel:
    "mt-2.5 rounded-[12px] border border-slate-200 bg-white",
  contentPanelEmbedded:
    "mt-0 rounded-none border-0 bg-transparent",
  contentPanelCompactPadding: "p-2.5",
  contentPanelDefaultPadding: "p-3",
  contentPanelEmbeddedCompactPadding: "p-0",
  contentPanelEmbeddedDefaultPadding: "p-0",
  loadingPanel:
    "mt-2 flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white text-[color:var(--lime-text-muted)]",
  loadingPanelCompactPadding: "px-2.5 py-2 text-xs",
  loadingPanelDefaultPadding: "px-3 py-2.5 text-sm",
  workspaceOverlay:
    "pointer-events-auto w-full max-w-[460px] rounded-[12px] border border-slate-200 bg-white p-3 shadow-none",
  workspaceSection:
    "mt-3 rounded-[12px] border border-slate-200 bg-white p-3",
  workspaceDock:
    "flex w-full max-w-[460px] items-center justify-between gap-2 rounded-[12px] border border-slate-200 bg-white px-3 py-2.5 text-left shadow-none transition hover:border-slate-300 hover:bg-slate-50",
} as const;

export default A2UI_TASK_CARD_TOKENS;
