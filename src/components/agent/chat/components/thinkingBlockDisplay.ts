import { parseAIResponse } from "@/components/workspace/a2ui/parser";

export interface ThinkingDisplayParts {
  statusLabel: string;
  body: string;
  preview: string;
}

interface ThinkingDisplayOptions {
  labels?: {
    completed?: string;
    running?: string;
    structuredFallback?: string;
  };
  preserveSourceText?: boolean;
}

type ThinkingDisplayLine =
  | {
      kind: "text";
      raw: string;
      text: string;
    }
  | {
      kind: "blank";
      raw: string;
    };

const SENTENCE_END_CHARS = new Set([
  ".",
  "!",
  "?",
  ";",
  ":",
  "。",
  "！",
  "？",
  "；",
  "：",
]);
const LEADING_PUNCTUATION_CHARS = new Set([
  ",",
  ".",
  ";",
  ":",
  "!",
  "?",
  "，",
  "。",
  "！",
  "？",
  "；",
  "：",
  "、",
  "）",
  ")",
  "]",
  "】",
  "}",
  '"',
  "'",
  "”",
  "’",
]);
const SOFT_FRAGMENT_MARKERS = new Set(["·", "•"]);

function normalizeThinkingSourceText(
  content: string,
  preserveSourceText: boolean,
): string {
  const normalized = collapseExtraBlankLines(
    normalizeLineBreaks(content),
  ).trim();

  if (preserveSourceText) {
    return normalized;
  }

  return collapseFragmentedThinkingProse(normalized);
}

function collapseFragmentedThinkingProse(text: string): string {
  if (!text) {
    return "";
  }

  const output: string[] = [];
  let run: ThinkingDisplayLine[] = [];
  let inCodeFence = false;

  const flushRun = () => {
    if (run.length === 0) {
      return;
    }

    if (shouldCollapseThinkingLineRun(run)) {
      output.push(
        joinThinkingFragments(
          run.flatMap((line) =>
            line.kind === "text" ? [stripSoftFragmentMarker(line.text)] : [],
          ),
        ),
      );
    } else {
      output.push(...run.map((line) => line.raw));
    }

    run = [];
  };

  for (const rawLine of text.split("\n")) {
    const trimmed = rawLine.trim();
    const isCodeFence = isMarkdownCodeFenceLine(trimmed);
    if (inCodeFence) {
      output.push(rawLine);
      if (isCodeFence) {
        inCodeFence = false;
      }
      continue;
    }

    if (!trimmed) {
      if (run.length > 0) {
        run.push({ kind: "blank", raw: rawLine });
      } else {
        output.push(rawLine);
      }
      continue;
    }

    if (isMarkdownStructureLine(trimmed)) {
      flushRun();
      output.push(rawLine);
      if (isCodeFence) {
        inCodeFence = true;
      }
      continue;
    }

    run.push({ kind: "text", raw: rawLine, text: trimmed });
  }

  flushRun();

  return collapseExtraBlankLines(output.join("\n")).trim();
}

function isMarkdownStructureLine(line: string): boolean {
  const markdown = getMarkdownSignificantText(line);
  if (!markdown) {
    return false;
  }

  return (
    isMarkdownHeadingLine(markdown) ||
    isMarkdownBlockQuoteLine(markdown) ||
    isMarkdownListLine(markdown) ||
    isMarkdownCodeFenceLine(markdown) ||
    isMarkdownTableLine(markdown) ||
    isHtmlTagLine(markdown)
  );
}

function isMarkdownCodeFenceLine(line: string): boolean {
  const markdown = getMarkdownSignificantText(line);
  return markdown.startsWith("```") || markdown.startsWith("~~~");
}

function stripSoftFragmentMarker(line: string): string {
  const trimmedStart = line.trimStart();
  const firstChar = trimmedStart[0];
  if (firstChar && SOFT_FRAGMENT_MARKERS.has(firstChar)) {
    return trimmedStart.slice(firstChar.length).trim();
  }
  return line.trim();
}

function shouldCollapseThinkingLineRun(run: ThinkingDisplayLine[]): boolean {
  const textLines = run.flatMap((line) =>
    line.kind === "text" ? [stripSoftFragmentMarker(line.text)] : [],
  );
  if (textLines.length < 2) {
    return false;
  }

  const fragmentCount = textLines.filter(isThinkingFragmentLine).length;
  if (textLines.length >= 4) {
    return fragmentCount >= Math.ceil(textLines.length * 0.5);
  }

  return fragmentCount === textLines.length;
}

function isThinkingFragmentLine(line: string): boolean {
  if (!line) {
    return false;
  }
  if (startsWithLeadingPunctuation(line)) {
    return true;
  }
  if (line.length <= 12) {
    return true;
  }
  return line.length <= 28 && !endsWithSentencePunctuation(line);
}

function joinThinkingFragments(fragments: string[]): string {
  return fragments.reduce((joined, fragment) => {
    if (!joined) {
      return fragment;
    }
    if (!fragment) {
      return joined;
    }
    return `${joined}${resolveThinkingFragmentSeparator(joined, fragment)}${fragment}`;
  }, "");
}

function resolveThinkingFragmentSeparator(left: string, right: string): string {
  if (startsWithLeadingPunctuation(right) || endsWithWhitespace(left)) {
    return "";
  }
  if (endsWithAsciiDigit(left) && startsWithAsciiDigit(right)) {
    return "";
  }
  if (endsWithAsciiWordChar(left) && startsWithAsciiWordChar(right)) {
    return " ";
  }
  return "";
}

function getMarkdownSignificantText(line: string): string {
  const trimmedStart = line.trimStart();
  const indentLength = line.length - trimmedStart.length;
  return indentLength <= 3 ? trimmedStart : "";
}

function isMarkdownHeadingLine(line: string): boolean {
  let hashCount = 0;
  while (line[hashCount] === "#" && hashCount < 6) {
    hashCount += 1;
  }
  return hashCount > 0 && line[hashCount] === " ";
}

function isMarkdownBlockQuoteLine(line: string): boolean {
  return line === ">" || line.startsWith("> ");
}

function isMarkdownListLine(line: string): boolean {
  if (isMarkdownBulletLine(line)) {
    return true;
  }
  return isMarkdownOrderedListLine(line);
}

function isMarkdownBulletLine(line: string): boolean {
  const marker = line[0];
  return (
    (marker === "-" || marker === "*" || marker === "+") && line[1] === " "
  );
}

function isMarkdownOrderedListLine(line: string): boolean {
  let index = 0;
  while (index < line.length && isAsciiDigit(line[index] || "")) {
    index += 1;
  }
  if (index === 0) {
    return false;
  }
  const marker = line[index];
  return (marker === "." || marker === ")") && line[index + 1] === " ";
}

function isMarkdownTableLine(line: string): boolean {
  return line.startsWith("|") && line.indexOf("|", 1) >= 0;
}

function isHtmlTagLine(line: string): boolean {
  if (!line.startsWith("<")) {
    return false;
  }
  const nameStartIndex = line[1] === "/" ? 2 : 1;
  return isAsciiLetter(line[nameStartIndex] || "");
}

function startsWithLeadingPunctuation(value: string): boolean {
  const firstChar = value.trimStart()[0];
  return Boolean(firstChar && LEADING_PUNCTUATION_CHARS.has(firstChar));
}

function endsWithSentencePunctuation(value: string): boolean {
  const lastChar = value.trimEnd().at(-1);
  return Boolean(lastChar && SENTENCE_END_CHARS.has(lastChar));
}

function endsWithWhitespace(value: string): boolean {
  const lastChar = value.at(-1);
  return Boolean(lastChar && lastChar.trim() === "");
}

function startsWithAsciiWordChar(value: string): boolean {
  const firstChar = value[0];
  return Boolean(firstChar && isAsciiWordChar(firstChar));
}

function endsWithAsciiWordChar(value: string): boolean {
  const lastChar = value.at(-1);
  return Boolean(lastChar && isAsciiWordChar(lastChar));
}

function startsWithAsciiDigit(value: string): boolean {
  const firstChar = value[0];
  return Boolean(firstChar && isAsciiDigit(firstChar));
}

function endsWithAsciiDigit(value: string): boolean {
  const lastChar = value.at(-1);
  return Boolean(lastChar && isAsciiDigit(lastChar));
}

function isAsciiWordChar(char: string): boolean {
  return isAsciiDigit(char) || isAsciiLetter(char);
}

function isAsciiDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isAsciiLetter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function normalizeLineBreaks(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function collapseExtraBlankLines(value: string): string {
  let collapsed = "";
  let newlineRun = 0;

  for (const char of value) {
    if (char === "\n") {
      newlineRun += 1;
      if (newlineRun <= 2) {
        collapsed += char;
      }
      continue;
    }

    newlineRun = 0;
    collapsed += char;
  }

  return collapsed;
}

export function resolveThinkingDisplayParts(
  content: string,
  isStreaming: boolean,
  options: ThinkingDisplayOptions = {},
): ThinkingDisplayParts {
  const trimmed = normalizeThinkingSourceText(
    content,
    Boolean(options.preserveSourceText),
  );
  const statusLabel = isStreaming
    ? options.labels?.running || "思考中"
    : options.labels?.completed || "已完成思考";

  if (!trimmed) {
    return {
      statusLabel,
      body: "",
      preview: "",
    };
  }

  const parsed = parseAIResponse(trimmed, false);
  if (!parsed.hasA2UI && !parsed.hasPending) {
    const preview = isStreaming
      ? ""
      : trimmed
          .split("\n")
          .map((line) => line.trim())
          .find(Boolean) || "";
    return {
      statusLabel,
      body: trimmed,
      preview,
    };
  }

  const fallbackPreview =
    trimmed
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ||
    options.labels?.structuredFallback ||
    "在整理结构化内容";
  return {
    statusLabel,
    body: fallbackPreview,
    preview: fallbackPreview,
  };
}
