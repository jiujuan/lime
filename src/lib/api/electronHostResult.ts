function isEmptyRecord(value: unknown): value is Record<string, never> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.keys(value).length === 0;
}

export function assertEmptyElectronHostResult(
  command: string,
  value: unknown,
): void {
  if (value === undefined || value === null || isEmptyRecord(value)) {
    return;
  }

  throw new Error(`${command} did not return empty Electron host result`);
}
