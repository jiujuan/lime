export interface DiagnosticFacadeMeta {
  category?: string;
  command?: string;
  message?: string;
  source?: string;
  status?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function getDiagnosticFacadeMeta(
  value: unknown,
): DiagnosticFacadeMeta | null {
  const ownDiagnostic =
    isRecord(value) && isRecord(value.diagnostic) ? value.diagnostic : null;
  const arrayDiagnosticValue = Array.isArray(value)
    ? (value as unknown[] & { __diagnostic?: unknown }).__diagnostic
    : null;
  const arrayDiagnostic = isRecord(arrayDiagnosticValue)
    ? arrayDiagnosticValue
    : null;
  const diagnostic = ownDiagnostic ?? arrayDiagnostic;

  return diagnostic ? (diagnostic as DiagnosticFacadeMeta) : null;
}

export function assertNotDiagnosticFacade(
  command: string,
  value: unknown,
  currentSurface: string,
): void {
  const diagnostic = getDiagnosticFacadeMeta(value);
  if (!diagnostic) {
    return;
  }

  const source = diagnostic.source || diagnostic.category || "diagnostic";
  throw new Error(
    `${command} 尚未接入${currentSurface}，收到 ${source} 诊断返回。`,
  );
}
