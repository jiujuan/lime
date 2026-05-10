import { getLimeI18n } from "./createI18n";
import { normalizeLocale, type SupportedLocale } from "./locales";

export type LocaleScopedOptions = {
  locale?: string | null;
};

export type DateFormatOptions = Intl.DateTimeFormatOptions & LocaleScopedOptions;
export type NumberFormatOptions = Intl.NumberFormatOptions & LocaleScopedOptions;
export type RelativeTimeFormatOptions = Intl.RelativeTimeFormatOptions &
  LocaleScopedOptions;
export type LocaleCompareOptions = Intl.CollatorOptions & LocaleScopedOptions;

export type ListFormatOptions = LocaleScopedOptions & {
  localeMatcher?: "best fit" | "lookup";
  style?: "long" | "narrow" | "short";
  type?: "conjunction" | "disjunction" | "unit";
};

type ListFormatter = {
  format(values: string[]): string;
};

type IntlWithListFormat = typeof Intl & {
  ListFormat?: new (
    locales?: string | string[],
    options?: Omit<ListFormatOptions, "locale">,
  ) => ListFormatter;
};

function splitLocaleOption<TOptions extends LocaleScopedOptions>(
  options?: TOptions,
): [SupportedLocale, Omit<TOptions, "locale">] {
  const { locale, ...intlOptions } = options ?? ({} as TOptions);
  const currentLocale = locale || getLimeI18n().language;
  return [normalizeLocale(currentLocale), intlOptions];
}

function toValidDate(value: Date | number | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveFormatLocale(locale?: string | null): SupportedLocale {
  return normalizeLocale(locale || getLimeI18n().language);
}

export function formatDate(
  value: Date | number | string,
  options?: DateFormatOptions,
): string {
  const date = toValidDate(value);
  if (!date) {
    return "";
  }

  const [locale, intlOptions] = splitLocaleOption(options);
  return new Intl.DateTimeFormat(locale, intlOptions).format(date);
}

export function formatNumber(
  value: number | bigint,
  options?: NumberFormatOptions,
): string {
  const [locale, intlOptions] = splitLocaleOption(options);
  return new Intl.NumberFormat(locale, intlOptions).format(value);
}

export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: RelativeTimeFormatOptions,
): string {
  const [locale, intlOptions] = splitLocaleOption(options);
  return new Intl.RelativeTimeFormat(locale, intlOptions).format(value, unit);
}

export function formatList(
  values: Iterable<string>,
  options?: ListFormatOptions,
): string {
  const items = [...values];
  const [locale, intlOptions] = splitLocaleOption(options);
  const listFormat = (Intl as IntlWithListFormat).ListFormat;

  if (typeof listFormat === "function") {
    return new listFormat(locale, intlOptions).format(items);
  }

  return items.join(", ");
}

export function localeCompare(
  left: string,
  right: string,
  options?: LocaleCompareOptions,
): number {
  const [locale, intlOptions] = splitLocaleOption(options);
  return left.localeCompare(right, locale, intlOptions);
}
