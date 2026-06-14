export type CanvasWorkbenchDiffLineType = "context" | "add" | "remove";

export interface CanvasWorkbenchDiffLine {
  type: CanvasWorkbenchDiffLineType;
  value: string;
}

export interface CanvasWorkbenchOmittedDiffLine {
  type: "omitted";
  count: number;
}

export type CanvasWorkbenchDisplayedDiffLine =
  | CanvasWorkbenchDiffLine
  | CanvasWorkbenchOmittedDiffLine;

function splitLines(content: string): string[] {
  if (!content) {
    return [];
  }
  return content.replace(/\r\n/g, "\n").split("\n");
}

export function buildCanvasWorkbenchDiff(
  previousContent: string,
  currentContent: string,
): CanvasWorkbenchDiffLine[] {
  const previousLines = splitLines(previousContent);
  const currentLines = splitLines(currentContent);
  const rowCount = previousLines.length;
  const colCount = currentLines.length;
  const lcs = Array.from({ length: rowCount + 1 }, () =>
    Array<number>(colCount + 1).fill(0),
  );

  for (let row = rowCount - 1; row >= 0; row -= 1) {
    for (let col = colCount - 1; col >= 0; col -= 1) {
      if (previousLines[row] === currentLines[col]) {
        lcs[row][col] = lcs[row + 1][col + 1] + 1;
      } else {
        lcs[row][col] = Math.max(lcs[row + 1][col], lcs[row][col + 1]);
      }
    }
  }

  const diffLines: CanvasWorkbenchDiffLine[] = [];
  let row = 0;
  let col = 0;

  while (row < rowCount && col < colCount) {
    if (previousLines[row] === currentLines[col]) {
      diffLines.push({
        type: "context",
        value: previousLines[row],
      });
      row += 1;
      col += 1;
      continue;
    }

    if (lcs[row + 1][col] >= lcs[row][col + 1]) {
      diffLines.push({
        type: "remove",
        value: previousLines[row],
      });
      row += 1;
      continue;
    }

    diffLines.push({
      type: "add",
      value: currentLines[col],
    });
    col += 1;
  }

  while (row < rowCount) {
    diffLines.push({
      type: "remove",
      value: previousLines[row],
    });
    row += 1;
  }

  while (col < colCount) {
    diffLines.push({
      type: "add",
      value: currentLines[col],
    });
    col += 1;
  }

  return diffLines;
}

export function collapseCanvasWorkbenchDiffContext(
  diffLines: readonly CanvasWorkbenchDiffLine[],
  contextRadius = 3,
): CanvasWorkbenchDisplayedDiffLine[] {
  const changedIndexes = diffLines
    .map((line, index) => (line.type === "context" ? -1 : index))
    .filter((index) => index >= 0);

  if (changedIndexes.length === 0) {
    return [...diffLines];
  }

  const radius = Math.max(0, Math.floor(contextRadius));
  const visibleIndexes = new Set<number>();

  changedIndexes.forEach((index) => {
    for (
      let visibleIndex = Math.max(0, index - radius);
      visibleIndex <= Math.min(diffLines.length - 1, index + radius);
      visibleIndex += 1
    ) {
      visibleIndexes.add(visibleIndex);
    }
  });

  const collapsedLines: CanvasWorkbenchDisplayedDiffLine[] = [];
  let omittedCount = 0;
  const flushOmitted = () => {
    if (omittedCount > 0) {
      collapsedLines.push({ type: "omitted", count: omittedCount });
      omittedCount = 0;
    }
  };

  diffLines.forEach((line, index) => {
    if (line.type === "context" && !visibleIndexes.has(index)) {
      omittedCount += 1;
      return;
    }

    flushOmitted();
    collapsedLines.push(line);
  });

  flushOmitted();
  return collapsedLines;
}
