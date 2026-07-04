export function normalizedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeVisibleText(value) {
  return normalizedString(value).replace(/\s+/g, " ");
}

export function normalizeTextForLooseMatch(value) {
  return normalizedString(value)
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?;；:："'“”‘’`()[\]{}<>《》]/g, "")
    .toLowerCase();
}

export function coreImagePromptText(prompt) {
  return normalizedString(prompt)
    .replace(/^@\S+(?:\s+\S+)?\s*/u, "")
    .trim();
}

export function modelIdToVisibleLabel(modelId) {
  const raw = normalizedString(modelId);
  if (!raw) {
    return "";
  }
  const tail = raw.split("/").filter(Boolean).at(-1) || raw;
  return tail
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => {
      if (/^gpt$/i.test(segment)) {
        return "GPT";
      }
      if (/^\d+$/.test(segment)) {
        return segment;
      }
      return `${segment.slice(0, 1).toUpperCase()}${segment
        .slice(1)
        .toLowerCase()}`;
    })
    .join(" ");
}

export function bodyTextContainsForbiddenMarker(text, markers) {
  return markers.filter((marker) => text.includes(marker));
}
