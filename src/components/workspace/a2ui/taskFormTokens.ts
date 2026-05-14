import { cn } from "@/lib/utils";

export const A2UI_FORM_TOKENS = {
  fieldStack: "a2ui-field-stack space-y-1.5",
  fieldLabel:
    "a2ui-field-label text-[13px] font-medium text-[color:var(--lime-text-strong)]",
  helperText: "a2ui-helper-text text-xs text-[color:var(--lime-text-muted)]",
  optionList: "a2ui-option-list flex gap-2.5",
  optionBase:
    "a2ui-choice-option group rounded-[16px] border px-3.5 py-3 text-left text-[13px] transition-all",
  optionSelected:
    "border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text-strong)] shadow-sm shadow-slate-950/5 ring-2 ring-[color:var(--lime-brand-soft)]",
  optionIdle:
    "border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] hover:border-[color:var(--lime-surface-border-strong)] hover:bg-[color:var(--lime-surface-hover)]",
  optionTitle: "a2ui-choice-option-title flex items-center gap-2 font-medium",
  optionTitleSelected: "text-[color:var(--lime-text-strong)]",
  optionTitleIdle: "text-[color:var(--lime-text)]",
  optionDescription:
    "a2ui-option-description mt-1 text-xs leading-5 text-[color:var(--lime-text-muted)]",
  radioIndicatorBase:
    "mt-0.5 inline-flex h-5 w-5 shrink-0 rounded-full border transition-colors",
  radioIndicatorSelected:
    "border-[color:var(--lime-brand)] bg-[color:var(--lime-brand)] shadow-[inset_0_0_0_4px_var(--lime-surface)]",
  radioIndicatorIdle:
    "border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface)] group-hover:border-[color:var(--lime-brand)]",
  checkboxIndicatorBase:
    "mt-0.5 inline-flex h-5 w-5 shrink-0 rounded-md border transition-colors",
  checkboxIndicatorSelected:
    "border-[color:var(--lime-brand)] bg-[color:var(--lime-brand)] shadow-[inset_0_0_0_4px_var(--lime-surface)]",
  checkboxIndicatorIdle:
    "border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface)] group-hover:border-[color:var(--lime-brand)]",
  textInput:
    "a2ui-text-input h-10 w-full rounded-[16px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-[13px] text-[color:var(--lime-text)] shadow-sm outline-none transition placeholder:text-[color:var(--lime-text-muted)] focus:border-[color:var(--lime-brand)] focus:ring-2 focus:ring-[color:var(--lime-brand-soft)]",
  textarea:
    "a2ui-textarea min-h-[84px] w-full resize-y rounded-[16px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-2.5 text-[13px] leading-5 text-[color:var(--lime-text)] shadow-sm outline-none transition placeholder:text-[color:var(--lime-text-muted)] focus:border-[color:var(--lime-brand)] focus:ring-2 focus:ring-[color:var(--lime-brand-soft)]",
  checkboxRow: "flex items-center gap-3 cursor-pointer",
  checkboxInput:
    "h-4 w-4 rounded border-[color:var(--lime-surface-border-strong)] text-[color:var(--lime-brand)] focus:ring-2 focus:ring-[color:var(--lime-brand-soft)]",
  checkboxText: "text-[13px] text-[color:var(--lime-text)]",
  sliderRow: "flex items-center justify-between",
  sliderValue: "text-[13px] text-[color:var(--lime-text-muted)]",
  sliderInput: "w-full accent-[var(--lime-brand)]",
  sliderMarks: "flex justify-between text-xs text-[color:var(--lime-text-muted)]",
} as const;

export function getA2UIChoiceOptionClasses(
  isWrap: boolean,
  isSelected: boolean,
): string {
  return cn(
    A2UI_FORM_TOKENS.optionBase,
    isWrap ? "min-w-[160px] flex-1" : "w-full",
    isSelected ? A2UI_FORM_TOKENS.optionSelected : A2UI_FORM_TOKENS.optionIdle,
  );
}

export function getA2UIChoiceTitleClasses(isSelected: boolean): string {
  return cn(
    A2UI_FORM_TOKENS.optionTitle,
    isSelected
      ? A2UI_FORM_TOKENS.optionTitleSelected
      : A2UI_FORM_TOKENS.optionTitleIdle,
  );
}

export function getA2UIChoiceIndicatorClasses(
  isMutuallyExclusive: boolean,
  isSelected: boolean,
): string {
  if (isMutuallyExclusive) {
    return cn(
      A2UI_FORM_TOKENS.radioIndicatorBase,
      isSelected
        ? A2UI_FORM_TOKENS.radioIndicatorSelected
        : A2UI_FORM_TOKENS.radioIndicatorIdle,
    );
  }

  return cn(
    A2UI_FORM_TOKENS.checkboxIndicatorBase,
    isSelected
      ? A2UI_FORM_TOKENS.checkboxIndicatorSelected
      : A2UI_FORM_TOKENS.checkboxIndicatorIdle,
  );
}

export default A2UI_FORM_TOKENS;
