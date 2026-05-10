# Lime i18n Guide

## Overview

Lime is migrating from DOM Patch translation to key-based i18next resources.

Current fact sources:

- `locales.ts`: supported locale registry, BCP 47 normalization, and legacy patch mapping
- `loadNamespace.ts`: Vite `import.meta.glob` based loader for bundled core namespace resources
- `createI18n.ts`: i18next initialization, bundled core resources, and document `lang` / `dir` sync
- `format.ts`: locale-aware wrappers for dates, numbers, relative time, lists, and sorting
- `types.d.ts`: i18next `CustomTypeOptions` binding for migrated core namespaces
- `resources/<locale>/<namespace>.json`: current key-based translation resources
- `legacy-patch/I18nPatchProvider.tsx`: legacy compatibility layer for UI that has not migrated yet
- `legacy-patch/dom-replacer.ts`: legacy DOM text replacement implementation and runtime hit metrics
- `legacy-patch/text-map.ts` and `legacy-patch/patches/*.json`: legacy patch dictionaries
- `withI18nPatch.tsx`: root bootstrap helper that loads config and keeps current i18next + legacy patch in sync

The old `@/i18n` barrel export and dynamic template helpers have been removed.
If you need current locale utilities, import from `@/i18n/locales`.
If you need key-based UI text, use `react-i18next` with a namespace.
If you need legacy patch state during migration, import from `@/i18n/legacy-patch/I18nPatchProvider`.

## Active Architecture

```text
src/i18n/
├── resources/
│   ├── zh-CN/
│   ├── en-US/
│   ├── zh-TW/
│   ├── ja-JP/
│   └── ko-KR/
├── locales.ts
├── loadNamespace.ts
├── createI18n.ts
├── format.ts
├── types.d.ts
├── legacy-patch/
│   ├── I18nPatchProvider.tsx
│   ├── dom-replacer.ts
│   ├── text-map.ts
│   └── patches/
└── withI18nPatch.tsx
```

## Setup

```tsx
import "@/i18n/config";
import { I18nPatchProvider } from "@/i18n/legacy-patch/I18nPatchProvider";

function App() {
  return (
    <I18nPatchProvider initialLanguage="zh">
      <YourApp />
    </I18nPatchProvider>
  );
}
```

## Language Switching

```tsx
import { useI18nPatch } from "@/i18n/legacy-patch/I18nPatchProvider";
import { changeLimeLocale } from "@/i18n/createI18n";
import { UI_LOCALE_OPTIONS, toLegacyPatchLanguage } from "@/i18n/locales";

function LanguageSwitcher() {
  const { setLanguage: setLegacyPatchLanguage } = useI18nPatch();

  return (
    <select
      defaultValue="auto"
      onChange={(event) => {
        const nextLocale = event.target.value;
        void changeLimeLocale(nextLocale);
        setLegacyPatchLanguage(toLegacyPatchLanguage(nextLocale));
      }}
    >
      {UI_LOCALE_OPTIONS.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
```

## Text Rules

- New current UI text must use `useTranslation(namespace)` or `Trans`.
- `zh-CN` resources are the source locale and fallback.
- Use BCP 47 style locale values such as `zh-CN` and `en-US`; `zh` / `en` are read-compatibility values only.
- Migrated core namespaces are bound through `types.d.ts`; keep `keySeparator: false` so dotted JSON keys remain stable flat keys.
- Legacy Patch resources are allowed only for un-migrated historical UI.
- Dynamic copy with variables must use i18next interpolation instead of string concatenation.
- Rich copy with links, code, or React elements should use `Trans`.
- Dates, numbers, relative time, user-visible lists, and locale-sensitive sorting should use `format.ts` helpers instead of hard-coded units or implicit host locale.

## Adding Current Translations

1. Add the source string to `src/i18n/resources/zh-CN/<namespace>.json`.
2. Add translations to supported locale files under the same namespace.
3. Use a stable dotted key from the component.
4. Run `npm run detect-translations` to verify all locale files keep the same namespace/key structure.

Example:

```json
{
  "settings.appearance.language.title": "界面语言"
}
```

```tsx
const { t } = useTranslation("settings");
return <h3>{t("settings.appearance.language.title", "界面语言")}</h3>;
```

## Legacy Patch Additions

Do not add new current-path text to `src/i18n/legacy-patch/patches/*.json`.
Patch entries should only be used when temporarily covering old UI that has not
yet migrated.

## Legacy Patch Metrics

`legacy-patch/dom-replacer.ts` records every Patch Layer run into
`window.__I18N_METRICS__`. Use `getI18nPatchMetricsReport()` in debug or tests
to inspect:

- total Patch runs
- replaced text nodes
- matched source text segments
- average and slowest patch time
- recent run language and root kind

This is migration evidence only. New UI should still move to key-based
resources instead of increasing Patch hits.

To turn exported runtime metrics into a stable artifact:

```bash
npm run i18n:patch-report -- --input .lime/i18n/patch-metrics.json
npm run i18n:patch-report:json -- --input .lime/i18n/patch-metrics.json
npm run i18n:patch-report -- --check --max-matched-segments 0 --max-replaced-nodes 0
```

The input JSON should come from `window.__I18N_METRICS__` or
`getI18nPatchMetricsReport()`. A `no-hit` report is only a retirement candidate
signal; it does not replace current-path dependency audits.

`npm run verify:gui-smoke` passes `--i18n-patch-metrics-output` to
`smoke:knowledge-gui` by default, writes `.lime/i18n/patch-metrics.json`, and
then writes `.lime/i18n/patch-metrics-report.json`. Use
`--skip-i18n-patch-metrics` only when debugging unrelated GUI smoke failures.

## Validation

- `npm run detect-translations`: checks that every locale under `resources/` matches the `zh-CN` namespace/key structure.
- `npm run detect-translations:fix`: fills missing target locale files and keys from the `zh-CN` source value. Review the result manually before keeping it.
- `npm run detect-translations -- --verbose`: prints locale and namespace coverage details.
- `npm run i18n:patch-report`: renders exported legacy Patch runtime metrics as text.
- `npm run i18n:patch-report:json`: renders exported legacy Patch runtime metrics as JSON for CI or release evidence.
- `npm run typecheck`: validates migrated namespace keys through `src/i18n/types.d.ts`.

## Troubleshooting

- Text not translating:
  - Confirm `I18nPatchProvider` wraps the app.
  - Confirm the text exists in both patch files.
  - Confirm the text is not inside an editable container.
- Language not updating:
  - Confirm `useI18nPatch()` is used inside `I18nPatchProvider`.
  - Confirm local storage language state is changing as expected.

## Current Boundary

- Allowed current imports:
  - `@/i18n/createI18n`
  - `@/i18n/format`
  - `@/i18n/loadNamespace`
  - `@/i18n/locales`
  - `@/i18n/withI18nPatch`
- Migration-only compatibility import:
  - `@/i18n/legacy-patch/I18nPatchProvider`
- Internal legacy patch imports:
  - `@/i18n/legacy-patch/text-map`
  - `@/i18n/legacy-patch/dom-replacer`
  - `@/i18n/legacy-patch/patches/*`
- Removed legacy surface:
  - `@/i18n`
  - `src/i18n/index.ts`
  - `src/i18n/dynamic-translation.ts`
  - `@/i18n/I18nPatchProvider`
  - `@/i18n/text-map`
  - `@/i18n/patches/*`
