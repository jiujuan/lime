const MARKDOWN_TOKEN_RE = /[*_`~]+/g;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const MIN_COMPACT_EQUIVALENCE_LENGTH = 24;

export function normalizeComparableContentText(text: string): string {
  return text
    .trim()
    .replace(HTML_COMMENT_RE, " ")
    .replace(MARKDOWN_TOKEN_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompactComparableContentText(text: string): string {
  return normalizeComparableContentText(text).replace(/\s+/g, "");
}

function hasEnoughCompactSignal(left: string, right: string): boolean {
  return (
    left.length >= MIN_COMPACT_EQUIVALENCE_LENGTH &&
    right.length >= MIN_COMPACT_EQUIVALENCE_LENGTH
  );
}

export function areComparableContentTextsEqual(
  left: string,
  right: string,
): boolean {
  const normalizedLeft = normalizeComparableContentText(left);
  const normalizedRight = normalizeComparableContentText(right);
  if (normalizedLeft && normalizedLeft === normalizedRight) {
    return true;
  }

  const compactLeft = normalizeCompactComparableContentText(left);
  const compactRight = normalizeCompactComparableContentText(right);
  return Boolean(
    compactLeft &&
      compactLeft === compactRight &&
      hasEnoughCompactSignal(compactLeft, compactRight),
  );
}

export function isComparableContentTextPrefix(
  prefix: string,
  text: string,
): boolean {
  const normalizedPrefix = normalizeComparableContentText(prefix);
  const normalizedText = normalizeComparableContentText(text);
  return Boolean(
    normalizedPrefix &&
      normalizedText &&
      (normalizedText.startsWith(normalizedPrefix) ||
        (() => {
          const compactPrefix = normalizeCompactComparableContentText(prefix);
          const compactText = normalizeCompactComparableContentText(text);
          return (
            compactText.startsWith(compactPrefix) &&
            hasEnoughCompactSignal(compactPrefix, compactText)
          );
        })()),
  );
}

export function isComparableContentTextContainedIn(
  contained: string,
  container: string,
): boolean {
  const normalizedContained = normalizeComparableContentText(contained);
  const normalizedContainer = normalizeComparableContentText(container);
  if (
    normalizedContained &&
    normalizedContainer &&
    normalizedContainer.includes(normalizedContained) &&
    normalizedContained.length >= MIN_COMPACT_EQUIVALENCE_LENGTH
  ) {
    return true;
  }

  const compactContained = normalizeCompactComparableContentText(contained);
  const compactContainer = normalizeCompactComparableContentText(container);
  return Boolean(
    compactContained &&
      compactContainer.includes(compactContained) &&
      hasEnoughCompactSignal(compactContained, compactContainer),
  );
}

export function areComparableContentTextsRelated(
  left: string,
  right: string,
): boolean {
  return (
    areComparableContentTextsEqual(left, right) ||
    isComparableContentTextPrefix(left, right) ||
    isComparableContentTextPrefix(right, left) ||
    isComparableContentTextContainedIn(left, right) ||
    isComparableContentTextContainedIn(right, left)
  );
}

export function readableContentTextScore(text: string): number {
  const normalized = normalizeComparableContentText(text);
  if (!normalized) {
    return 0;
  }

  const whitespaceRuns = normalized.match(/\s+/g)?.length ?? 0;
  const readableAsciiWords = normalized
    .split(/\s+/)
    .filter((word) => /[A-Za-z]/.test(word) && word.length <= 18).length;
  const fusedAsciiRuns = normalized.match(/[A-Za-z]{22,}/g)?.length ?? 0;
  return whitespaceRuns * 2 + readableAsciiWords - fusedAsciiRuns * 6;
}

export function dedupeAdjacentDuplicateParagraphs(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length < 2) {
    return text.trim();
  }

  const deduped: string[] = [];
  for (const paragraph of paragraphs) {
    const previous = deduped[deduped.length - 1];
    if (previous && areComparableContentTextsEqual(previous, paragraph)) {
      continue;
    }
    deduped.push(paragraph);
  }

  return deduped.join("\n\n");
}
