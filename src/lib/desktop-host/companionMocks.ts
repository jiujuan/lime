export function clearCompanionMocks() {
  return undefined;
}

export const companionMocks: Record<
  string,
  (args?: Record<string, unknown>) => unknown
> = {};
