export interface ProposedPlanTextSegment {
  type: "text";
  content: string;
}

export interface ProposedPlanBlockSegment {
  type: "plan";
  content: string;
  isComplete: boolean;
}

export interface ProposedPlanItem {
  text: string;
  status: "pending" | "in_progress" | "completed";
}

export type ProposedPlanSegment =
  | ProposedPlanTextSegment
  | ProposedPlanBlockSegment;

const OPEN_TAG = "<proposed_plan>";
const CLOSE_TAG = "</proposed_plan>";

function pushTextSegment(
  segments: ProposedPlanSegment[],
  content: string,
): void {
  if (!content) {
    return;
  }

  const previous = segments[segments.length - 1];
  if (previous?.type === "text") {
    previous.content += content;
    return;
  }

  segments.push({
    type: "text",
    content,
  });
}

export function splitProposedPlanSegments(text: string): ProposedPlanSegment[] {
  if (!text.includes(OPEN_TAG)) {
    return text ? [{ type: "text", content: text }] : [];
  }

  const segments: ProposedPlanSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const openIndex = text.indexOf(OPEN_TAG, cursor);
    if (openIndex === -1) {
      pushTextSegment(segments, text.slice(cursor));
      break;
    }

    pushTextSegment(segments, text.slice(cursor, openIndex));

    const planStart = openIndex + OPEN_TAG.length;
    const closeIndex = text.indexOf(CLOSE_TAG, planStart);

    if (closeIndex === -1) {
      segments.push({
        type: "plan",
        content: normalizePlanText(text.slice(planStart)).trim(),
        isComplete: false,
      });
      break;
    }

    segments.push({
      type: "plan",
      content: normalizePlanText(text.slice(planStart, closeIndex)).trim(),
      isComplete: true,
    });
    cursor = closeIndex + CLOSE_TAG.length;
  }

  return segments.filter((segment) =>
    segment.type === "text"
      ? segment.content.trim().length > 0
      : segment.content.length > 0,
  );
}

export function stripProposedPlanBlocks(text: string): string {
  return splitProposedPlanSegments(text)
    .filter((segment) => segment.type === "text")
    .map((segment) => segment.content)
    .join("")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function normalizePlanText(text: string): string {
  return text.includes("\\n") ? text.replace(/\\n/g, "\n") : text;
}

function stripPlanMarker(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^\s*\[[ xX-]\]\s+/, "")
    .trim();
}

function readPlanItemStatus(
  line: string,
): ProposedPlanItem["status"] | undefined {
  const withoutListMarker = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
  const checkboxMatch = withoutListMarker.match(/^\s*\[([ xX-])\]\s+/);
  if (!checkboxMatch) {
    return undefined;
  }

  const marker = checkboxMatch[1];
  if (marker === "x" || marker === "X") {
    return "completed";
  }
  if (marker === "-") {
    return "in_progress";
  }
  return "pending";
}

function promoteNextPendingPlanItem(
  items: ProposedPlanItem[],
): ProposedPlanItem[] {
  if (items.some((item) => item.status === "in_progress")) {
    return items;
  }

  const nextPendingIndex = items.findIndex((item) => item.status === "pending");
  if (nextPendingIndex < 0) {
    return items;
  }

  return items.map((item, index) =>
    index === nextPendingIndex ? { ...item, status: "in_progress" } : item,
  );
}

export function parseProposedPlanItems(content: string): ProposedPlanItem[] {
  const normalized = normalizePlanText(content);
  const rawLines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidateLines = rawLines.filter((line) =>
    /^\s*(?:[-*+]|\d+[.)])\s+/.test(line),
  );
  const lines =
    candidateLines.length > 0 && candidateLines.length === rawLines.length
      ? candidateLines
      : rawLines;

  const items = lines
    .map((line) => ({
      text: stripPlanMarker(line),
      status: readPlanItemStatus(line) ?? "pending",
    }))
    .filter((item) => item.text.length > 0);

  return promoteNextPendingPlanItem(items);
}

export function extractLatestProposedPlanItems(
  text: string | null | undefined,
): ProposedPlanItem[] {
  if (!text) {
    return [];
  }
  const planSegments = splitProposedPlanSegments(text).filter(
    (segment): segment is ProposedPlanBlockSegment => segment.type === "plan",
  );
  const latestPlan = planSegments.at(-1);
  return latestPlan ? parseProposedPlanItems(latestPlan.content) : [];
}
