import { cn } from "@/lib/utils";

export const A2UI_FORM_TOKENS = {
  fieldStack: "a2ui-field-stack space-y-1",
  fieldLabel:
    "a2ui-field-label text-[13px] font-semibold leading-5 text-[color:var(--lime-text-strong)]",
  helperText:
    "a2ui-helper-text text-[12px] leading-4 text-[color:var(--lime-text-muted)]",
  optionList: "a2ui-option-list flex gap-1.5",
  optionBase:
    "a2ui-choice-option group inline-flex min-h-7 rounded-full border px-2.5 py-1 text-left text-[12px] leading-4 transition-colors",
  optionSelected:
    "border-neutral-300 bg-neutral-100 text-neutral-950 shadow-none ring-0",
  optionIdle:
    "border-slate-200 bg-white text-[color:var(--lime-text-muted)] hover:border-slate-300 hover:bg-slate-50",
  optionTitle:
    "a2ui-choice-option-title flex min-w-0 items-center gap-1.5 font-normal",
  optionTitleSelected: "text-neutral-950",
  optionTitleIdle: "text-[color:var(--lime-text-muted)]",
  optionDescription:
    "a2ui-option-description mt-0.5 pl-5 text-[11px] leading-4 text-[color:var(--lime-text-muted)]",
  radioIndicatorBase:
    "mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
  radioIndicatorSelected: "border-neutral-900 bg-neutral-900",
  radioIndicatorIdle:
    "border-slate-300 bg-white group-hover:border-slate-400",
  checkboxIndicatorBase:
    "mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border text-[10px] leading-none transition-colors",
  checkboxIndicatorSelected: "border-neutral-900 bg-neutral-900 text-white",
  checkboxIndicatorIdle:
    "border-slate-300 bg-white text-transparent group-hover:border-slate-400",
  textInput:
    "a2ui-text-input h-8 w-full rounded-[10px] border border-slate-200 bg-white px-2.5 text-[12px] text-[color:var(--lime-text)] shadow-none outline-none transition placeholder:text-[color:var(--lime-text-muted)] focus:border-slate-400 focus:ring-2 focus:ring-slate-100",
  textarea:
    "a2ui-textarea min-h-[76px] w-full resize-y rounded-[10px] border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] leading-[18px] text-[color:var(--lime-text)] shadow-none outline-none transition placeholder:text-[color:var(--lime-text-muted)] focus:border-slate-400 focus:ring-2 focus:ring-slate-100",
  checkboxRow:
    "inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[12px] leading-4 text-[color:var(--lime-text-muted)] transition-colors hover:border-slate-300 hover:bg-slate-50",
  checkboxInput:
    "h-3.5 w-3.5 rounded border-slate-300 text-neutral-900 accent-neutral-900 focus:ring-2 focus:ring-slate-100",
  checkboxText: "text-[12px] text-[color:var(--lime-text-muted)]",
  sliderRow: "flex items-center justify-between",
  sliderValue: "text-[12px] text-[color:var(--lime-text-muted)]",
  sliderInput: "h-5 w-full accent-neutral-900",
  sliderMarks:
    "flex justify-between text-[11px] leading-4 text-[color:var(--lime-text-muted)]",
} as const;

export function getA2UIChoiceOptionClasses(
  isWrap: boolean,
  isSelected: boolean,
): string {
  return cn(
    A2UI_FORM_TOKENS.optionBase,
    isWrap ? "w-auto min-w-[92px] flex-none" : "w-full",
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
