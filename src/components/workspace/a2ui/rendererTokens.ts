export const A2UI_RENDERER_TOKENS = {
  container: "a2ui-container space-y-3",
  thinkingText: "text-[13px] text-[color:var(--lime-text-muted)] italic",
  errorText: "text-rose-600",
  submitRow: "flex justify-end",
  submitButton:
    "inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-brand)] px-4 text-[13px] font-medium text-white shadow-sm shadow-slate-950/10 transition-colors hover:opacity-95 disabled:cursor-not-allowed disabled:border-[color:var(--lime-surface-border)] disabled:bg-[color:var(--lime-surface-muted)] disabled:text-[color:var(--lime-text-muted)] disabled:hover:bg-[color:var(--lime-surface-muted)]",
  textVariants: {
    h1: "text-xl font-bold text-[color:var(--lime-text-strong)]",
    h2: "text-lg font-semibold text-[color:var(--lime-text-strong)]",
    h3: "text-base font-semibold text-[color:var(--lime-text-strong)]",
    h4: "text-sm font-medium text-[color:var(--lime-text-strong)]",
    h5: "text-[13px] font-medium text-[color:var(--lime-text-strong)]",
    body: "text-[13px] text-[color:var(--lime-text)]",
    caption: "text-xs text-[color:var(--lime-text-muted)]",
  },
  imageBase:
    "block border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] object-cover",
  imagePlaceholder:
    "flex items-center justify-center border border-dashed border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface-soft)] text-xs text-[color:var(--lime-text-muted)]",
  imageFit: {
    contain: "object-contain",
    cover: "object-cover",
    fill: "object-fill",
    none: "object-none",
    "scale-down": "object-scale-down",
  },
  imageVariants: {
    default: "w-full min-h-[140px] rounded-[20px]",
    icon: "h-12 w-12 rounded-2xl p-2",
    avatar: "h-12 w-12 rounded-full",
    smallFeature: "w-full h-28 rounded-[20px]",
    mediumFeature: "w-full h-40 rounded-[22px]",
    largeFeature: "w-full h-56 rounded-[24px]",
    header: "w-full h-48 rounded-[24px]",
  },
  iconShell:
    "inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text-muted)] shadow-sm",
  iconFallback: "text-[10px] font-medium uppercase tracking-[0.08em]",
} as const;

export default A2UI_RENDERER_TOKENS;
