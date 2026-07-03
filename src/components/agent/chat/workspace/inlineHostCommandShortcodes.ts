import { buildDocumentImageTaskSlotMarker } from "@/components/workspace/document/utils/imageTaskPlaceholder";
import {
  extractLevel2Sections,
  normalizeSelectionAnchorText,
} from "@/components/workspace/document/utils/autoImageInsert";

export type InlineHostCommandKey = "image_generate";

export interface InlineHostCommandRequest {
  anchorSectionTitle?: string | null;
  anchorText?: string | null;
  commandKey: InlineHostCommandKey;
  commandName: string;
  prompt: string;
  rawText: string;
  slotId: string;
}

export interface ParseInlineHostCommandShortcodesOptions {
  maxImageCommands?: number;
}

export interface ParseInlineHostCommandShortcodesResult {
  materializedMarkdown: string;
  requests: InlineHostCommandRequest[];
  skippedImageCommandCount: number;
}

interface ShortcodeCandidate {
  endIndexExclusive: number;
  lineIndex: number;
  prompt: string;
  rawText: string;
  startIndex: number;
}

interface ProtectedRange {
  endIndexExclusive: number;
  startIndex: number;
}

const DEFAULT_MAX_IMAGE_COMMANDS = 3;
const IMAGE_COMMAND_NAME = "配图";
const SLOT_ID_PREFIX = "article-image-slot-";
const SLOT_MARKER_RE = /lime:image-task-slot:([A-Za-z0-9._:-]+)/g;

function isFenceStart(line: string): boolean {
  return /^\s*(```|~~~)/.test(line);
}

function isProtectedIndex(ranges: ProtectedRange[], index: number): boolean {
  return ranges.some(
    (range) => index >= range.startIndex && index < range.endIndexExclusive,
  );
}

function findInlineCodeRanges(line: string): ProtectedRange[] {
  const ranges: ProtectedRange[] = [];
  let index = 0;
  while (index < line.length) {
    if (line[index] !== "`") {
      index += 1;
      continue;
    }
    const startIndex = index;
    let tickCount = 1;
    index += 1;
    while (line[index] === "`") {
      tickCount += 1;
      index += 1;
    }
    const closing = line.indexOf("`".repeat(tickCount), index);
    if (closing === -1) {
      ranges.push({ startIndex, endIndexExclusive: line.length });
      break;
    }
    ranges.push({
      startIndex,
      endIndexExclusive: closing + tickCount,
    });
    index = closing + tickCount;
  }
  return ranges;
}

function findMarkdownLinkRanges(line: string): ProtectedRange[] {
  const ranges: ProtectedRange[] = [];
  const pattern = /!?\[[^\]]*]\([^)]+\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    ranges.push({
      startIndex: match.index,
      endIndexExclusive: match.index + match[0].length,
    });
  }
  return ranges;
}

function findShortcodeEnd(line: string, startIndex: number): number {
  let index = startIndex;
  while (index < line.length) {
    if (line[index] === "]") {
      return index;
    }
    index += 1;
  }
  return -1;
}

function readShortcodeCandidate(
  line: string,
  lineIndex: number,
  startIndex: number,
): ShortcodeCandidate | null {
  if (line[startIndex] !== "[" || line[startIndex + 1] !== "@") {
    return null;
  }

  const endIndex = findShortcodeEnd(line, startIndex + 2);
  if (endIndex === -1) {
    return null;
  }

  const inner = line.slice(startIndex + 2, endIndex).trim();
  const commandName = inner.split(/\s+/, 1)[0]?.trim() || "";
  if (commandName !== IMAGE_COMMAND_NAME) {
    return null;
  }

  const prompt = inner.slice(commandName.length).trim();
  if (!prompt) {
    return null;
  }

  return {
    endIndexExclusive: endIndex + 1,
    lineIndex,
    prompt,
    rawText: line.slice(startIndex, endIndex + 1),
    startIndex,
  };
}

function findShortcodesInMarkdown(markdown: string): ShortcodeCandidate[] {
  const lines = markdown.split("\n");
  const candidates: ShortcodeCandidate[] = [];
  let fenced = false;

  lines.forEach((line, lineIndex) => {
    if (isFenceStart(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) {
      return;
    }

    const protectedRanges = [
      ...findInlineCodeRanges(line),
      ...findMarkdownLinkRanges(line),
    ];
    let index = 0;
    while (index < line.length) {
      const startIndex = line.indexOf("[@", index);
      if (startIndex === -1) {
        break;
      }
      if (isProtectedIndex(protectedRanges, startIndex)) {
        index = startIndex + 2;
        continue;
      }
      const candidate = readShortcodeCandidate(line, lineIndex, startIndex);
      if (!candidate) {
        index = startIndex + 2;
        continue;
      }
      candidates.push(candidate);
      index = candidate.endIndexExclusive;
    }
  });

  return candidates;
}

function resolveSectionTitle(
  markdown: string,
  lineIndex: number,
): string | null {
  const section = extractLevel2Sections(markdown).find(
    (item) =>
      lineIndex >= item.headingLineIndex &&
      lineIndex < item.nextHeadingLineIndex,
  );
  return section?.title || null;
}

function resolveAnchorText(markdown: string, lineIndex: number): string | null {
  const lines = markdown.split("\n");
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() || "";
    if (!line || line.startsWith("#") || isFenceStart(line)) {
      continue;
    }
    return normalizeSelectionAnchorText(line);
  }
  return null;
}

function collectExistingSlotIds(markdown: string): Set<string> {
  const slotIds = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = SLOT_MARKER_RE.exec(markdown)) !== null) {
    const slotId = match[1]?.trim();
    if (slotId) {
      slotIds.add(slotId);
    }
  }
  return slotIds;
}

function nextSlotId(usedSlotIds: Set<string>): string {
  const usedIndexes = [...usedSlotIds]
    .map((slotId) =>
      slotId.startsWith(SLOT_ID_PREFIX)
        ? Number.parseInt(slotId.slice(SLOT_ID_PREFIX.length), 10)
        : Number.NaN,
    )
    .filter((index) => Number.isFinite(index) && index > 0);
  let index = usedIndexes.length > 0 ? Math.max(...usedIndexes) + 1 : 1;
  let slotId = `${SLOT_ID_PREFIX}${index}`;
  while (usedSlotIds.has(slotId)) {
    index += 1;
    slotId = `${SLOT_ID_PREFIX}${index}`;
  }
  usedSlotIds.add(slotId);
  return slotId;
}

function assignSlotIds(
  markdown: string,
  candidates: ShortcodeCandidate[],
): string[] {
  const usedSlotIds = collectExistingSlotIds(markdown);
  return candidates.map(() => nextSlotId(usedSlotIds));
}

function materializeShortcodes(
  markdown: string,
  candidates: ShortcodeCandidate[],
  slotIds: string[],
): string {
  const lines = markdown.split("\n");
  candidates
    .map((candidate, index) => ({
      ...candidate,
      marker: buildDocumentImageTaskSlotMarker(slotIds[index] || ""),
    }))
    .sort((left, right) => {
      if (left.lineIndex !== right.lineIndex) {
        return right.lineIndex - left.lineIndex;
      }
      return right.startIndex - left.startIndex;
    })
    .forEach((candidate) => {
      const line = lines[candidate.lineIndex] || "";
      lines[candidate.lineIndex] =
        `${line.slice(0, candidate.startIndex)}${candidate.marker}${line.slice(candidate.endIndexExclusive)}`;
    });
  return lines.join("\n");
}

export function parseInlineHostCommandShortcodes(
  markdown: string,
  options?: ParseInlineHostCommandShortcodesOptions,
): ParseInlineHostCommandShortcodesResult {
  const maxImageCommands =
    options?.maxImageCommands ?? DEFAULT_MAX_IMAGE_COMMANDS;
  if (!markdown.trim() || maxImageCommands <= 0) {
    return {
      materializedMarkdown: markdown,
      requests: [],
      skippedImageCommandCount: 0,
    };
  }

  const candidates = findShortcodesInMarkdown(markdown);
  if (candidates.length === 0) {
    return {
      materializedMarkdown: markdown,
      requests: [],
      skippedImageCommandCount: 0,
    };
  }

  const accepted = candidates.slice(0, maxImageCommands);
  const slotIds = assignSlotIds(markdown, accepted);
  const requests = accepted.map((candidate, index) => {
    const slotId = slotIds[index] || "";
    return {
      anchorSectionTitle: resolveSectionTitle(markdown, candidate.lineIndex),
      anchorText: resolveAnchorText(markdown, candidate.lineIndex),
      commandKey: "image_generate" as const,
      commandName: IMAGE_COMMAND_NAME,
      prompt: candidate.prompt,
      rawText: candidate.rawText,
      slotId,
    };
  });

  return {
    materializedMarkdown: materializeShortcodes(markdown, accepted, slotIds),
    requests,
    skippedImageCommandCount: Math.max(0, candidates.length - accepted.length),
  };
}
