export function clearSkillForgeMocks(): void {}

export function createSkillForgeMockHandlers(): Record<
  string,
  (args?: Record<string, unknown>) => unknown
> {
  return {};
}

export const skillForgeMocks: Record<
  string,
  (args?: Record<string, unknown>) => unknown
> = {};
