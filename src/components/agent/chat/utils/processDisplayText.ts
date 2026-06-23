export function normalizeProcessDisplayText(value?: string | null): string {
  return (value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
