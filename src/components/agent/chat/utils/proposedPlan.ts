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

  return lines
    .map(stripPlanMarker)
    .filter((text) => text.length > 0)
    .map((text, index) => ({
      text,
      status: index === 0 ? "in_progress" : "pending",
    }));
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
