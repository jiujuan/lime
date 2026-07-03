const PLACEHOLDER_RE =
  /REPLACE_WITH|<[^>]+>|YOUR_|TODO_|TBD|BASE64_SIGNATURE|PUBLIC_KEY|64_HEX/i;

export function contentFactorySignedReleaseHasPlaceholder(value) {
  return contentFactorySignedReleasePlaceholderSamples(value).length > 0;
}

export function contentFactorySignedReleasePlaceholderSamples(value) {
  const samples = [];
  visit(value, (item) => {
    if (samples.length >= 8 || typeof item !== "string") {
      return;
    }
    if (PLACEHOLDER_RE.test(item)) {
      samples.push(item.length > 160 ? `${item.slice(0, 160)}...` : item);
    }
  });
  return samples;
}

function visit(value, onValue, seen = new Set()) {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value !== "object") {
    onValue(value);
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  const values = Array.isArray(value) ? value : Object.values(value);
  for (const item of values) {
    visit(item, onValue, seen);
  }
}
