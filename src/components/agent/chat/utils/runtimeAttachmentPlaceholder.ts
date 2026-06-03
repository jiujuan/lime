export type RuntimeAttachmentPlaceholderKind = "image";

export interface RuntimeAttachmentPlaceholderMatch {
  kind: RuntimeAttachmentPlaceholderKind;
  index?: string;
}

interface LegacyRuntimeAttachmentPlaceholderSpec {
  kind: RuntimeAttachmentPlaceholderKind;
  bracketGlobal: RegExp;
  bareGlobal: RegExp;
  bracketTest: RegExp;
  bareTest: RegExp;
  exact: RegExp;
}

const LEGACY_RUNTIME_ATTACHMENT_PLACEHOLDERS: LegacyRuntimeAttachmentPlaceholderSpec[] =
  [
    {
      kind: "image",
      bracketGlobal: /\[\s*Image\s*#(\d+)\s*\]/gi,
      bareGlobal: /(^|[\s,，;；])Image\s*#(\d+)(?=$|[\s,，;；])/gi,
      bracketTest: /\[\s*Image\s*#\d+\s*\]/i,
      bareTest: /(^|[\s,，;；])Image\s*#\d+(?=$|[\s,，;；])/i,
      exact: /^\[?\s*Image\s*#(\d+)\s*\]?$/i,
    },
  ];

function normalizeRuntimeAttachmentTaskLabel(
  match: RuntimeAttachmentPlaceholderMatch,
): string {
  if (match.kind === "image") {
    return match.index ? `图片任务 ${match.index}` : "图片任务";
  }
  return match.index ? `附件任务 ${match.index}` : "附件任务";
}

function resolvePlaceholderReplacement(
  replacement:
    | string
    | ((match: RuntimeAttachmentPlaceholderMatch) => string),
  match: RuntimeAttachmentPlaceholderMatch,
): string {
  return typeof replacement === "function" ? replacement(match) : replacement;
}

export function replaceRuntimeAttachmentPlaceholders(
  text: string,
  replacement:
    | string
    | ((match: RuntimeAttachmentPlaceholderMatch) => string),
): string {
  return LEGACY_RUNTIME_ATTACHMENT_PLACEHOLDERS.reduce((current, spec) => {
    const withBracketPlaceholders = current.replace(
      spec.bracketGlobal,
      (_match, index: string) =>
        ` ${resolvePlaceholderReplacement(replacement, {
          kind: spec.kind,
          index: index?.trim(),
        })} `,
    );

    return withBracketPlaceholders.replace(
      spec.bareGlobal,
      (_match, prefix: string, index: string) =>
        `${prefix}${resolvePlaceholderReplacement(replacement, {
          kind: spec.kind,
          index: index?.trim(),
        })}`,
    );
  }, text);
}

export function containsRuntimeAttachmentPlaceholder(text: string): boolean {
  return LEGACY_RUNTIME_ATTACHMENT_PLACEHOLDERS.some(
    (spec) => spec.bracketTest.test(text) || spec.bareTest.test(text),
  );
}

export function isOnlyRuntimeAttachmentPlaceholderText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  const residue = replaceRuntimeAttachmentPlaceholders(normalized, "")
    .replace(/[\s,，;；]+/g, "")
    .trim();
  return residue.length === 0;
}

export function resolveRuntimeAttachmentTaskDisplayName(
  value: string | null | undefined,
  resolveLabel: (
    match: RuntimeAttachmentPlaceholderMatch,
  ) => string = normalizeRuntimeAttachmentTaskLabel,
): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  for (const spec of LEGACY_RUNTIME_ATTACHMENT_PLACEHOLDERS) {
    const match = normalized.match(spec.exact);
    if (match) {
      return resolveLabel({
        kind: spec.kind,
        index: match[1]?.trim(),
      });
    }
  }

  return normalized;
}
